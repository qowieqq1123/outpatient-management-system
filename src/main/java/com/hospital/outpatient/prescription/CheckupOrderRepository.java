package com.hospital.outpatient.prescription;

import com.hospital.outpatient.visit.Visit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface CheckupOrderRepository extends JpaRepository<CheckupOrder, Long> {

    @Query("select c from CheckupOrder c join fetch c.visit v join fetch v.patient p join fetch v.doctor d join fetch v.department dep where v = :visit order by c.checkupId")
    List<CheckupOrder> findByVisitWithDetails(@Param("visit") Visit visit);
}
