package com.hospital.outpatient.prescription;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "checkup_catalog")
public class CheckupCatalog {

    @Id
    @Column(name = "item_code", length = 20)
    private String itemCode;

    @Column(name = "item_name", length = 80, nullable = false)
    private String itemName;

    @Column(name = "category", length = 20, nullable = false)
    private String category;

    @Column(name = "price", precision = 10, scale = 2, nullable = false)
    private BigDecimal price;

    @Column(name = "enabled", nullable = false)
    private Boolean enabled;
}
