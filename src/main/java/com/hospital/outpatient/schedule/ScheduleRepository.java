package com.hospital.outpatient.schedule;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface ScheduleRepository extends JpaRepository<Schedule, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from Schedule s join fetch s.doctor d join fetch s.department dep where s.scheduleId = :id")
    Optional<Schedule> findWithLockById(@Param("id") Long id);

    @Query("""
            select s
            from Schedule s
            join fetch s.doctor d
            join fetch s.department dep
            where (:workDate is null or s.workDate = :workDate)
              and (:deptId is null or s.department.deptId = :deptId)
              and (:doctorId is null or s.doctor.doctorId = :doctorId)
            order by s.workDate asc, s.timeSlot asc, d.name asc
            """)
    List<Schedule> search(@Param("workDate") LocalDate workDate,
                          @Param("deptId") Long deptId,
                          @Param("doctorId") Long doctorId);

    @Query("""
            select s
            from Schedule s
            where s.doctor.doctorId = :doctorId
              and s.workDate = :workDate
              and s.timeSlot = :timeSlot
            """)
    Optional<Schedule> findSlot(@Param("doctorId") Long doctorId,
                               @Param("workDate") LocalDate workDate,
                               @Param("timeSlot") String timeSlot);
}
