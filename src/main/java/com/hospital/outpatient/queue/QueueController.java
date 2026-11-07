package com.hospital.outpatient.queue;

import com.hospital.outpatient.auth.AuthUser;
import com.hospital.outpatient.common.ApiResult;
import jakarta.validation.constraints.NotNull;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@Validated
@RestController
@RequestMapping("/api/queue")
public class QueueController {

    private final QueueService queueService;

    public QueueController(QueueService queueService) {
        this.queueService = queueService;
    }

    public record ReportRequest(@NotNull(message = "挂号单不能为空") Long regId) {
    }

    public record CallNextRequest(
            @NotNull(message = "医生不能为空") Long doctorId,
            @NotNull(message = "日期不能为空") LocalDate workDate) {
    }

    public record ArriveRequest(@NotNull(message = "挂号单不能为空") Long regId) {
    }

    @PostMapping("/report")
    @PreAuthorize("hasRole('NURSE')")
    public ApiResult<QueueView> report(@RequestBody @Validated ReportRequest request,
                                       @AuthenticationPrincipal AuthUser user) {
        return ApiResult.ok(queueService.report(request.regId(), user));
    }

    @PostMapping("/call-next")
    @PreAuthorize("hasRole('DOCTOR')")
    public ApiResult<QueueView> callNext(@RequestBody @Validated CallNextRequest request,
                                         @AuthenticationPrincipal AuthUser user) {
        return ApiResult.ok(queueService.callNext(request.doctorId(), request.workDate(), user));
    }

    @PostMapping("/arrive")
    @PreAuthorize("hasAnyRole('NURSE','DOCTOR')")
    public ApiResult<QueueView> arrive(@RequestBody @Validated ArriveRequest request,
                                       @AuthenticationPrincipal AuthUser user) {
        return ApiResult.ok(queueService.arrive(request.regId(), user));
    }

    @GetMapping("/board")
    @PreAuthorize("hasAnyRole('NURSE','DOCTOR','PATIENT','ADMIN')")
    public ApiResult<List<QueueView>> board(
            @RequestParam @NotNull Long doctorId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate workDate,
            @AuthenticationPrincipal AuthUser user) {
        return ApiResult.ok(queueService.board(doctorId, workDate, user));
    }

    @PostMapping("/sweep")
    @PreAuthorize("hasRole('ADMIN')")
    public ApiResult<Integer> sweep() {
        return ApiResult.ok(queueService.sweepMissed());
    }
}
