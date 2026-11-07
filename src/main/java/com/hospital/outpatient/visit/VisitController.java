package com.hospital.outpatient.visit;

import com.hospital.outpatient.auth.AuthUser;
import com.hospital.outpatient.common.ApiResult;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Validated
@RestController
@RequestMapping("/api/visits")
public class VisitController {

    private final VisitService visitService;

    public VisitController(VisitService visitService) {
        this.visitService = visitService;
    }

    public record StartRequest(@NotNull(message = "挂号单不能为空") Long regId) {
    }

    public record RecordRequest(
            @NotNull(message = "就诊不能为空") Long visitId,
            @NotBlank(message = "主诉不能为空") String chiefComplaint,
            @NotBlank(message = "诊断不能为空") String diagnosis,
            String advice) {
    }

    @PostMapping("/start")
    @PreAuthorize("hasRole('DOCTOR')")
    public ApiResult<VisitView> start(@RequestBody @Validated StartRequest request,
                                      @AuthenticationPrincipal AuthUser user) {
        return ApiResult.ok(visitService.start(request.regId(), user));
    }

    @GetMapping("/{visitId}")
    @PreAuthorize("hasAnyRole('DOCTOR','PATIENT','ADMIN')")
    public ApiResult<VisitView> detail(@PathVariable Long visitId,
                                       @AuthenticationPrincipal AuthUser user) {
        return ApiResult.ok(visitService.detail(visitId, user));
    }

    @PostMapping("/records")
    @PreAuthorize("hasRole('DOCTOR')")
    public ApiResult<VisitView> saveRecord(@RequestBody @Validated RecordRequest request,
                                           @AuthenticationPrincipal AuthUser user) {
        return ApiResult.ok(visitService.saveRecord(request, user));
    }

    @PostMapping("/{visitId}/complete")
    @PreAuthorize("hasRole('DOCTOR')")
    public ApiResult<VisitView> complete(@PathVariable Long visitId,
                                         @AuthenticationPrincipal AuthUser user) {
        return ApiResult.ok(visitService.complete(visitId, user));
    }

    @GetMapping("/mine")
    @PreAuthorize("hasRole('PATIENT')")
    public ApiResult<List<VisitView>> mine(@AuthenticationPrincipal AuthUser user) {
        return ApiResult.ok(visitService.listByPatient(user));
    }

    @GetMapping("/workbench")
    @PreAuthorize("hasAnyRole('NURSE','DOCTOR','CASHIER','PHARMACIST','ADMIN')")
    public ApiResult<List<VisitView>> workbench(
            @org.springframework.web.bind.annotation.RequestParam(required = false) String status) {
        return ApiResult.ok(visitService.workbench(status));
    }
}
