package com.hospital.outpatient.auth;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface RoleRepository extends JpaRepository<Role, String> {

    List<Role> findAllByOrderByRoleCode();
}
