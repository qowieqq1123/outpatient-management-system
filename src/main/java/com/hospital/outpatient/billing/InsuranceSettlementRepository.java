package com.hospital.outpatient.billing;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface InsuranceSettlementRepository extends JpaRepository<InsuranceSettlement, Long> {

    List<InsuranceSettlement> findByBillOrderBySettlementId(FeeBill bill);
}
