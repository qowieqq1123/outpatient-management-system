package com.hospital.outpatient.schedule;

import com.hospital.outpatient.common.ApiResult;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/schedules")
public class ScheduleController {

    private final ScheduleService scheduleService;

    public ScheduleController(ScheduleService scheduleService) {
        this.scheduleService = scheduleService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('PATIENT','NURSE','DOCTOR','CASHIER','PHARMACIST','ADMIN')")
    public ApiResult<List<ScheduleView>> search(
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate workDate,
            @RequestParam(required = false) Long deptId,
            @RequestParam(required = false) Long doctorId) {
        return ApiResult.ok(scheduleService.search(workDate, deptId, doctorId));
    }
}
