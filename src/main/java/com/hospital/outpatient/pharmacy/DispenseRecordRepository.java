package com.hospital.outpatient.pharmacy;

import org.springframework.data.jpa.repository.JpaRepository;

import com.hospital.outpatient.prescription.Prescription;

import java.util.List;

public interface DispenseRecordRepository extends JpaRepository<DispenseRecord, Long> {

    List<DispenseRecord> findByPrescriptionOrderByDispenseId(Prescription prescription);
}
