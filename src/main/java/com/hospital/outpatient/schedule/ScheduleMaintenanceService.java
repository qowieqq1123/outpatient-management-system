package com.hospital.outpatient.schedule;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.hospital.outpatient.audit.AuditService;
import com.hospital.outpatient.auth.AuthUser;
import com.hospital.outpatient.common.BizCode;
import com.hospital.outpatient.common.BizException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/** 管理员维护号源：不物理删除；已有占用时按总量差计算新余量，停诊保留历史挂号。 */
@Service
public class ScheduleMaintenanceService {

    private final ScheduleRepository scheduleRepository;
    private final DoctorRepository doctorRepository;
    private final DepartmentRepository departmentRepository;
    private final AuditService auditService;

    public ScheduleMaintenanceService(ScheduleRepository scheduleRepository,
                                      DoctorRepository doctorRepository,
                                      DepartmentRepository departmentRepository,
                                      AuditService auditService) {
        this.scheduleRepository = scheduleRepository;
        this.doctorRepository = doctorRepository;
        this.departmentRepository = departmentRepository;
        this.auditService = auditService;
    }

    @Transactional(readOnly = true)
    public List<ScheduleView> list() {
        return scheduleRepository.search(null, null, null).stream()
                .map(ScheduleView::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public CatalogView catalog() {
        List<DoctorOption> doctors = doctorRepository.findAllWithDepartment().stream()
                .map(doctor -> new DoctorOption(doctor.getDoctorId(), doctor.getName(), doctor.getTitle(),
                        doctor.getDepartment().getDeptId(), doctor.getDepartment().getDeptName()))
                .toList();
        List<DepartmentOption> departments = departmentRepository.findAllByOrderByDeptName().stream()
                .map(department -> new DepartmentOption(department.getDeptId(), department.getDeptName(),
                        department.getLocation()))
                .toList();
        return new CatalogView(doctors, departments);
    }

    @Transactional
    public ScheduleView upsert(Long scheduleId, ScheduleRequest request, AuthUser admin) {
        Doctor doctor = doctorRepository.findWithDepartmentById(requirePositive(request.doctorId(), "医生"))
                .orElseThrow(() -> new BizException(BizCode.NOT_FOUND, "医生不存在"));
        Department department = departmentRepository.findById(requirePositive(request.deptId(), "科室"))
                .orElseThrow(() -> new BizException(BizCode.NOT_FOUND, "科室不存在"));
        if (!doctor.getDepartment().getDeptId().equals(department.getDeptId())) {
            throw new BizException(400, "医生不属于所选科室");
        }
        LocalDate workDate = requireWorkDate(request.workDate());
        String timeSlot = requireText(request.timeSlot(), "出诊时段", 30);
        Integer totalQty = requirePositive(request.totalQty(), "号源总量");
        BigDecimal fee = requireFee(request.registrationFee());

        scheduleRepository.findSlot(doctor.getDoctorId(), workDate, timeSlot)
                .filter(existing -> scheduleId == null || !existing.getScheduleId().equals(scheduleId))
                .ifPresent(existing -> {
                    throw new BizException(BizCode.RULE_CONFLICT, "同一医生同一日期已存在该时段排班");
                });

        Schedule schedule;
        if (scheduleId == null) {
            schedule = Schedule.builder()
                    .doctor(doctor)
                    .department(department)
                    .workDate(workDate)
                    .timeSlot(timeSlot)
                    .totalQty(totalQty)
                    .remainingQty(totalQty)
                    .registrationFee(fee)
                    .status("OPEN")
                    .createdAt(LocalDateTime.now())
                    .build();
        } else {
            schedule = scheduleRepository.findWithLockById(scheduleId)
                    .orElseThrow(() -> new BizException(BizCode.NOT_FOUND, "排班不存在"));
            if ("CLOSED".equals(schedule.getStatus())) {
                throw new BizException(BizCode.RULE_CONFLICT, "已停诊排班不能编辑");
            }
            int used = schedule.getTotalQty() - schedule.getRemainingQty();
            if (used < 0 || schedule.getRemainingQty() < 0) {
                throw new BizException(BizCode.RULE_CONFLICT, "号源余量数据异常，不能调整");
            }
            if (totalQty < used) {
                throw new BizException(BizCode.RULE_CONFLICT,
                        "调整后的号源总量不能小于已占用数量 " + used);
            }
            boolean slotMoved = !schedule.getDoctor().getDoctorId().equals(doctor.getDoctorId())
                    || !schedule.getDepartment().getDeptId().equals(department.getDeptId())
                    || !schedule.getWorkDate().equals(workDate)
                    || !schedule.getTimeSlot().equals(timeSlot);
            if (used > 0 && slotMoved) {
                throw new BizException(BizCode.RULE_CONFLICT, "已有挂号占用时不能更换医生、科室、日期或时段");
            }
            schedule.setDoctor(doctor);
            schedule.setDepartment(department);
            schedule.setWorkDate(workDate);
            schedule.setTimeSlot(timeSlot);
            schedule.setTotalQty(totalQty);
            schedule.setRemainingQty(totalQty - used);
            schedule.setRegistrationFee(fee);
        }
        scheduleRepository.saveAndFlush(schedule);
        auditService.write(admin, "SCHEDULE_UPSERT", "SCHEDULE", schedule.getScheduleId().toString(),
                "doctorId=" + doctor.getDoctorId() + ",workDate=" + workDate + ",timeSlot=" + timeSlot
                        + ",totalQty=" + totalQty + ",remainingQty=" + schedule.getRemainingQty());
        return ScheduleView.from(schedule);
    }

    @Transactional
    public ScheduleView close(Long scheduleId, AuthUser admin) {
        Schedule schedule = scheduleRepository.findWithLockById(scheduleId)
                .orElseThrow(() -> new BizException(BizCode.NOT_FOUND, "排班不存在"));
        if ("CLOSED".equals(schedule.getStatus())) {
            throw new BizException(BizCode.RULE_CONFLICT, "该排班已停诊");
        }
        schedule.setStatus("CLOSED");
        scheduleRepository.saveAndFlush(schedule);
        auditService.write(admin, "SCHEDULE_CLOSE", "SCHEDULE", schedule.getScheduleId().toString(),
                "doctorId=" + schedule.getDoctor().getDoctorId() + ",remainingQty=" + schedule.getRemainingQty());
        return ScheduleView.from(schedule);
    }

    private static LocalDate requireWorkDate(LocalDate workDate) {
        if (workDate == null) {
            throw new BizException(400, "出诊日期不能为空");
        }
        if (workDate.isBefore(LocalDate.now())) {
            throw new BizException(400, "出诊日期不能早于今天");
        }
        return workDate;
    }

    private static BigDecimal requireFee(BigDecimal fee) {
        if (fee == null || fee.signum() < 0) {
            throw new BizException(400, "挂号费不能为空且不能小于 0");
        }
        return fee;
    }

    private static Long requirePositive(Long value, String label) {
        if (value == null || value <= 0) {
            throw new BizException(400, label + "不能为空且必须大于 0");
        }
        return value;
    }

    private static Integer requirePositive(Integer value, String label) {
        if (value == null || value <= 0) {
            throw new BizException(400, label + "不能为空且必须大于 0");
        }
        return value;
    }

    private static String requireText(String value, String label, int maxLength) {
        if (value == null || value.isBlank()) {
            throw new BizException(400, label + "不能为空");
        }
        String text = value.trim();
        if (text.length() > maxLength) {
            throw new BizException(400, label + "不能超过 " + maxLength + " 个字符");
        }
        return text;
    }

    public record ScheduleRequest(Long doctorId, Long deptId,
                                  @JsonFormat(pattern = "yyyy-MM-dd") LocalDate workDate, String timeSlot,
                                  Integer totalQty, BigDecimal registrationFee) {
    }

    public record CatalogView(List<DoctorOption> doctors, List<DepartmentOption> departments) {
    }

    public record DoctorOption(Long doctorId, String name, String title, Long deptId, String deptName) {
    }

    public record DepartmentOption(Long deptId, String deptName, String location) {
    }
}
