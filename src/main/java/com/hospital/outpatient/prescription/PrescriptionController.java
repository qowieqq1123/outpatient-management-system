package com.hospital.outpatient.prescription;

import com.hospital.outpatient.auth.AuthUser;
import com.hospital.outpatient.common.ApiResult;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
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

import java.math.BigDecimal;
import java.util.List;

@Validated
@RestController
@RequestMapping("/api/prescriptions")
public class PrescriptionController {

    private final PrescriptionService prescriptionService;

    public PrescriptionController(PrescriptionService prescriptionService) {
        this.prescriptionService = prescriptionService;
    }

    public record PrescriptionItemRequest(
            @NotNull(message = "药品不能为空") Long medicineId,
            @Positive(message = "数量必须大于 0") Integer quantity,
            String usageText) {
    }

    public record PrescriptionRequest(
            @NotNull(message = "就诊不能为空") Long visitId,
            @NotEmpty(message = "处方明细不能为空") List<@Valid PrescriptionItemRequest> items) {
    }

    public record CheckupRequest(
            @NotNull(message = "就诊不能为空") Long visitId,
            @NotBlank(message = "检查项目不能为空") String itemCode) {
    }

    @PostMapping
    @PreAuthorize("hasRole('DOCTOR')")
    public ApiResult<PrescriptionView> create(@RequestBody @Validated PrescriptionRequest request,
                                              @AuthenticationPrincipal AuthUser user) {
        return ApiResult.ok(prescriptionService.create(request, user));
    }

    @PostMapping("/checkups")
    @PreAuthorize("hasRole('DOCTOR')")
    public ApiResult<CheckupView> createCheckup(@RequestBody @Validated CheckupRequest request,
                                                @AuthenticationPrincipal AuthUser user) {
        return ApiResult.ok(prescriptionService.createCheckup(request, user));
    }

    @GetMapping("/visit/{visitId}")
    @PreAuthorize("hasAnyRole('DOCTOR','CASHIER','PHARMACIST','ADMIN','PATIENT')")
    public ApiResult<List<PrescriptionView>> byVisit(@PathVariable Long visitId,
                                                     @AuthenticationPrincipal AuthUser user) {
        return ApiResult.ok(prescriptionService.listByVisit(visitId, user));
    }

    @GetMapping("/workbench")
    @PreAuthorize("hasAnyRole('DOCTOR','CASHIER','PHARMACIST','ADMIN')")
    public ApiResult<List<PrescriptionView>> workbench(
            @RequestParam(required = false) String status,
            @AuthenticationPrincipal AuthUser user) {
        return ApiResult.ok(prescriptionService.workbench(status, user));
    }

    @GetMapping("/checkup-catalog")
    @PreAuthorize("hasAnyRole('DOCTOR','CASHIER','PHARMACIST','ADMIN')")
    public ApiResult<List<CheckupCatalog>> checkupCatalog() {
        return ApiResult.ok(prescriptionService.enabledCheckupCatalog());
    }
}
