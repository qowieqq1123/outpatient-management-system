package com.hospital.outpatient.audit;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface OperationLogRepository extends JpaRepository<OperationLog, Long> {

    @Query("""
            select l
            from OperationLog l
            where (:action is null or l.action = :action)
              and (:start is null or l.operateTime >= :start)
              and (:end is null or l.operateTime <= :end)
            order by l.operateTime desc
            """)
    List<OperationLog> search(@Param("action") String action,
                              @Param("start") LocalDateTime start,
                              @Param("end") LocalDateTime end);
}
