package com.hospital.outpatient.prescription;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface MedicineRepository extends JpaRepository<Medicine, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select m from Medicine m where m.medicineId = :id")
    Optional<Medicine> findWithLockById(@Param("id") Long id);

    @Query("select m from Medicine m where lower(m.name) like lower(concat('%', :keyword, '%')) or lower(m.code) like lower(concat('%', :keyword, '%')) order by m.code")
    List<Medicine> search(@Param("keyword") String keyword);
}
