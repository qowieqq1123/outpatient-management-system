package com.hospital.outpatient.prescription;

import com.hospital.outpatient.visit.Visit;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface PrescriptionRepository extends JpaRepository<Prescription, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Prescription p join fetch p.visit v join fetch v.patient pat join fetch v.doctor d join fetch v.department dep where p.prescriptionId = :id")
    Optional<Prescription> findWithLockById(@Param("id") Long id);

    @Query("select p from Prescription p join fetch p.visit v join fetch v.patient pat join fetch v.doctor d join fetch v.department dep where v = :visit order by p.prescriptionId")
    List<Prescription> findByVisitWithDetails(@Param("visit") Visit visit);

    @Query("select p from Prescription p join fetch p.visit v join fetch v.patient pat join fetch v.doctor d join fetch v.department dep where p.status = :status order by p.prescriptionId")
    List<Prescription> findByStatusWithDetails(@Param("status") String status);

    @Query("""
            select p
            from Prescription p
            join fetch p.visit v
            join fetch v.patient pat
            join fetch v.doctor d
            join fetch v.department dep
            where (:status is null or p.status = :status)
            order by p.createTime desc, p.prescriptionId desc
            """)
    List<Prescription> findWorkbench(@Param("status") String status);
}
