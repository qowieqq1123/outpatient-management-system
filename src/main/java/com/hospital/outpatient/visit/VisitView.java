package com.hospital.outpatient.visit;

import com.hospital.outpatient.registration.Registration;
import com.hospital.outpatient.security.PhoneCipher;

import java.time.LocalDateTime;

public record VisitView(
        Long visitId,
        Long regId,
        Long patientId,
        String patientNo,
        String patientName,
        String gender,
        String phone,
        Long doctorId,
        String doctorName,
        Long deptId,
        String deptName,
        String status,
        LocalDateTime startTime,
        LocalDateTime endTime,
        String chiefComplaint,
        String diagnosis,
        String advice) {

    public static VisitView from(Visit visit, PhoneCipher phoneCipher) {
        Registration registration = visit.getRegistration();
        MedicalRecord record = visit.getMedicalRecord();
        String phone = phoneCipher.mask(phoneCipher.decrypt(registration.getPatient().getPhoneEnc()));
        return new VisitView(
                visit.getVisitId(),
                registration.getRegId(),
                visit.getPatient().getPatientId(),
                visit.getPatient().getPatientNo(),
                visit.getPatient().getName(),
                visit.getPatient().getGender(),
                phone,
                visit.getDoctor().getDoctorId(),
                visit.getDoctor().getName(),
                visit.getDepartment().getDeptId(),
                visit.getDepartment().getDeptName(),
                visit.getStatus(),
                visit.getStartTime(),
                visit.getEndTime(),
                record == null ? null : record.getChiefComplaint(),
                record == null ? null : record.getDiagnosis(),
                record == null ? null : record.getAdvice()
        );
    }
}
