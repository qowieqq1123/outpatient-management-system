package com.hospital.outpatient.registration;

import com.hospital.outpatient.schedule.Schedule;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.Collection;
import java.time.LocalDate;
import java.time.LocalDateTime;

public interface RegistrationRepository extends JpaRepository<Registration, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from Registration r where r.schedule = :schedule order by r.queueNo desc")
    List<Registration> findByScheduleForUpdate(@Param("schedule") Schedule schedule);

    List<Registration> findByPatientOrderByRegTimeDesc(Patient patient);

    List<Registration> findByStatusInOrderByRegTimeDesc(Collection<String> statuses);

    Optional<Registration> findByRegId(Long regId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from Registration r join fetch r.patient p join fetch r.doctor d join fetch r.schedule s where r.regId = :regId")
    Optional<Registration> findWithLockByRegId(@Param("regId") Long regId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select r
            from Registration r
            join fetch r.patient p
            join fetch r.doctor d
            join fetch r.schedule s
            where r.doctor.doctorId = :doctorId
              and r.schedule.workDate = :workDate
              and r.status in :statuses
            order by coalesce(r.callOrder, 999999) asc, r.regTime asc
            """)
    List<Registration> lockQueue(@Param("doctorId") Long doctorId,
                                 @Param("workDate") LocalDate workDate,
                                 @Param("statuses") Collection<String> statuses);

    @Query("""
            select r
            from Registration r
            join fetch r.patient p
            join fetch r.doctor d
            join fetch r.schedule s
            where r.doctor.doctorId = :doctorId
              and r.schedule.workDate = :workDate
              and r.status in ('REGISTERED','TRIAGED','CALLING')
            order by coalesce(r.callOrder, 999999) asc, r.regTime asc
            """)
    List<Registration> findBoard(@Param("doctorId") Long doctorId,
                                 @Param("workDate") LocalDate workDate);

    @Query("""
            select r
            from Registration r
            join fetch r.patient p
            join fetch r.doctor d
            join fetch r.schedule s
            where r.status = 'CALLING'
              and r.arrivedAt is null
              and r.calledTime <= :deadline
            """)
    List<Registration> findMissedCandidates(@Param("deadline") LocalDateTime deadline);

    boolean existsByPatientAndScheduleAndStatusIn(Patient patient, Schedule schedule, Collection<String> statuses);

    @Query("""
            select count(r) > 0
            from Registration r
            where r.patient.patientId = :patientId
              and r.doctor.doctorId = :doctorId
              and r.schedule.workDate = :workDate
              and r.status in :statuses
            """)
    boolean existsPatientInDoctorQueue(@Param("patientId") Long patientId,
                                       @Param("doctorId") Long doctorId,
                                       @Param("workDate") LocalDate workDate,
                                       @Param("statuses") Collection<String> statuses);
}
