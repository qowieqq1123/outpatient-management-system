package com.hospital.outpatient.registration;

import com.hospital.outpatient.auth.AuthUser;
import com.hospital.outpatient.audit.AuditService;
import com.hospital.outpatient.billing.FeeBill;
import com.hospital.outpatient.billing.FeeItem;
import com.hospital.outpatient.billing.FeeItemRepository;
import com.hospital.outpatient.billing.RefundRecord;
import com.hospital.outpatient.billing.RefundRecordRepository;
import com.hospital.outpatient.common.BizCode;
import com.hospital.outpatient.common.BizException;
import com.hospital.outpatient.schedule.Schedule;
import com.hospital.outpatient.schedule.ScheduleRepository;
import com.hospital.outpatient.queue.QueueEventPublisher;
import com.hospital.outpatient.visit.VisitRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.math.BigDecimal;
import java.util.List;
import java.util.Set;

@Service
public class RegistrationService {

    private static final Set<String> ACTIVE_STATUSES = Set.of("REGISTERED", "TRIAGED");
    private static final Set<String> WORKBENCH_STATUSES = Set.of(
            "REGISTERED", "TRIAGED", "CALLING", "VISITED", "MISSED", "CANCELLED", "REFUNDED");
    private static final Set<String> REFUNDABLE_STATUSES = Set.of("REGISTERED", "TRIAGED", "CALLING");
    private static final Set<String> QUEUE_STATUSES = Set.of("REGISTERED", "TRIAGED", "CALLING");
    private static final String REGISTRATION_FEE_ITEM = "挂号费";

    private final RegistrationRepository registrationRepository;
    private final PatientRepository patientRepository;
    private final ScheduleRepository scheduleRepository;
    private final VisitRepository visitRepository;
    private final FeeItemRepository feeItemRepository;
    private final RefundRecordRepository refundRecordRepository;
    private final AuditService auditService;
    private final QueueEventPublisher queueEventPublisher;

    public RegistrationService(RegistrationRepository registrationRepository,
                               PatientRepository patientRepository,
                               ScheduleRepository scheduleRepository,
                               VisitRepository visitRepository,
                               FeeItemRepository feeItemRepository,
                               RefundRecordRepository refundRecordRepository,
                               AuditService auditService,
                               QueueEventPublisher queueEventPublisher) {
        this.registrationRepository = registrationRepository;
        this.patientRepository = patientRepository;
        this.scheduleRepository = scheduleRepository;
        this.visitRepository = visitRepository;
        this.feeItemRepository = feeItemRepository;
        this.refundRecordRepository = refundRecordRepository;
        this.auditService = auditService;
        this.queueEventPublisher = queueEventPublisher;
    }

    @Transactional
    public RegistrationView book(Long patientId, Long scheduleId, String channel, AuthUser user) {
        Patient patient = patientRepository.findById(patientId)
                .orElseThrow(() -> new BizException(BizCode.NOT_FOUND, "患者不存在"));
        Schedule schedule = scheduleRepository.findWithLockById(scheduleId)
                .orElseThrow(() -> new BizException(BizCode.NOT_FOUND, "号源不存在"));

        if (!"OPEN".equals(schedule.getStatus())) {
            throw new BizException(BizCode.RULE_CONFLICT, "该时段已停诊");
        }
        if (schedule.getWorkDate().isBefore(LocalDate.now())) {
            throw new BizException(BizCode.RULE_CONFLICT, "排班已过期");
        }
        if (schedule.getRemainingQty() <= 0) {
            throw new BizException(BizCode.RULE_CONFLICT, "号源已挂满，请重新选择");
        }
        if (registrationRepository.existsByPatientAndScheduleAndStatusIn(patient, schedule, ACTIVE_STATUSES)) {
            throw new BizException(BizCode.RULE_CONFLICT, "您已预约该号源，请勿重复挂号");
        }

        // 与号源行锁处于同一事务；锁定当前号源已有挂号单，避免并发下读到同一 MAX(queue_no)。
        Integer lastQueueNo = registrationRepository.findByScheduleForUpdate(schedule)
                .stream()
                .map(Registration::getQueueNo)
                .max(Integer::compareTo)
                .orElse(0);
        Registration registration = Registration.builder()
                .patient(patient)
                .schedule(schedule)
                .doctor(schedule.getDoctor())
                .department(schedule.getDepartment())
                .queueNo(lastQueueNo + 1)
                .missCount(0)
                .channel(channel == null || channel.isBlank() ? "ONLINE" : channel)
                .status("REGISTERED")
                .registrationFee(schedule.getRegistrationFee())
                .feePaid(false)
                .queueVersion(0)
                .build();
        registration = registrationRepository.saveAndFlush(registration);
        schedule.setRemainingQty(schedule.getRemainingQty() - 1);
        scheduleRepository.saveAndFlush(schedule);
        auditService.write(user, "REGISTRATION_BOOK", "REGISTRATION", registration.getRegId().toString(),
                "scheduleId=" + scheduleId + ",queueNo=" + registration.getQueueNo() + ",channel=" + registration.getChannel());
        return RegistrationView.from(registration);
    }

    @Transactional(readOnly = true)
    public List<RegistrationView> listByPatient(Long patientId) {
        Patient patient = patientRepository.findById(patientId)
                .orElseThrow(() -> new BizException(BizCode.NOT_FOUND, "患者不存在"));
        return registrationRepository.findByPatientOrderByRegTimeDesc(patient)
                .stream()
                .map(RegistrationView::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<RegistrationView> workbench(String status) {
        Set<String> statuses = status == null || status.isBlank() || "ALL".equalsIgnoreCase(status)
                ? WORKBENCH_STATUSES
                : Set.of(status.toUpperCase());
        if (!WORKBENCH_STATUSES.containsAll(statuses)) {
            throw new BizException(400, "挂号状态不合法");
        }
        return registrationRepository.findByStatusInOrderByRegTimeDesc(statuses).stream()
                .map(RegistrationView::from)
                .toList();
    }

    /** 患者只能取消本人、尚未报到且未产生就诊的挂号单。 */
    @Transactional
    public RegistrationView cancel(Long regId, AuthUser user) {
        Registration registration = lockRegistration(regId);
        if (!"PATIENT".equals(user.getRoleCode())
                || user.getRefId() == null
                || !user.getRefId().equals(registration.getPatient().getPatientId())) {
            throw new BizException(BizCode.FORBIDDEN, "只能取消本人挂号单");
        }
        if (!"REGISTERED".equals(registration.getStatus())) {
            throw new BizException(BizCode.RULE_CONFLICT, "只有未报到的已挂号单可以取消");
        }
        if (visitRepository.existsByRegistrationRegId(regId)) {
            throw new BizException(BizCode.RULE_CONFLICT, "已产生就诊记录，不能取消挂号");
        }

        int remainingQty = releaseQuota(registration, "CANCELLED", "患者取消挂号");
        auditService.write(user, "REGISTRATION_CANCEL", "REGISTRATION", regId.toString(),
                "scheduleId=" + registration.getSchedule().getScheduleId() + ",remainingQty=" + remainingQty);
        publishQueue(registration);
        return RegistrationView.from(registration).withResult(remainingQty, null);
    }

    /** 收费员在就诊前办理退号；挂号费退费记录、号源回补与审计保持一致。 */
    @Transactional
    public RegistrationView refund(Long regId, String reason, AuthUser cashier) {
        Registration registration = lockRegistration(regId);
        if (!REFUNDABLE_STATUSES.contains(registration.getStatus())) {
            throw new BizException(BizCode.RULE_CONFLICT, "已就诊、已过号或已结束的挂号单不能退号");
        }
        if (visitRepository.existsByRegistrationRegId(regId)) {
            throw new BizException(BizCode.RULE_CONFLICT, "已产生就诊记录，不能退号");
        }
        if (refundRecordRepository.existsByRegIdAndRefundType(regId, "REGISTRATION")) {
            throw new BizException(BizCode.RULE_CONFLICT, "该挂号单已办理过挂号费退费");
        }

        BigDecimal refundAmount = registration.getRegistrationFee();
        for (FeeItem item : feeItemRepository.findBySourceTypeAndSourceIdAndItemName(
                "REGISTRATION", regId, REGISTRATION_FEE_ITEM)) {
            FeeBill bill = item.getBill();
            if ("PAID".equals(bill.getStatus())) {
                throw new BizException(BizCode.RULE_CONFLICT,
                        "挂号费已并入收费单 #" + bill.getBillId() + "，请先办理整单退费");
            }
            if ("REFUNDED".equals(bill.getStatus())) {
                refundAmount = BigDecimal.ZERO;
            }
        }

        int remainingQty = releaseQuota(registration, "REFUNDED",
                reason == null || reason.isBlank() ? "收费台办理退号退费" : reason);
        RefundRecord refund = RefundRecord.builder()
                .regId(regId)
                .patient(registration.getPatient())
                .refundAmount(refundAmount)
                .refundType("REGISTRATION")
                .reason(reason)
                .operatorId(cashier.getUserId())
                .status("DONE")
                .build();
        refundRecordRepository.saveAndFlush(refund);
        auditService.write(cashier, "REGISTRATION_REFUND", "REGISTRATION", regId.toString(),
                "amount=" + refundAmount + ",remainingQty=" + remainingQty
                        + ",reason=" + (reason == null ? "" : reason));
        publishQueue(registration);
        return RegistrationView.from(registration)
                .withResult(remainingQty, refundAmount);
    }

    private Registration lockRegistration(Long regId) {
        return registrationRepository.findWithLockByRegId(regId)
                .orElseThrow(() -> new BizException(BizCode.NOT_FOUND, "挂号单不存在"));
    }

    /** 号源与挂号单都在事务内锁定，终态校验阻止重复回补余量。 */
    private int releaseQuota(Registration registration, String terminalStatus, String remark) {
        Schedule schedule = scheduleRepository.findWithLockById(registration.getSchedule().getScheduleId())
                .orElseThrow(() -> new BizException(BizCode.NOT_FOUND, "号源不存在"));
        if (schedule.getRemainingQty() >= schedule.getTotalQty()) {
            throw new BizException(BizCode.RULE_CONFLICT, "号源余量已满，不能重复释放");
        }
        registration.setStatus(terminalStatus);
        registration.setEndTime(LocalDateTime.now());
        registration.setCallOrder(null);
        registration.setArrivedAt(null);
        registration.setQueueVersion(registration.getQueueVersion() + 1);
        registration.setRemark(remark);
        registrationRepository.saveAndFlush(registration);
        schedule.setRemainingQty(schedule.getRemainingQty() + 1);
        scheduleRepository.saveAndFlush(schedule);
        return schedule.getRemainingQty();
    }

    private void publishQueue(Registration registration) {
        if (!QUEUE_STATUSES.contains(registration.getStatus())) {
            queueEventPublisher.publish(registration.getDoctor().getDoctorId(),
                    registration.getSchedule().getWorkDate());
        }
    }
}
