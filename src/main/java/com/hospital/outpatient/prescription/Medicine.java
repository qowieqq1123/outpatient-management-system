package com.hospital.outpatient.prescription;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "medicine")
public class Medicine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "medicine_id")
    private Long medicineId;

    @Column(name = "code", length = 20, nullable = false, unique = true)
    private String code;

    @Column(name = "name", length = 80, nullable = false)
    private String name;

    @Column(name = "spec", length = 50, nullable = false)
    private String spec;

    @Column(name = "unit", length = 10, nullable = false)
    private String unit;

    @Column(name = "category", length = 10, nullable = false)
    private String category;

    @Column(name = "price", precision = 10, scale = 2, nullable = false)
    private BigDecimal price;

    @Column(name = "stock_qty", nullable = false)
    private Integer stockQty;

    @Column(name = "low_warn", nullable = false)
    private Integer lowWarn;

    @Column(name = "high_warn", nullable = false)
    private Integer highWarn;

    @Column(name = "expiry_date")
    private LocalDate expiryDate;

    @Column(name = "supplier", length = 80)
    private String supplier;
}
