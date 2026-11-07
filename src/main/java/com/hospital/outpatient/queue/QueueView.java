package com.hospital.outpatient.queue;

import com.hospital.outpatient.registration.Registration;

import java.time.LocalDateTime;

public record QueueView(
        Long regId,
        Long patientId,
        String patientNo,
        String patientName,
        Long doctorId,
        String doctorName,
        Integer queueNo,
        Integer callOrder,
        Integer missCount,
        String status,
        LocalDateTime triageTime,
        LocalDateTime calledTime,
        LocalDateTime arrivedAt) {

    public static QueueView from(Registration registration) {
        return new QueueView(
                registration.getRegId(),
                registration.getPatient().getPatientId(),
                registration.getPatient().getPatientNo(),
                registration.getPatient().getName(),
                registration.getDoctor().getDoctorId(),
                registration.getDoctor().getName(),
                registration.getQueueNo(),
                registration.getCallOrder(),
                registration.getMissCount(),
                registration.getStatus(),
                registration.getTriageTime(),
                registration.getCalledTime(),
                registration.getArrivedAt()
        );
    }

    /** 患者端只保留本人身份，其他候诊者仅展示队列进度。 */
    public QueueView maskedFor(Long patientId) {
        if (patientId != null && patientId.equals(this.patientId)) return this;
        return new QueueView(regId, null, null, null, doctorId, doctorName,
                queueNo, callOrder, missCount, status, triageTime, calledTime, arrivedAt);
    }
}
