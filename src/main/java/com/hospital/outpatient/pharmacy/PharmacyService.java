package com.hospital.outpatient.pharmacy;

import com.hospital.outpatient.auth.AuthUser;
import com.hospital.outpatient.audit.AuditService;
import com.hospital.outpatient.common.BizCode;
import com.hospital.outpatient.common.BizException;
import com.hospital.outpatient.prescription.Medicine;
import com.hospital.outpatient.prescription.MedicineRepository;
import com.hospital.outpatient.prescription.Prescription;
import com.hospital.outpatient.prescription.PrescriptionRepository;
import com.hospital.outpatient.prescription.PrescriptionView;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class PharmacyService {

    private final PrescriptionRepository prescriptionRepository;
    private final MedicineRepository medicineRepository;
    private final DispenseRecordRepository dispenseRecordRepository;
    private final AuditService auditService;

    public PharmacyService(PrescriptionRepository prescriptionRepository,
                           MedicineRepository medicineRepository,
                           DispenseRecordRepository dispenseRecordRepository,
                           AuditService auditService) {
        this.prescriptionRepository = prescriptionRepository;
        this.medicineRepository = medicineRepository;
        this.dispenseRecordRepository = dispenseRecordRepository;
        this.auditService = auditService;
    }

    @Transactional
    public PrescriptionView audit(Long prescriptionId, AuthUser pharmacist) {
        Prescription prescription = prescriptionRepository.findWithLockById(prescriptionId)
                .orElseThrow(() -> new BizException(BizCode.NOT_FOUND, "处方不存在"));
        if (!"PAID".equals(prescription.getStatus())) {
            throw new BizException(BizCode.RULE_CONFLICT, "只有已收费的处方可以审核");
        }
        prescription.setStatus("APPROVED");
        prescription.setAuditPharmacist(pharmacist.getRealName());
        prescription.setAuditTime(LocalDateTime.now());
        prescription.setFirstSigner(pharmacist.getUsername());
        auditService.write(pharmacist, "PRESCRIPTION_AUDIT", "PRESCRIPTION",
                prescriptionId.toString(), "status=APPROVED");
        return PrescriptionView.from(prescription);
    }

    @Transactional
    public PrescriptionView secondSign(Long prescriptionId, AuthUser pharmacist) {
        Prescription prescription = prescriptionRepository.findWithLockById(prescriptionId)
                .orElseThrow(() -> new BizException(BizCode.NOT_FOUND, "处方不存在"));
        if (!"APPROVED".equals(prescription.getStatus())) {
            throw new BizException(BizCode.RULE_CONFLICT, "处方尚未审核通过，不能第二签字");
        }
        if (!"PSYCHO".equals(prescription.getCategory())) {
            throw new BizException(BizCode.RULE_CONFLICT, "普通处方不需要第二签字");
        }
        if (pharmacist.getUsername().equals(prescription.getFirstSigner())) {
            throw new BizException(BizCode.RULE_CONFLICT, "精神类处方必须由不同账号双人签字");
        }
        prescription.setSecondSigner(pharmacist.getUsername());
        auditService.write(pharmacist, "PRESCRIPTION_SECOND_SIGN", "PRESCRIPTION",
                prescriptionId.toString(), "secondSigner=" + pharmacist.getUsername());
        return PrescriptionView.from(prescription);
    }

    @Transactional
    public PrescriptionView dispense(Long prescriptionId, AuthUser pharmacist) {
        Prescription prescription = prescriptionRepository.findWithLockById(prescriptionId)
                .orElseThrow(() -> new BizException(BizCode.NOT_FOUND, "处方不存在"));
        if (!"APPROVED".equals(prescription.getStatus())) {
            throw new BizException(BizCode.RULE_CONFLICT, "处方未审核通过，不能发药");
        }
        if ("PSYCHO".equals(prescription.getCategory())
                && (prescription.getSecondSigner() == null
                || prescription.getSecondSigner().isBlank()
                || prescription.getSecondSigner().equals(prescription.getFirstSigner()))) {
            throw new BizException(BizCode.RULE_CONFLICT, "精神类处方缺少第二签字，不能发药");
        }
        for (var item : prescription.getItems()) {
            Medicine medicine = medicineRepository.findWithLockById(item.getMedicine().getMedicineId())
                    .orElseThrow(() -> new BizException(BizCode.NOT_FOUND, "药品不存在"));
            if (medicine.getStockQty() < item.getQuantity()) {
                throw new BizException(BizCode.RULE_CONFLICT,
                        "药品「" + medicine.getName() + "」库存不足，发药已中止");
            }
            medicine.setStockQty(medicine.getStockQty() - item.getQuantity());
            medicineRepository.saveAndFlush(medicine);
            DispenseRecord record = DispenseRecord.builder()
                    .prescription(prescription)
                    .medicine(medicine)
                    .quantity(item.getQuantity())
                    .bizType("DISPENSE")
                    .operatorId(pharmacist.getUserId())
                    .secondSigner(prescription.getSecondSigner())
                    .build();
            dispenseRecordRepository.saveAndFlush(record);
        }
        prescription.setStatus("DISPENSED");
        prescription.setDispensePharmacist(pharmacist.getRealName());
        prescription.setDispenseTime(LocalDateTime.now());
        auditService.write(pharmacist, "DRUG_DISPENSE", "PRESCRIPTION",
                prescriptionId.toString(), "items=" + prescription.getItems().size());
        return PrescriptionView.from(prescription);
    }

    @Transactional
    public PrescriptionView returnMedicine(Long prescriptionId, AuthUser pharmacist) {
        Prescription prescription = prescriptionRepository.findWithLockById(prescriptionId)
                .orElseThrow(() -> new BizException(BizCode.NOT_FOUND, "处方不存在"));
        if (!"DISPENSED".equals(prescription.getStatus())) {
            throw new BizException(BizCode.RULE_CONFLICT, "只有已发药的处方可以退药");
        }
        for (var item : prescription.getItems()) {
            Medicine medicine = medicineRepository.findWithLockById(item.getMedicine().getMedicineId())
                    .orElseThrow(() -> new BizException(BizCode.NOT_FOUND, "药品不存在"));
            medicine.setStockQty(medicine.getStockQty() + item.getQuantity());
            medicineRepository.saveAndFlush(medicine);
            DispenseRecord record = DispenseRecord.builder()
                    .prescription(prescription)
                    .medicine(medicine)
                    .quantity(item.getQuantity())
                    .bizType("RETURN")
                    .operatorId(pharmacist.getUserId())
                    .secondSigner(prescription.getSecondSigner())
                    .build();
            dispenseRecordRepository.saveAndFlush(record);
        }
        prescription.setStatus("RETURNED");
        auditService.write(pharmacist, "DRUG_RETURN", "PRESCRIPTION",
                prescriptionId.toString(), "items=" + prescription.getItems().size());
        return PrescriptionView.from(prescription);
    }

    @Transactional(readOnly = true)
    public List<Medicine> searchMedicines(String keyword) {
        String key = keyword == null || keyword.isBlank() ? "" : keyword;
        return medicineRepository.search(key);
    }
}
