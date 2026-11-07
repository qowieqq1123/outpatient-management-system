package com.hospital.outpatient.billing;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface FeeItemRepository extends JpaRepository<FeeItem, Long> {

    List<FeeItem> findByBillOrderByFeeItemId(FeeBill bill);

    @Query("select f from FeeItem f join fetch f.bill b where f.sourceType = :sourceType and f.sourceId = :sourceId and f.itemName = :itemName")
    List<FeeItem> findBySourceTypeAndSourceIdAndItemName(@Param("sourceType") String sourceType,
                                                         @Param("sourceId") Long sourceId,
                                                         @Param("itemName") String itemName);
}
