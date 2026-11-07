package com.hospital.outpatient.stats;

import com.hospital.outpatient.common.ApiResult;
import com.hospital.outpatient.auth.AuthUser;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.List;

@RestController
@RequestMapping("/api/stats")
public class StatsController {

    private final StatsService statsService;

    public StatsController(StatsService statsService) {
        this.statsService = statsService;
    }

    @GetMapping("/workload")
    @PreAuthorize("hasAnyRole('ADMIN','DOCTOR')")
    public ApiResult<List<StatsService.WorkloadRow>> workload(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime start,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime end,
            @AuthenticationPrincipal AuthUser user) {
        return ApiResult.ok(statsService.workload(start, end, user));
    }

    @GetMapping("/revenue")
    @PreAuthorize("hasAnyRole('ADMIN','CASHIER')")
    public ApiResult<StatsService.RevenueRow> revenue(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime start,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime end) {
        return ApiResult.ok(statsService.revenue(start, end));
    }
}
