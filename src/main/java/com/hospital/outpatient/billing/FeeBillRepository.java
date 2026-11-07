package com.hospital.outpatient.billing;

import com.hospital.outpatient.registration.Patient;
import com.hospital.outpatient.visit.Visit;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface FeeBillRepository extends JpaRepository<FeeBill, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select b from FeeBill b join fetch b.visit v join fetch v.patient p join fetch v.doctor d join fetch v.department dep where b.billId = :id")
    Optional<FeeBill> findWithLockById(@Param("id") Long id);

    Optional<FeeBill> findFirstByVisitAndStatusIn(Visit visit, List<String> statuses);

    @Query("select b from FeeBill b join fetch b.visit v join fetch v.patient p join fetch v.doctor d join fetch v.department dep where b.patient = :patient order by b.createTime desc")
    List<FeeBill> findByPatientWithDetails(@Param("patient") Patient patient);

    @Query("select b from FeeBill b join fetch b.visit v join fetch v.patient p join fetch v.doctor d join fetch v.department dep where b.status = 'PAID' and b.payTime between :start and :end order by b.payTime")
    List<FeeBill> findPaidBetween(@Param("start") LocalDateTime start,
                                  @Param("end") LocalDateTime end);

    @Query("""
            select b
            from FeeBill b
            join fetch b.visit v
            join fetch v.patient p
            join fetch v.doctor d
            join fetch v.department dep
            where (:status is null or b.status = :status)
            order by b.createTime desc, b.billId desc
            """)
    List<FeeBill> findWorkbench(@Param("status") String status);
}
