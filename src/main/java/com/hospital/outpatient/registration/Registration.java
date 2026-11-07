package com.hospital.outpatient.registration;

import com.hospital.outpatient.schedule.Department;
import com.hospital.outpatient.schedule.Doctor;
import com.hospital.outpatient.schedule.Schedule;
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
@Table(name = "registration")
public class Registration {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "reg_id")
    private Long regId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "patient_id", nullable = false)
    private Patient patient;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "schedule_id", nullable = false)
    private Schedule schedule;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "doctor_id", nullable = false)
    private Doctor doctor;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "dept_id", nullable = false)
    private Department department;

    @Column(name = "queue_no", nullable = false)
    private Integer queueNo;

    @Column(name = "call_order")
    private Integer callOrder;

    @Column(name = "miss_count", nullable = false)
    private Integer missCount;

    @Column(name = "channel", length = 10, nullable = false)
    private String channel;

    @Column(name = "status", length = 20, nullable = false)
    private String status;

    @Column(name = "registration_fee", precision = 10, scale = 2, nullable = false)
    private BigDecimal registrationFee;

    @Column(name = "fee_paid", nullable = false)
    private Boolean feePaid;

    @Column(name = "reg_time", nullable = false, updatable = false)
    private LocalDateTime regTime;

    @Column(name = "triage_time")
    private LocalDateTime triageTime;

    @Column(name = "called_time")
    private LocalDateTime calledTime;

    @Column(name = "arrived_at")
    private LocalDateTime arrivedAt;

    @Column(name = "queue_version", nullable = false)
    private Integer queueVersion;

    @Column(name = "end_time")
    private LocalDateTime endTime;

    @Column(name = "remark", length = 200)
    private String remark;

    @PrePersist
    void onCreate() {
        if (regTime == null) {
            regTime = LocalDateTime.now();
        }
        if (missCount == null) {
            missCount = 0;
        }
        if (queueVersion == null) {
            queueVersion = 0;
        }
    }
}
