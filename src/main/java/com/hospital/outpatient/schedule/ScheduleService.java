package com.hospital.outpatient.schedule;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

@Service
public class ScheduleService {

    private final ScheduleRepository scheduleRepository;

    public ScheduleService(ScheduleRepository scheduleRepository) {
        this.scheduleRepository = scheduleRepository;
    }

    @Transactional(readOnly = true)
    public List<ScheduleView> search(LocalDate workDate, Long deptId, Long doctorId) {
        return scheduleRepository.search(workDate, deptId, doctorId)
                .stream()
                .map(ScheduleView::from)
                .toList();
    }
}
