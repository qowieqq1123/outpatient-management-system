package com.hospital.outpatient.queue;

import com.hospital.outpatient.auth.AuthUser;
import com.hospital.outpatient.audit.AuditService;
import com.hospital.outpatient.common.BizCode;
import com.hospital.outpatient.common.BizException;
import com.hospital.outpatient.config.AppProperties;
import com.hospital.outpatient.registration.Registration;
import com.hospital.outpatient.registration.RegistrationRepository;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

@Service
public class QueueService {

    private static final List<String> ACTIVE_STATUSES = List.of("REGISTERED", "TRIAGED", "CALLING");
    private static final List<String> PATIENT_QUEUE_STATUSES =
            List.of("REGISTERED", "TRIAGED", "CALLING", "VISITED");

    private final RegistrationRepository registrationRepository;
    private final AppProperties properties;
    private final QueueEventPublisher eventPublisher;
    private final AuditService auditService;

    public QueueService(RegistrationRepository registrationRepository,
                        AppProperties properties,
                        QueueEventPublisher eventPublisher,
                        AuditService auditService) {
        this.registrationRepository = registrationRepository;
        this.properties = properties;
        this.eventPublisher = eventPublisher;
        this.auditService = auditService;
    }

    @Transactional
    public QueueView report(Long regId, AuthUser nurse) {
        Registration registration = lockByRegId(regId);
        if (!"REGISTERED".equals(registration.getStatus())) {
            throw new BizException(BizCode.RULE_CONFLICT, "只有已挂号且未报到的患者可以分诊");
        }
        List<Registration> queue = lockQueue(registration.getDoctor().getDoctorId(),
                registration.getSchedule().getWorkDate());
        int nextOrder = queue.stream()
                .map(Registration::getCallOrder)
                .filter(order -> order != null)
                .max(Integer::compareTo)
                .orElse(0) + 1;
        registration.setStatus("TRIAGED");
        registration.setTriageTime(LocalDateTime.now());
        registration.setCallOrder(nextOrder);
        registration.setQueueVersion(registration.getQueueVersion() + 1);
        auditService.write(nurse, "QUEUE_REPORT", "REGISTRATION", regId.toString(),
                "callOrder=" + nextOrder);
        publish(registration.getDoctor().getDoctorId(), registration.getSchedule().getWorkDate());
        return QueueView.from(registration);
    }

    @Transactional
    public QueueView callNext(Long doctorId, LocalDate workDate, AuthUser doctor) {
        if (doctor.getRefId() == null || !doctor.getRefId().equals(doctorId)) {
            throw new BizException(BizCode.FORBIDDEN, "只能叫自己接诊的队列");
        }
        List<Registration> queue = lockQueue(doctorId, workDate);
        Optional<Registration> calling = queue.stream()
                .filter(item -> "CALLING".equals(item.getStatus()))
                .findFirst();
        if (calling.isPresent()) {
            throw new BizException(BizCode.RULE_CONFLICT, "已有叫号中的患者，请先应答或过号");
        }
        Registration next = queue.stream()
                .filter(item -> "TRIAGED".equals(item.getStatus()))
                .min(Comparator.comparing(item -> item.getCallOrder() == null ? Integer.MAX_VALUE : item.getCallOrder()))
                .orElseThrow(() -> new BizException(BizCode.NOT_FOUND, "当前没有候诊患者"));
        next.setStatus("CALLING");
        next.setCalledTime(LocalDateTime.now());
        next.setArrivedAt(null);
        next.setQueueVersion(next.getQueueVersion() + 1);
        auditService.write(doctor, "QUEUE_CALL_NEXT", "REGISTRATION", next.getRegId().toString(),
                "doctorId=" + doctorId + ",workDate=" + workDate);
        publish(doctorId, workDate);
        return QueueView.from(next);
    }

    @Transactional
    public QueueView arrive(Long regId, AuthUser user) {
        Registration registration = lockByRegId(regId);
        if ("DOCTOR".equals(user.getRoleCode())
                && (user.getRefId() == null
                || !user.getRefId().equals(registration.getDoctor().getDoctorId()))) {
            throw new BizException(BizCode.FORBIDDEN, "只能确认自己接诊的叫号");
        }
        if (!"CALLING".equals(registration.getStatus())) {
            throw new BizException(BizCode.RULE_CONFLICT, "患者当前不在叫号状态，不能确认到诊");
        }
        registration.setArrivedAt(LocalDateTime.now());
        registration.setQueueVersion(registration.getQueueVersion() + 1);
        auditService.write(user,
                "QUEUE_ARRIVE", "REGISTRATION", regId.toString(), "arrived=true");
        publish(registration.getDoctor().getDoctorId(), registration.getSchedule().getWorkDate());
        return QueueView.from(registration);
    }

    @Transactional(readOnly = true)
    public List<QueueView> board(Long doctorId, LocalDate workDate, AuthUser user) {
        String role = user == null ? null : user.getRoleCode();
        if ("DOCTOR".equals(role)
                && (user.getRefId() == null || !doctorId.equals(user.getRefId()))) {
            throw new BizException(BizCode.FORBIDDEN, "只能查看自己接诊的队列");
        }
        if ("PATIENT".equals(role)) {
            if (user.getRefId() == null || !registrationRepository.existsPatientInDoctorQueue(
                    user.getRefId(), doctorId, workDate, PATIENT_QUEUE_STATUSES)) {
                throw new BizException(BizCode.FORBIDDEN, "只能查看本人当日挂号对应的叫号队列");
            }
            return registrationRepository.findBoard(doctorId, workDate).stream()
                    .map(item -> QueueView.from(item).maskedFor(user.getRefId()))
                    .toList();
        }
        return registrationRepository.findBoard(doctorId, workDate).stream()
                .map(QueueView::from)
                .toList();
    }

    @Transactional
    public int sweepMissed() {
        LocalDateTime deadline = LocalDateTime.now().minusMinutes(properties.getQueue().getMissMinutes());
        List<Registration> missed = registrationRepository.findMissedCandidates(deadline);
        int count = 0;
        for (Registration registration : missed) {
            List<Registration> queue = lockQueue(registration.getDoctor().getDoctorId(),
                    registration.getSchedule().getWorkDate());
            int baseIndex = queue.indexOf(registration);
            queue.remove(registration);
            int target = Math.min(baseIndex + properties.getQueue().getInsertBehind() + 1, queue.size());
            queue.add(target, registration);
            for (int i = 0; i < queue.size(); i++) {
                Registration item = queue.get(i);
                item.setCallOrder(i + 1);
                item.setQueueVersion(item.getQueueVersion() + 1);
            }
            registration.setStatus("TRIAGED");
            registration.setMissCount(registration.getMissCount() + 1);
            registration.setArrivedAt(null);
            registration.setCalledTime(null);
            auditService.write(AuthUser.system(), "QUEUE_MISS", "REGISTRATION", registration.getRegId().toString(),
                    "missCount=" + registration.getMissCount() + ",newCallOrder=" + registration.getCallOrder());
            publish(registration.getDoctor().getDoctorId(), registration.getSchedule().getWorkDate());
            count++;
        }
        return count;
    }

    private Registration lockByRegId(Long regId) {
        return registrationRepository.findWithLockByRegId(regId)
                .orElseThrow(() -> new BizException(BizCode.NOT_FOUND, "挂号单不存在"));
    }

    private List<Registration> lockQueue(Long doctorId, LocalDate workDate) {
        return registrationRepository.lockQueue(doctorId, workDate, ACTIVE_STATUSES);
    }

    private void publish(Long doctorId, LocalDate workDate) {
        eventPublisher.publish(doctorId, workDate);
    }
}
