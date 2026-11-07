package com.hospital.outpatient.schedule;

import java.math.BigDecimal;
import java.time.LocalDate;

public record ScheduleView(
        Long scheduleId,
        LocalDate workDate,
        String timeSlot,
        Long doctorId,
        String doctorName,
        String title,
        Long deptId,
        String deptName,
        String location,
        Integer totalQty,
        Integer remainingQty,
        BigDecimal registrationFee,
        String status,
        boolean full) {

    public static ScheduleView from(Schedule schedule) {
        Doctor doctor = schedule.getDoctor();
        Department department = schedule.getDepartment();
        return new ScheduleView(
                schedule.getScheduleId(),
                schedule.getWorkDate(),
                schedule.getTimeSlot(),
                doctor.getDoctorId(),
                doctor.getName(),
                doctor.getTitle(),
                department.getDeptId(),
                department.getDeptName(),
                department.getLocation(),
                schedule.getTotalQty(),
                schedule.getRemainingQty(),
                schedule.getRegistrationFee(),
                schedule.getStatus(),
                schedule.getRemainingQty() <= 0
        );
    }
}
