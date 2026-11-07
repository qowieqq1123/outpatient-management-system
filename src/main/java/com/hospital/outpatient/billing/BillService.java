package com.hospital.outpatient.billing;

import com.hospital.outpatient.auth.AuthUser;
import com.hospital.outpatient.audit.AuditService;
import com.hospital.outpatient.common.BizCode;
import com.hospital.outpatient.common.BizException;
import com.hospital.outpatient.prescription.CheckupOrderRepository;
import com.hospital.outpatient.prescription.Prescription;
import com.hospital.outpatient.prescription.PrescriptionRepository;
import com.hospital.outpatient.registration.Patient;
import com.hospital.outpatient.visit.Visit;
import com.hospital.outpatient.visit.VisitRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

@Service
public class BillService {

    private final FeeBillRepository billRepository;
    private final FeeItemRepository feeItemRepository;
    private final InsuranceSettlementRepository settlementRepository;
    private final RefundRecordRepository refundRepository;
    private final PrescriptionRepository prescriptionRepository;
    private final CheckupOrderRepository checkupOrderRepository;
    private final VisitRepository visitRepository;
    private final InsuranceGateway insuranceGateway;
    private final AuditService auditService;

    public BillService(FeeBillRepository billRepository,
                       FeeItemRepository feeItemRepository,
                       InsuranceSettlementRepository settlementRepository,
                       RefundRecordRepository refundRepository,
                       PrescriptionRepository prescriptionRepository,
                       CheckupOrderRepository checkupOrderRepository,
                       VisitRepository visitRepository,
                       InsuranceGateway insuranceGateway,
                       AuditService auditService) {
        this.billRepository = billRepository;
        this.feeItemRepository = feeItemRepository;
        this.settlementRepository = settlementRepository;
        this.refundRepository = refundRepository;
        this.prescriptionRepository = prescriptionRepository;
        this.checkupOrderRepository = checkupOrderRepository;
        this.visitRepository = visitRepository;
        this.insuranceGateway = insuranceGateway;
        this.auditService = auditService;
    }

    @Transactional
    public BillView price(Long visitId, AuthUser cashier) {
        Visit visit = visitRepository.findById(visitId)
                .orElseThrow(() -> new BizException(BizCode.NOT_FOUND, "就诊记录不存在"));
        FeeBill existing = billRepository.findFirstByVisitAndStatusIn(visit, List.of("UNPAID", "RETRY"))
                .orElse(null);
        if (existing != null) {
            return detail(existing.getBillId());
        }

        List<Prescription> prescriptions = prescriptionRepository.findByVisitWithDetails(visit).stream()
                .filter(item -> "PENDING_FEE".equals(item.getStatus()))
                .toList();
        var checkups = checkupOrderRepository.findByVisitWithDetails(visit).stream()
                .filter(item -> "PENDING_FEE".equals(item.getStatus()))
                .toList();

        BigDecimal total = BigDecimal.ZERO;
        List<FeeItem> feeItems = new ArrayList<>();
        for (Prescription prescription : prescriptions) {
            total = total.add(prescription.getTotalAmount());
            feeItems.add(FeeItem.builder()
                    .sourceType("PRESCRIPTION")
                    .sourceId(prescription.getPrescriptionId())
                    .itemName("处方 " + prescription.getPrescriptionId())
                    .amount(prescription.getTotalAmount())
                    .build());
        }
        for (var checkup : checkups) {
            total = total.add(checkup.getPrice());
            feeItems.add(FeeItem.builder()
                    .sourceType("CHECKUP")
                    .sourceId(checkup.getCheckupId())
                    .itemName(checkup.getItemName())
                    .amount(checkup.getPrice())
                    .build());
        }
        if (!Boolean.TRUE.equals(visit.getRegistration().getFeePaid())) {
            total = total.add(visit.getRegistration().getRegistrationFee());
            feeItems.add(FeeItem.builder()
                    .sourceType("REGISTRATION")
                    .sourceId(visit.getRegistration().getRegId())
                    .itemName("挂号费")
                    .amount(visit.getRegistration().getRegistrationFee())
                    .build());
        }
        if (total.compareTo(BigDecimal.ZERO) <= 0) {
            throw new BizException(BizCode.RULE_CONFLICT, "当前就诊没有待收费项目");
        }

        FeeBill bill = FeeBill.builder()
                .visit(visit)
                .patient(visit.getPatient())
                .totalAmount(total)
                .paidAmount(BigDecimal.ZERO)
                .selfAmount(BigDecimal.ZERO)
                .insuranceAmount(BigDecimal.ZERO)
                .status("UNPAID")
                .build();
        bill = billRepository.saveAndFlush(bill);
        for (FeeItem item : feeItems) {
            item.setBill(bill);
            feeItemRepository.saveAndFlush(item);
        }
        auditService.write(cashier, "BILL_PRICE", "BILL", bill.getBillId().toString(),
                "visitId=" + visitId + ",total=" + total);
        return BillView.from(bill, feeItems, List.of());
    }

    @Transactional
    public BillView pay(BillingController.PayRequest request, AuthUser cashier) {
        FeeBill bill = billRepository.findWithLockById(request.billId())
                .orElseThrow(() -> new BizException(BizCode.NOT_FOUND, "收费单不存在"));
        if (!"UNPAID".equals(bill.getStatus()) && !"RETRY".equals(bill.getStatus())) {
            throw new BizException(BizCode.RULE_CONFLICT, "收费单当前状态不允许收款");
        }
        if ("SELF".equalsIgnoreCase(request.payType())) {
            BigDecimal paid = request.paidAmount() == null ? bill.getTotalAmount() : request.paidAmount();
            if (paid.compareTo(bill.getTotalAmount()) < 0) {
                throw new BizException(BizCode.RULE_CONFLICT, "实收金额不能小于应收金额");
            }
            bill.setPaidAmount(paid);
            bill.setSelfAmount(bill.getTotalAmount());
            bill.setInsuranceAmount(BigDecimal.ZERO);
            bill.setPayType("SELF");
            bill.setStatus("PAID");
            bill.setCashierId(cashier.getUserId());
            bill.setPayTime(LocalDateTime.now());
            markSourcesPaid(bill);
            auditService.write(cashier, "CHARGE_PAY", "BILL", bill.getBillId().toString(),
                    "payType=SELF,total=" + bill.getTotalAmount());
            return detail(bill.getBillId());
        }
        if (!"INSURANCE".equalsIgnoreCase(request.payType())) {
            throw new BizException(BizCode.RULE_CONFLICT, "支付方式只支持 SELF 或 INSURANCE");
        }
        if (!"INS".equals(bill.getPatient().getInsuranceType())) {
            throw new BizException(BizCode.RULE_CONFLICT, "患者不是医保患者");
        }
        InsuranceGateway.InsuranceResult result = insuranceGateway.settle(
                bill.getPatient().getInsuranceNo(), bill.getTotalAmount(), bill.getBillId());
        InsuranceSettlement settlement = InsuranceSettlement.builder()
                .bill(bill)
                .insuranceNo(bill.getPatient().getInsuranceNo())
                .totalAmount(bill.getTotalAmount())
                .fundAmount(result.fundAmount())
                .selfAmount(result.selfAmount())
                .status(result.success() ? "SUCCESS" : "FAILED")
                .tradeNo(result.tradeNo())
                .errorMsg(result.errorMessage())
                .retryCount(settlementRepository.findByBillOrderBySettlementId(bill).size() + 1)
                .responseTime(LocalDateTime.now())
                .build();
        settlementRepository.saveAndFlush(settlement);
        if (!result.success()) {
            bill.setStatus("RETRY");
            bill.setPayType("INSURANCE");
            bill.setRemark(result.errorMessage());
            auditService.write(cashier, "INSURANCE_SETTLE_FAILED", "BILL", bill.getBillId().toString(),
                    result.errorCode() + ":" + result.errorMessage());
            return detail(bill.getBillId());
        }
        bill.setPaidAmount(bill.getTotalAmount());
        bill.setSelfAmount(result.selfAmount());
        bill.setInsuranceAmount(result.fundAmount());
        bill.setPayType("INSURANCE");
        bill.setStatus("PAID");
        bill.setCashierId(cashier.getUserId());
        bill.setPayTime(LocalDateTime.now());
        markSourcesPaid(bill);
        auditService.write(cashier, "INSURANCE_SETTLE_SUCCESS", "BILL", bill.getBillId().toString(),
                "fund=" + result.fundAmount() + ",self=" + result.selfAmount());
        return detail(bill.getBillId());
    }

    @Transactional
    public BillView refund(BillingController.RefundRequest request, AuthUser cashier) {
        FeeBill bill = billRepository.findWithLockById(request.billId())
                .orElseThrow(() -> new BizException(BizCode.NOT_FOUND, "收费单不存在"));
        if (!"PAID".equals(bill.getStatus())) {
            throw new BizException(BizCode.RULE_CONFLICT, "只有已收费的收费单可以退费");
        }
        bill.setStatus("REFUNDED");
        RefundRecord refund = RefundRecord.builder()
                .bill(bill)
                .regId(bill.getVisit().getRegistration().getRegId())
                .patient(bill.getPatient())
                .refundAmount(bill.getPaidAmount())
                .refundType("FEE")
                .reason(request.reason())
                .operatorId(cashier.getUserId())
                .status("DONE")
                .build();
        refundRepository.saveAndFlush(refund);
        auditService.write(cashier, "BILL_REFUND", "BILL", bill.getBillId().toString(),
                "amount=" + bill.getPaidAmount() + ",reason=" + request.reason());
        return detail(bill.getBillId());
    }

    @Transactional(readOnly = true)
    public BillView detail(Long billId) {
        FeeBill bill = billRepository.findById(billId)
                .orElseThrow(() -> new BizException(BizCode.NOT_FOUND, "收费单不存在"));
        return toView(bill);
    }

    @Transactional(readOnly = true)
    public BillView detail(Long billId, AuthUser user) {
        FeeBill bill = billRepository.findById(billId)
                .orElseThrow(() -> new BizException(BizCode.NOT_FOUND, "收费单不存在"));
        if ("PATIENT".equals(user.getRoleCode())
                && (user.getRefId() == null || !user.getRefId().equals(bill.getPatient().getPatientId()))) {
            throw new BizException(BizCode.FORBIDDEN, "无权查看其他患者的收费单");
        }
        return toView(bill);
    }

    private BillView toView(FeeBill bill) {
        return BillView.from(bill,
                feeItemRepository.findByBillOrderByFeeItemId(bill),
                settlementRepository.findByBillOrderBySettlementId(bill));
    }

    @Transactional(readOnly = true)
    public List<BillView> listByPatient(AuthUser user) {
        if (user.getRefId() == null) {
            throw new BizException(BizCode.FORBIDDEN, "当前账号未绑定患者档案");
        }
        Patient patient = new Patient();
        patient.setPatientId(user.getRefId());
        return billRepository.findByPatientWithDetails(patient).stream()
                .map(bill -> detail(bill.getBillId()))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<BillView> workbench(String status) {
        String normalized = status == null || status.isBlank() || "ALL".equalsIgnoreCase(status)
                ? null : status.toUpperCase();
        if (normalized != null && !Set.of("UNPAID", "PAID", "RETRY", "REFUNDED").contains(normalized)) {
            throw new BizException(400, "收费单状态不合法");
        }
        return billRepository.findWorkbench(normalized).stream()
                .map(bill -> detail(bill.getBillId()))
                .toList();
    }

    private void markSourcesPaid(FeeBill bill) {
        Visit visit = bill.getVisit();
        prescriptionRepository.findByVisitWithDetails(visit).stream()
                .filter(item -> "PENDING_FEE".equals(item.getStatus()))
                .forEach(item -> item.setStatus("PAID"));
        checkupOrderRepository.findByVisitWithDetails(visit).stream()
                .filter(item -> "PENDING_FEE".equals(item.getStatus()))
                .forEach(item -> item.setStatus("PAID"));
        if (!Boolean.TRUE.equals(visit.getRegistration().getFeePaid())) {
            visit.getRegistration().setFeePaid(true);
        }
    }
}
