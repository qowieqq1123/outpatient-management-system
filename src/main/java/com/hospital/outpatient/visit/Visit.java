package com.hospital.outpatient.visit;

import com.hospital.outpatient.registration.Patient;
import com.hospital.outpatient.registration.Registration;
import com.hospital.outpatient.schedule.Department;
import com.hospital.outpatient.schedule.Doctor;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "visit")
public class Visit {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "visit_id")
    private Long visitId;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reg_id", nullable = false, unique = true)
    private Registration registration;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "patient_id", nullable = false)
    private Patient patient;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "doctor_id", nullable = false)
    private Doctor doctor;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "dept_id", nullable = false)
    private Department department;

    @Column(name = "start_time", nullable = false)
    private LocalDateTime startTime;

    @Column(name = "end_time")
    private LocalDateTime endTime;

    @Column(name = "status", length = 20, nullable = false)
    private String status;

    @OneToOne(mappedBy = "visit", fetch = FetchType.LAZY)
    private MedicalRecord medicalRecord;

    @PrePersist
    void onCreate() {
        if (startTime == null) {
            startTime = LocalDateTime.now();
        }
        if (status == null || status.isBlank()) {
            status = "IN_TREATMENT";
        }
    }
}
