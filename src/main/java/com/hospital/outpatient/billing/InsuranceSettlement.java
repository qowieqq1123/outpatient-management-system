package com.hospital.outpatient.billing;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "insurance_settlement")
public class InsuranceSettlement {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "settlement_id")
    private Long settlementId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "bill_id", nullable = false)
    private FeeBill bill;

    @Column(name = "insurance_no", length = 30, nullable = false)
    private String insuranceNo;

    @Column(name = "total_amount", precision = 10, scale = 2, nullable = false)
    private BigDecimal totalAmount;

    @Column(name = "fund_amount", precision = 10, scale = 2, nullable = false)
    private BigDecimal fundAmount;

    @Column(name = "self_amount", precision = 10, scale = 2, nullable = false)
    private BigDecimal selfAmount;

    @Column(name = "status", length = 10, nullable = false)
    private String status;

    @Column(name = "trade_no", length = 40)
    private String tradeNo;

    @Column(name = "error_msg", length = 200)
    private String errorMsg;

    @Column(name = "retry_count", nullable = false)
    private Integer retryCount;

    @Column(name = "request_time", nullable = false, updatable = false)
    private LocalDateTime requestTime;

    @Column(name = "response_time")
    private LocalDateTime responseTime;

    @PrePersist
    void onCreate() {
        if (requestTime == null) {
            requestTime = LocalDateTime.now();
        }
        if (retryCount == null) {
            retryCount = 0;
        }
    }
}
