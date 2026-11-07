package com.hospital.outpatient.registration;

import com.hospital.outpatient.schedule.Schedule;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record RegistrationView(
        Long regId,
        Long patientId,
        String patientName,
        Long scheduleId,
        Long doctorId,
        String doctorName,
        Long deptId,
        String deptName,
        Integer queueNo,
        String channel,
        String status,
        BigDecimal registrationFee,
        LocalDateTime regTime,
        Integer remainingQty,
        BigDecimal refundAmount) {

    public static RegistrationView from(Registration registration) {
        Schedule schedule = registration.getSchedule();
        return new RegistrationView(
                registration.getRegId(),
                registration.getPatient().getPatientId(),
                registration.getPatient().getName(),
                schedule.getScheduleId(),
                registration.getDoctor().getDoctorId(),
                registration.getDoctor().getName(),
                registration.getDepartment().getDeptId(),
                registration.getDepartment().getDeptName(),
                registration.getQueueNo(),
                registration.getChannel(),
                registration.getStatus(),
                registration.getRegistrationFee(),
                registration.getRegTime(),
                schedule.getRemainingQty(),
                null
        );
    }

    public RegistrationView withResult(Integer remainingQty, BigDecimal refundAmount) {
        return new RegistrationView(regId, patientId, patientName, scheduleId, doctorId, doctorName,
                deptId, deptName, queueNo, channel, status, registrationFee, regTime,
                remainingQty, refundAmount);
    }
}
