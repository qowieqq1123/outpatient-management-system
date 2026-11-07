package com.hospital.outpatient.prescription;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record CheckupView(
        Long checkupId,
        Long visitId,
        String itemCode,
        String itemName,
        BigDecimal price,
        String status,
        LocalDateTime createTime,
        LocalDateTime doneTime,
        String resultText) {

    public static CheckupView from(CheckupOrder order) {
        return new CheckupView(
                order.getCheckupId(),
                order.getVisit().getVisitId(),
                order.getItemCode(),
                order.getItemName(),
                order.getPrice(),
                order.getStatus(),
                order.getCreateTime(),
                order.getDoneTime(),
                order.getResultText()
        );
    }
}
