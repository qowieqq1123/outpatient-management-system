package com.hospital.outpatient.audit;

import com.hospital.outpatient.common.ApiResult;
import com.hospital.outpatient.common.BizException;
import com.hospital.outpatient.common.BizCode;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.List;

@RestController
@RequestMapping("/api/audit")
public class AuditController {

    private final OperationLogRepository repository;

    public AuditController(OperationLogRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ApiResult<List<OperationLog>> search(
            @RequestParam(required = false) String action,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime start,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime end) {
        if (start != null && end != null && start.isAfter(end)) {
            throw new BizException(BizCode.BAD_REQUEST, "开始时间不能晚于结束时间");
        }
        return ApiResult.ok(repository.search(action, start, end));
    }
}
