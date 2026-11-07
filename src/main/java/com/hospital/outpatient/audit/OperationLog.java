package com.hospital.outpatient.audit;

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

import java.time.LocalDateTime;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "operation_log")
public class OperationLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "log_id")
    private Long logId;

    @Column(name = "operator_id")
    private Long operatorId;

    @Column(name = "operator_name", length = 50)
    private String operatorName;

    @Column(name = "operator_role", length = 20)
    private String operatorRole;

    @Column(name = "action", length = 60, nullable = false)
    private String action;

    @Column(name = "target_type", length = 30)
    private String targetType;

    @Column(name = "target_id", length = 40)
    private String targetId;

    @Column(name = "detail", length = 500)
    private String detail;

    @Column(name = "client_ip", length = 50)
    private String clientIp;

    @Column(name = "operate_time", nullable = false, updatable = false)
    private LocalDateTime operateTime;

    @PrePersist
    void onCreate() {
        if (operateTime == null) {
            operateTime = LocalDateTime.now();
        }
    }
}
