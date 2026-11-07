package com.hospital.outpatient.prescription;

import com.hospital.outpatient.auth.AuthUser;
import com.hospital.outpatient.audit.AuditService;
import com.hospital.outpatient.common.BizCode;
import com.hospital.outpatient.common.BizException;
import com.hospital.outpatient.visit.Visit;
import com.hospital.outpatient.visit.VisitRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

@Service
public class PrescriptionService {

    private final PrescriptionRepository prescriptionRepository;
    private final MedicineRepository medicineRepository;
    private final CheckupCatalogRepository checkupCatalogRepository;
    private final CheckupOrderRepository checkupOrderRepository;
    private final VisitRepository visitRepository;
    private final AuditService auditService;

    public PrescriptionService(PrescriptionRepository prescriptionRepository,
                               MedicineRepository medicineRepository,
                               CheckupCatalogRepository checkupCatalogRepository,
                               CheckupOrderRepository checkupOrderRepository,
                               VisitRepository visitRepository,
                               AuditService auditService) {
        this.prescriptionRepository = prescriptionRepository;
        this.medicineRepository = medicineRepository;
        this.checkupCatalogRepository = checkupCatalogRepository;
        this.checkupOrderRepository = checkupOrderRepository;
        this.visitRepository = visitRepository;
        this.auditService = auditService;
    }

    @Transactional
    public PrescriptionView create(PrescriptionController.PrescriptionRequest request, AuthUser doctor) {
        Visit visit = visitRepository.findById(request.visitId())
                .orElseThrow(() -> new BizException(BizCode.NOT_FOUND, "就诊记录不存在"));
        if (doctor.getRefId() == null || !doctor.getRefId().equals(visit.getDoctor().getDoctorId())) {
            throw new BizException(BizCode.FORBIDDEN, "只能为自己接诊的患者开处方");
        }
        if (!"IN_TREATMENT".equals(visit.getStatus())) {
            throw new BizException(BizCode.RULE_CONFLICT, "就诊已结束，不能再开处方");
        }

        Prescription prescription = Prescription.builder()
                .visit(visit)
                .patient(visit.getPatient())
                .doctor(visit.getDoctor())
                .category("NORMAL")
                .status("PENDING_FEE")
                .totalAmount(BigDecimal.ZERO)
                .build();
        prescription = prescriptionRepository.saveAndFlush(prescription);

        List<PrescriptionItem> items = new ArrayList<>();
        BigDecimal total = BigDecimal.ZERO;
        for (PrescriptionController.PrescriptionItemRequest itemRequest : request.items()) {
            Medicine medicine = medicineRepository.findWithLockById(itemRequest.medicineId())
                    .orElseThrow(() -> new BizException(BizCode.NOT_FOUND, "药品不存在"));
            if (medicine.getStockQty() < itemRequest.quantity()) {
                throw new BizException(BizCode.RULE_CONFLICT,
                        "药品「" + medicine.getName() + "」库存不足，请调整处方");
            }
            BigDecimal amount = medicine.getPrice().multiply(BigDecimal.valueOf(itemRequest.quantity()));
            PrescriptionItem item = PrescriptionItem.builder()
                    .prescription(prescription)
                    .medicine(medicine)
                    .medicineName(medicine.getName())
                    .quantity(itemRequest.quantity())
                    .unitPrice(medicine.getPrice())
                    .amount(amount)
                    .usageText(itemRequest.usageText())
                    .build();
            items.add(item);
            total = total.add(amount);
            if ("PSYCHO".equals(medicine.getCategory())) {
                prescription.setCategory("PSYCHO");
            }
        }
        prescription.getItems().addAll(items);
        prescription.setTotalAmount(total);
        prescriptionRepository.saveAndFlush(prescription);
        auditService.write(doctor, "PRESCRIPTION_CREATE", "PRESCRIPTION",
                prescription.getPrescriptionId().toString(),
                "visitId=" + request.visitId() + ",items=" + items.size() + ",total=" + total);
        return PrescriptionView.from(prescription);
    }

    @Transactional
    public CheckupView createCheckup(PrescriptionController.CheckupRequest request, AuthUser doctor) {
        Visit visit = visitRepository.findById(request.visitId())
                .orElseThrow(() -> new BizException(BizCode.NOT_FOUND, "就诊记录不存在"));
        if (doctor.getRefId() == null || !doctor.getRefId().equals(visit.getDoctor().getDoctorId())) {
            throw new BizException(BizCode.FORBIDDEN, "只能为自己接诊的患者开检查单");
        }
        if (!"IN_TREATMENT".equals(visit.getStatus())) {
            throw new BizException(BizCode.RULE_CONFLICT, "就诊已结束，不能再开检查单");
        }
        CheckupCatalog catalog = checkupCatalogRepository.findById(request.itemCode())
                .orElseThrow(() -> new BizException(BizCode.NOT_FOUND, "检查项目不存在"));
        if (!Boolean.TRUE.equals(catalog.getEnabled())) {
            throw new BizException(BizCode.RULE_CONFLICT, "检查项目已停用");
        }
        CheckupOrder order = CheckupOrder.builder()
                .visit(visit)
                .patient(visit.getPatient())
                .doctor(visit.getDoctor())
                .itemCode(catalog.getItemCode())
                .itemName(catalog.getItemName())
                .price(catalog.getPrice())
                .status("PENDING_FEE")
                .build();
        order = checkupOrderRepository.saveAndFlush(order);
        auditService.write(doctor, "CHECKUP_CREATE", "CHECKUP_ORDER",
                order.getCheckupId().toString(), "visitId=" + request.visitId() + ",item=" + request.itemCode());
        return CheckupView.from(order);
    }

    @Transactional(readOnly = true)
    public List<PrescriptionView> listByVisit(Long visitId, AuthUser user) {
        Visit visit = visitRepository.findById(visitId)
                .orElseThrow(() -> new BizException(BizCode.NOT_FOUND, "就诊记录不存在"));
        checkVisitReadPermission(visit, user);
        return prescriptionRepository.findByVisitWithDetails(visit).stream()
                .map(PrescriptionView::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<PrescriptionView> workbench(String status, AuthUser user) {
        String normalized = status == null || status.isBlank() || "ALL".equalsIgnoreCase(status)
                ? null : status.toUpperCase();
        if (normalized != null && !Set.of("PENDING_FEE", "PAID", "APPROVED", "DISPENSED", "RETURNED", "CANCELLED")
                .contains(normalized)) {
            throw new BizException(400, "处方状态不合法");
        }
        return prescriptionRepository.findWorkbench(normalized).stream()
                .filter(item -> canReadPrescription(item, user))
                .map(PrescriptionView::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<CheckupCatalog> enabledCheckupCatalog() {
        return checkupCatalogRepository.findByEnabledTrueOrderByItemCode();
    }

    private void checkVisitReadPermission(Visit visit, AuthUser user) {
        if (user == null) {
            return;
        }
        if ("PATIENT".equals(user.getRoleCode())
                && (user.getRefId() == null || !user.getRefId().equals(visit.getPatient().getPatientId()))) {
            throw new BizException(BizCode.FORBIDDEN, "无权查看其他患者的处方");
        }
        if ("DOCTOR".equals(user.getRoleCode())
                && (user.getRefId() == null || !user.getRefId().equals(visit.getDoctor().getDoctorId()))) {
            throw new BizException(BizCode.FORBIDDEN, "无权查看其他医生接诊的处方");
        }
    }

    private boolean canReadPrescription(Prescription prescription, AuthUser user) {
        if (user == null || !"DOCTOR".equals(user.getRoleCode())) {
            return true;
        }
        return user.getRefId() != null && user.getRefId().equals(prescription.getDoctor().getDoctorId());
    }
}
