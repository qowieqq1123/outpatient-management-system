package com.hospital.outpatient.stats;

import com.hospital.outpatient.billing.FeeBill;
import com.hospital.outpatient.billing.FeeBillRepository;
import com.hospital.outpatient.auth.AuthUser;
import com.hospital.outpatient.visit.VisitRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class StatsService {

    private final VisitRepository visitRepository;
    private final FeeBillRepository billRepository;

    public StatsService(VisitRepository visitRepository, FeeBillRepository billRepository) {
        this.visitRepository = visitRepository;
        this.billRepository = billRepository;
    }

    @Transactional(readOnly = true)
    public List<WorkloadRow> workload(LocalDateTime start, LocalDateTime end, AuthUser user) {
        return visitRepository.findBetween(start, end).stream()
                .filter(visit -> !"DOCTOR".equals(user.getRoleCode())
                        || (user.getRefId() != null
                        && user.getRefId().equals(visit.getDoctor().getDoctorId())))
                .collect(Collectors.groupingBy(visit -> visit.getDoctor().getDoctorId(), Collectors.counting()))
                .entrySet()
                .stream()
                .map(entry -> new WorkloadRow(entry.getKey(), entry.getValue().intValue()))
                .sorted(Comparator.comparing(WorkloadRow::doctorId))
                .toList();
    }

    @Transactional(readOnly = true)
    public RevenueRow revenue(LocalDateTime start, LocalDateTime end) {
        List<FeeBill> bills = billRepository.findPaidBetween(start, end);
        BigDecimal total = bills.stream().map(FeeBill::getPaidAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal insurance = bills.stream().map(FeeBill::getInsuranceAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal self = bills.stream().map(FeeBill::getSelfAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        return new RevenueRow(total, insurance, self, bills.size());
    }

    public record WorkloadRow(Long doctorId, int visitCount) {
    }

    public record RevenueRow(BigDecimal total, BigDecimal insurance, BigDecimal self, int billCount) {
    }
}
