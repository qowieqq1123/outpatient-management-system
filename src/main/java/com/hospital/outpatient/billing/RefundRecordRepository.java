package com.hospital.outpatient.billing;

import org.springframework.data.jpa.repository.JpaRepository;

public interface RefundRecordRepository extends JpaRepository<RefundRecord, Long> {

    boolean existsByRegIdAndRefundType(Long regId, String refundType);
}
