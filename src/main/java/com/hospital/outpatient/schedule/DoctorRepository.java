package com.hospital.outpatient.schedule;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface DoctorRepository extends JpaRepository<Doctor, Long> {

    @Query("select d from Doctor d join fetch d.department order by d.doctorId")
    List<Doctor> findAllWithDepartment();

    @Query("select d from Doctor d join fetch d.department where d.doctorId = :doctorId")
    Optional<Doctor> findWithDepartmentById(@Param("doctorId") Long doctorId);
}
