package com.hospital.outpatient.prescription;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CheckupCatalogRepository extends JpaRepository<CheckupCatalog, String> {

    List<CheckupCatalog> findByEnabledTrueOrderByItemCode();
}
