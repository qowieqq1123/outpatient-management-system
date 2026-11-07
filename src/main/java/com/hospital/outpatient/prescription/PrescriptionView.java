package com.hospital.outpatient.prescription;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record PrescriptionView(
        Long prescriptionId,
        Long visitId,
        Long patientId,
        String patientName,
        Long doctorId,
        String doctorName,
        String category,
        String status,
        BigDecimal totalAmount,
        LocalDateTime createTime,
        String auditPharmacist,
        String firstSigner,
        String secondSigner,
        String dispensePharmacist,
        List<ItemView> items) {

    public record ItemView(
            Long itemId,
            Long medicineId,
            String medicineName,
            Integer quantity,
            BigDecimal unitPrice,
            BigDecimal amount,
            String usageText) {
    }

    public static PrescriptionView from(Prescription prescription) {
        List<ItemView> items = prescription.getItems() == null ? List.of() :
                prescription.getItems().stream()
                        .map(item -> new ItemView(
                                item.getItemId(),
                                item.getMedicine().getMedicineId(),
                                item.getMedicineName(),
                                item.getQuantity(),
                                item.getUnitPrice(),
                                item.getAmount(),
                                item.getUsageText()))
                        .toList();
        return new PrescriptionView(
                prescription.getPrescriptionId(),
                prescription.getVisit().getVisitId(),
                prescription.getPatient().getPatientId(),
                prescription.getPatient().getName(),
                prescription.getDoctor().getDoctorId(),
                prescription.getDoctor().getName(),
                prescription.getCategory(),
                prescription.getStatus(),
                prescription.getTotalAmount(),
                prescription.getCreateTime(),
                prescription.getAuditPharmacist(),
                prescription.getFirstSigner(),
                prescription.getSecondSigner(),
                prescription.getDispensePharmacist(),
                items
        );
    }
}
