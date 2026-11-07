package com.hospital.outpatient.registration;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "patient")
public class Patient {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "patient_id")
    private Long patientId;

    @Column(name = "patient_no", length = 20, nullable = false, unique = true)
    private String patientNo;

    @Column(name = "name", length = 50, nullable = false)
    private String name;

    @Column(name = "gender", length = 2, nullable = false)
    private String gender;

    @Column(name = "birth_date")
    private LocalDate birthDate;

    @Column(name = "id_card_enc", length = 255)
    private String idCardEnc;

    @Column(name = "phone_enc", length = 255)
    private String phoneEnc;

    @Column(name = "insurance_no", length = 30)
    private String insuranceNo;

    @Column(name = "insurance_type", length = 10, nullable = false)
    private String insuranceType;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }
}
