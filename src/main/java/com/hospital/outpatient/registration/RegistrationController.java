package com.hospital.outpatient.registration;

import com.hospital.outpatient.auth.AuthUser;
import com.hospital.outpatient.common.ApiResult;
import com.hospital.outpatient.common.BizCode;
import com.hospital.outpatient.common.BizException;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Validated
@RestController
@RequestMapping("/api/registrations")
public class RegistrationController {

    private final RegistrationService registrationService;

    public RegistrationController(RegistrationService registrationService) {
        this.registrationService = registrationService;
    }

    public record BookRequest(
            @NotNull(message = "患者不能为空") Long patientId,
            @NotNull(message = "号源不能为空") Long scheduleId,
            @NotBlank(message = "渠道不能为空") String channel) {
    }

    public record RefundRequest(String reason) {
    }

    @PostMapping
    public ApiResult<RegistrationView> book(@RequestBody @Validated BookRequest request,
                                            @AuthenticationPrincipal AuthUser user) {
        checkPatient(user, request.patientId());
        return ApiResult.ok(registrationService.book(request.patientId(), request.scheduleId(), request.channel(), user));
    }

    @GetMapping("/mine")
    public ApiResult<List<RegistrationView>> mine(@AuthenticationPrincipal AuthUser user,
                                                  @org.springframework.web.bind.annotation.RequestParam Long patientId) {
        checkPatient(user, patientId);
        return ApiResult.ok(registrationService.listByPatient(patientId));
    }

    @GetMapping("/workbench")
    @org.springframework.security.access.prepost.PreAuthorize("hasAnyRole('NURSE','DOCTOR','CASHIER','PHARMACIST','ADMIN')")
    public ApiResult<List<RegistrationView>> workbench(
            @org.springframework.web.bind.annotation.RequestParam(required = false) String status) {
        return ApiResult.ok(registrationService.workbench(status));
    }

    @PostMapping("/{regId}/cancel")
    @org.springframework.security.access.prepost.PreAuthorize("hasRole('PATIENT')")
    public ApiResult<RegistrationView> cancel(@org.springframework.web.bind.annotation.PathVariable Long regId,
                                              @AuthenticationPrincipal AuthUser user) {
        return ApiResult.ok(registrationService.cancel(regId, user));
    }

    @PostMapping("/{regId}/refund")
    @org.springframework.security.access.prepost.PreAuthorize("hasRole('CASHIER')")
    public ApiResult<RegistrationView> refund(@org.springframework.web.bind.annotation.PathVariable Long regId,
                                              @RequestBody(required = false) RefundRequest request,
                                              @AuthenticationPrincipal AuthUser user) {
        return ApiResult.ok(registrationService.refund(regId, request == null ? null : request.reason(), user));
    }

    private void checkPatient(AuthUser user, Long patientId) {
        if (!"PATIENT".equals(user.getRoleCode())) {
            throw new BizException(BizCode.FORBIDDEN, "仅患者可执行该操作");
        }
        if (user.getRefId() == null || !user.getRefId().equals(patientId)) {
            throw new BizException(BizCode.FORBIDDEN, "不能操作其他患者的挂号单");
        }
    }
}
