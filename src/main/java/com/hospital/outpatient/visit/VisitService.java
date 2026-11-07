package com.hospital.outpatient.visit;

import com.hospital.outpatient.auth.AuthUser;
import com.hospital.outpatient.audit.AuditService;
import com.hospital.outpatient.common.BizCode;
import com.hospital.outpatient.common.BizException;
import com.hospital.outpatient.registration.Patient;
import com.hospital.outpatient.registration.Registration;
import com.hospital.outpatient.registration.RegistrationRepository;
import com.hospital.outpatient.security.PhoneCipher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;

@Service
public class VisitService {

    private final VisitRepository visitRepository;
    private final MedicalRecordRepository medicalRecordRepository;
    private final RegistrationRepository registrationRepository;
    private final PhoneCipher phoneCipher;
    private final AuditService auditService;

    public VisitService(VisitRepository visitRepository,
                        MedicalRecordRepository medicalRecordRepository,
                        RegistrationRepository registrationRepository,
                        PhoneCipher phoneCipher,
                        AuditService auditService) {
        this.visitRepository = visitRepository;
        this.medicalRecordRepository = medicalRecordRepository;
        this.registrationRepository = registrationRepository;
        this.phoneCipher = phoneCipher;
        this.auditService = auditService;
    }

    @Transactional
    public VisitView start(Long regId, AuthUser doctor) {
        Registration registration = registrationRepository.findWithLockByRegId(regId)
                .orElseThrow(() -> new BizException(BizCode.NOT_FOUND, "挂号单不存在"));
        if (doctor.getRefId() == null || !doctor.getRefId().equals(registration.getDoctor().getDoctorId())) {
            throw new BizException(BizCode.FORBIDDEN, "只能接诊自己的患者");
        }
        if (!"CALLING".equals(registration.getStatus())) {
            throw new BizException(BizCode.RULE_CONFLICT, "患者尚未被叫号，不能开始接诊");
        }
        if (registration.getArrivedAt() == null) {
            throw new BizException(BizCode.RULE_CONFLICT, "患者尚未到诊室，不能开始接诊");
        }
        Visit visit = Visit.builder()
                .registration(registration)
                .patient(registration.getPatient())
                .doctor(registration.getDoctor())
                .department(registration.getDepartment())
                .startTime(LocalDateTime.now())
                .status("IN_TREATMENT")
                .build();
        visit = visitRepository.saveAndFlush(visit);
        registration.setStatus("VISITED");
        registration.setEndTime(null);
        registrationRepository.saveAndFlush(registration);
        auditService.write(doctor, "VISIT_START", "VISIT", visit.getVisitId().toString(),
                "regId=" + regId);
        return VisitView.from(visit, phoneCipher);
    }

    @Transactional(readOnly = true)
    public VisitView detail(Long visitId, AuthUser user) {
        Visit visit = visitRepository.findById(visitId)
                .orElseThrow(() -> new BizException(BizCode.NOT_FOUND, "就诊记录不存在"));
        checkReadPermission(visit, user);
        return VisitView.from(visit, phoneCipher);
    }

    @Transactional
    public VisitView saveRecord(VisitController.RecordRequest request, AuthUser doctor) {
        Visit visit = visitRepository.findWithLockById(request.visitId())
                .orElseThrow(() -> new BizException(BizCode.NOT_FOUND, "就诊记录不存在"));
        if (doctor.getRefId() == null || !doctor.getRefId().equals(visit.getDoctor().getDoctorId())) {
            throw new BizException(BizCode.FORBIDDEN, "只能维护自己接诊的病历");
        }
        if ("COMPLETED".equals(visit.getStatus())) {
            throw new BizException(BizCode.RULE_CONFLICT, "就诊已完成，病历不能再修改");
        }
        MedicalRecord record = medicalRecordRepository.findByVisit(visit).orElseGet(() -> MedicalRecord.builder()
                .visit(visit)
                .patient(visit.getPatient())
                .doctor(visit.getDoctor())
                .build());
        record.setChiefComplaint(request.chiefComplaint());
        record.setDiagnosis(request.diagnosis());
        record.setAdvice(request.advice());
        medicalRecordRepository.saveAndFlush(record);
        visit.setMedicalRecord(record);
        auditService.write(doctor, "MEDICAL_RECORD_SAVE", "VISIT", visit.getVisitId().toString(),
                "chiefComplaint=" + request.chiefComplaint());
        return VisitView.from(visit, phoneCipher);
    }

    @Transactional
    public VisitView complete(Long visitId, AuthUser doctor) {
        Visit visit = visitRepository.findWithLockById(visitId)
                .orElseThrow(() -> new BizException(BizCode.NOT_FOUND, "就诊记录不存在"));
        if (doctor.getRefId() == null || !doctor.getRefId().equals(visit.getDoctor().getDoctorId())) {
            throw new BizException(BizCode.FORBIDDEN, "只能结束自己接诊的就诊");
        }
        if (!"IN_TREATMENT".equals(visit.getStatus())) {
            throw new BizException(BizCode.RULE_CONFLICT, "就诊已结束，无需重复结束");
        }
        visit.setStatus("COMPLETED");
        visit.setEndTime(LocalDateTime.now());
        visitRepository.saveAndFlush(visit);
        auditService.write(doctor, "VISIT_COMPLETE", "VISIT", visit.getVisitId().toString(), null);
        return VisitView.from(visit, phoneCipher);
    }

    @Transactional(readOnly = true)
    public List<VisitView> listByPatient(AuthUser user) {
        if (user.getRefId() == null) {
            throw new BizException(BizCode.FORBIDDEN, "当前账号未绑定患者档案");
        }
        Patient patient = new Patient();
        patient.setPatientId(user.getRefId());
        return visitRepository.findByPatientWithDetails(patient).stream()
                .map(visit -> VisitView.from(visit, phoneCipher))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<VisitView> workbench(String status) {
        String normalized = status == null || status.isBlank() || "ALL".equalsIgnoreCase(status)
                ? null : status.toUpperCase();
        if (normalized != null && !Set.of("IN_TREATMENT", "COMPLETED").contains(normalized)) {
            throw new BizException(400, "就诊状态不合法");
        }
        return visitRepository.findWorkbench(normalized).stream()
                .map(visit -> VisitView.from(visit, phoneCipher))
                .toList();
    }

    private void checkReadPermission(Visit visit, AuthUser user) {
        if ("ADMIN".equals(user.getRoleCode())) {
            return;
        }
        if ("DOCTOR".equals(user.getRoleCode())) {
            if (user.getRefId() != null && user.getRefId().equals(visit.getDoctor().getDoctorId())) {
                return;
            }
            throw new BizException(BizCode.FORBIDDEN, "无权查看其他医生接诊的就诊记录");
        }
        if ("PATIENT".equals(user.getRoleCode())
                && user.getRefId() != null
                && user.getRefId().equals(visit.getPatient().getPatientId())) {
            return;
        }
        throw new BizException(BizCode.FORBIDDEN, "无权查看该就诊记录");
    }
}
