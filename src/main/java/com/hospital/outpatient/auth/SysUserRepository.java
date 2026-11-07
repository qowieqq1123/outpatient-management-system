package com.hospital.outpatient.auth;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface SysUserRepository extends JpaRepository<SysUser, Long> {

    Optional<SysUser> findByUsername(String username);

    @Query("select u from SysUser u join fetch u.role where u.username = :username")
    Optional<SysUser> findByUsernameWithRole(@Param("username") String username);

    @Query("select u from SysUser u join fetch u.role order by u.userId")
    List<SysUser> findAllWithRole();
}
