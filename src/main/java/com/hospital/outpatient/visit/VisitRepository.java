package com.hospital.outpatient.visit;

import com.hospital.outpatient.registration.Patient;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.time.LocalDateTime;

public interface VisitRepository extends JpaRepository<Visit, Long> {

    Optional<Visit> findByRegistrationRegId(Long regId);

    boolean existsByRegistrationRegId(Long regId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select v from Visit v join fetch v.registration r join fetch v.patient p join fetch v.doctor d join fetch v.department dep where v.visitId = :visitId")
    Optional<Visit> findWithLockById(@Param("visitId") Long visitId);

    @Query("select v from Visit v join fetch v.registration r join fetch v.patient p join fetch v.doctor d join fetch v.department dep where v.patient = :patient order by v.startTime desc")
    List<Visit> findByPatientWithDetails(@Param("patient") Patient patient);

    @Query("select v from Visit v join fetch v.registration r join fetch v.patient p join fetch v.doctor d join fetch v.department dep where (:status is null or v.status = :status) order by v.startTime desc")
    List<Visit> findWorkbench(@Param("status") String status);

    @Query("select v from Visit v join fetch v.patient p join fetch v.doctor d join fetch v.department dep where v.startTime between :start and :end")
    List<Visit> findBetween(@Param("start") LocalDateTime start, @Param("end") LocalDateTime end);
}
