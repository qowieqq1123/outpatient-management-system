package com.hospital.outpatient.billing;

import com.hospital.outpatient.config.AppProperties;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.UUID;

@Component
public class MockInsuranceGateway implements InsuranceGateway {

    private final AppProperties properties;

    public MockInsuranceGateway(AppProperties properties) {
        this.properties = properties;
    }

    @Override
    public InsuranceResult settle(String insuranceNo, BigDecimal totalAmount, Long billId) {
        if (insuranceNo == null || insuranceNo.isBlank()) {
            return new InsuranceResult(false, BigDecimal.ZERO, totalAmount, null,
                    "NO_INSURANCE", "患者没有医保号");
        }
        String mode = properties.getInsurance().getMode();
        if ("FAIL".equalsIgnoreCase(mode) || "TIMEOUT".equalsIgnoreCase(mode)) {
            return new InsuranceResult(false, BigDecimal.ZERO, totalAmount, null,
                    "TIMEOUT".equalsIgnoreCase(mode) ? "TIMEOUT" : "UNAVAILABLE",
                    "TIMEOUT".equalsIgnoreCase(mode) ? "医保系统超时" : "医保系统暂不可用");
        }
        BigDecimal ratio = BigDecimal.valueOf(properties.getInsurance().getFundRatio());
        BigDecimal fund = totalAmount.multiply(ratio).setScale(2, RoundingMode.HALF_UP);
        BigDecimal self = totalAmount.subtract(fund).setScale(2, RoundingMode.HALF_UP);
        return new InsuranceResult(true, fund, self, "MOCK-" + UUID.randomUUID(), null, null);
    }
}
