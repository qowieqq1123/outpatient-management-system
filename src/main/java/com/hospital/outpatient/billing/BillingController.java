package com.hospital.outpatient.billing;

import com.hospital.outpatient.auth.AuthUser;
import com.hospital.outpatient.common.ApiResult;
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

import java.math.BigDecimal;
import java.util.List;

@Validated
@RestController
@RequestMapping("/api/bills")
public class BillingController {

    private final BillService billService;

    public BillingController(BillService billService) {
        this.billService = billService;
    }

    public record PriceRequest(@NotNull(message = "就诊不能为空") Long visitId) {
    }

    public record PayRequest(
            @NotNull(message = "收费单不能为空") Long billId,
            @NotNull(message = "支付方式不能为空") String payType,
            BigDecimal paidAmount) {
    }

    public record RefundRequest(
            @NotNull(message = "收费单不能为空") Long billId,
            String reason) {
    }

    @PostMapping("/price")
    @PreAuthorize("hasRole('CASHIER')")
    public ApiResult<BillView> price(@RequestBody @Validated PriceRequest request,
                                     @AuthenticationPrincipal AuthUser user) {
        return ApiResult.ok(billService.price(request.visitId(), user));
    }

    @PostMapping("/pay")
    @PreAuthorize("hasRole('CASHIER')")
    public ApiResult<BillView> pay(@RequestBody @Validated PayRequest request,
                                   @AuthenticationPrincipal AuthUser user) {
        return ApiResult.ok(billService.pay(request, user));
    }

    @PostMapping("/refund")
    @PreAuthorize("hasRole('CASHIER')")
    public ApiResult<BillView> refund(@RequestBody @Validated RefundRequest request,
                                      @AuthenticationPrincipal AuthUser user) {
        return ApiResult.ok(billService.refund(request, user));
    }

    @GetMapping("/{billId}")
    @PreAuthorize("hasAnyRole('CASHIER','ADMIN','PATIENT')")
    public ApiResult<BillView> detail(@PathVariable Long billId,
                                      @AuthenticationPrincipal AuthUser user) {
        return ApiResult.ok(billService.detail(billId, user));
    }

    @GetMapping("/mine")
    @PreAuthorize("hasRole('PATIENT')")
    public ApiResult<List<BillView>> mine(@AuthenticationPrincipal AuthUser user) {
        return ApiResult.ok(billService.listByPatient(user));
    }

    @GetMapping("/workbench")
    @PreAuthorize("hasAnyRole('CASHIER','ADMIN','DOCTOR','PHARMACIST')")
    public ApiResult<List<BillView>> workbench(
            @RequestParam(required = false) String status) {
        return ApiResult.ok(billService.workbench(status));
    }
}
