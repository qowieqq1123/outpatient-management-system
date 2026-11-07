package com.hospital.outpatient.pharmacy;

import com.hospital.outpatient.auth.AuthUser;
import com.hospital.outpatient.common.ApiResult;
import com.hospital.outpatient.prescription.PrescriptionView;
import jakarta.validation.constraints.NotNull;
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

import java.util.List;

@Validated
@RestController
@RequestMapping("/api/pharmacy")
public class PharmacyController {

    private final PharmacyService pharmacyService;

    public PharmacyController(PharmacyService pharmacyService) {
        this.pharmacyService = pharmacyService;
    }

    public record AuditRequest(@NotNull(message = "处方不能为空") Long prescriptionId) {
    }

    public record SignRequest(@NotNull(message = "处方不能为空") Long prescriptionId) {
    }

    @PostMapping("/audit")
    @PreAuthorize("hasRole('PHARMACIST')")
    public ApiResult<PrescriptionView> audit(@RequestBody @Validated AuditRequest request,
                                             @AuthenticationPrincipal AuthUser user) {
        return ApiResult.ok(pharmacyService.audit(request.prescriptionId(), user));
    }

    @PostMapping("/second-sign")
    @PreAuthorize("hasRole('PHARMACIST')")
    public ApiResult<PrescriptionView> secondSign(@RequestBody @Validated SignRequest request,
                                                  @AuthenticationPrincipal AuthUser user) {
        return ApiResult.ok(pharmacyService.secondSign(request.prescriptionId(), user));
    }

    @PostMapping("/{prescriptionId}/dispense")
    @PreAuthorize("hasRole('PHARMACIST')")
    public ApiResult<PrescriptionView> dispense(@PathVariable Long prescriptionId,
                                                @AuthenticationPrincipal AuthUser user) {
        return ApiResult.ok(pharmacyService.dispense(prescriptionId, user));
    }

    @PostMapping("/{prescriptionId}/return")
    @PreAuthorize("hasRole('PHARMACIST')")
    public ApiResult<PrescriptionView> returnMedicine(@PathVariable Long prescriptionId,
                                                      @AuthenticationPrincipal AuthUser user) {
        return ApiResult.ok(pharmacyService.returnMedicine(prescriptionId, user));
    }

    @GetMapping("/medicines")
    @PreAuthorize("hasAnyRole('PHARMACIST','DOCTOR','ADMIN')")
    public ApiResult<List<com.hospital.outpatient.prescription.Medicine>> medicines(
            @RequestParam(required = false) String keyword) {
        return ApiResult.ok(pharmacyService.searchMedicines(keyword));
    }
}
