package com.hospital.outpatient.billing;

import java.math.BigDecimal;

public interface InsuranceGateway {

    InsuranceResult settle(String insuranceNo, BigDecimal totalAmount, Long billId);

    record InsuranceResult(boolean success, BigDecimal fundAmount, BigDecimal selfAmount,
                           String tradeNo, String errorCode, String errorMessage) {
    }
}
