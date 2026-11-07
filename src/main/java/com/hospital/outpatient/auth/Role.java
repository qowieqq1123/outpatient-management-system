package com.hospital.outpatient.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "role")
public class Role {

    @Id
    @Column(name = "role_code", length = 20, nullable = false)
    private String roleCode;

    @Column(name = "role_name", length = 30, nullable = false)
    private String roleName;

    @Column(name = "permissions", columnDefinition = "TEXT", nullable = false)
    private String permissions;
}
