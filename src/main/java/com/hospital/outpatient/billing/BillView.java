package com.hospital.outpatient.billing;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record BillView(
        Long billId,
        Long visitId,
        Long patientId,
        String patientName,
        BigDecimal totalAmount,
        BigDecimal paidAmount,
        BigDecimal selfAmount,
        BigDecimal insuranceAmount,
        String payType,
        String status,
        Long cashierId,
        LocalDateTime createTime,
        LocalDateTime payTime,
        List<ItemView> items,
        List<SettlementView> settlements) {

    public record ItemView(Long feeItemId, String sourceType, Long sourceId, String itemName, BigDecimal amount) {
    }

    public record SettlementView(
            Long settlementId, String status, BigDecimal fundAmount, BigDecimal selfAmount,
            String tradeNo, String errorMsg, Integer retryCount, LocalDateTime requestTime) {
    }

    public static BillView from(FeeBill bill, List<FeeItem> items, List<InsuranceSettlement> settlements) {
        return new BillView(
                bill.getBillId(),
                bill.getVisit().getVisitId(),
                bill.getPatient().getPatientId(),
                bill.getPatient().getName(),
                bill.getTotalAmount(),
                bill.getPaidAmount(),
                bill.getSelfAmount(),
                bill.getInsuranceAmount(),
                bill.getPayType(),
                bill.getStatus(),
                bill.getCashierId(),
                bill.getCreateTime(),
                bill.getPayTime(),
                items.stream().map(item -> new ItemView(
                        item.getFeeItemId(), item.getSourceType(), item.getSourceId(),
                        item.getItemName(), item.getAmount())).toList(),
                settlements.stream().map(item -> new SettlementView(
                        item.getSettlementId(), item.getStatus(), item.getFundAmount(), item.getSelfAmount(),
                        item.getTradeNo(), item.getErrorMsg(), item.getRetryCount(), item.getRequestTime())).toList()
        );
    }
}
