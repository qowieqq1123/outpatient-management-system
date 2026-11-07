package com.hospital.outpatient.auth;

import com.hospital.outpatient.common.ApiResult;
import com.hospital.outpatient.schedule.ScheduleMaintenanceService;
import com.hospital.outpatient.schedule.ScheduleView;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** ADMIN 专属维护端点；所有写操作由服务层事务、口令散列与独立审计事务兜底。 */
@RestController
@RequestMapping("/api/admin")
@PreAuthorize("hasRole('ADMIN')")
public class AdminController {

    private final AdminMaintenanceService maintenanceService;
    private final ScheduleMaintenanceService scheduleMaintenanceService;

    public AdminController(AdminMaintenanceService maintenanceService,
                           ScheduleMaintenanceService scheduleMaintenanceService) {
        this.maintenanceService = maintenanceService;
        this.scheduleMaintenanceService = scheduleMaintenanceService;
    }

    @GetMapping("/roles")
    public ApiResult<List<AdminMaintenanceService.RoleView>> roles() {
        return ApiResult.ok(maintenanceService.roles());
    }

    @PostMapping("/roles")
    public ApiResult<AdminMaintenanceService.RoleView> createRole(
            @RequestBody AdminMaintenanceService.RoleRequest request,
            @AuthenticationPrincipal AuthUser admin) {
        return ApiResult.ok(maintenanceService.upsertRole(null, request, admin));
    }

    @PutMapping("/roles/{roleCode}")
    public ApiResult<AdminMaintenanceService.RoleView> updateRole(
            @PathVariable String roleCode,
            @RequestBody AdminMaintenanceService.RoleRequest request,
            @AuthenticationPrincipal AuthUser admin) {
        return ApiResult.ok(maintenanceService.upsertRole(roleCode, request, admin));
    }

    @GetMapping("/users")
    public ApiResult<List<AdminMaintenanceService.UserView>> users() {
        return ApiResult.ok(maintenanceService.users());
    }

    @PostMapping("/users")
    public ApiResult<AdminMaintenanceService.UserView> createUser(
            @RequestBody AdminMaintenanceService.UserRequest request,
            @AuthenticationPrincipal AuthUser admin) {
        return ApiResult.ok(maintenanceService.upsertUser(null, request, admin));
    }

    @PutMapping("/users/{userId}")
    public ApiResult<AdminMaintenanceService.UserView> updateUser(
            @PathVariable Long userId,
            @RequestBody AdminMaintenanceService.UserRequest request,
            @AuthenticationPrincipal AuthUser admin) {
        return ApiResult.ok(maintenanceService.upsertUser(userId, request, admin));
    }

    @PostMapping("/users/{userId}/status")
    public ApiResult<AdminMaintenanceService.UserView> setUserEnabled(
            @PathVariable Long userId,
            @RequestParam boolean enabled,
            @AuthenticationPrincipal AuthUser admin) {
        return ApiResult.ok(maintenanceService.setUserEnabled(userId, enabled, admin));
    }

    @GetMapping("/catalog")
    public ApiResult<ScheduleMaintenanceService.CatalogView> catalog() {
        return ApiResult.ok(scheduleMaintenanceService.catalog());
    }

    @GetMapping("/schedules")
    public ApiResult<List<ScheduleView>> schedules() {
        return ApiResult.ok(scheduleMaintenanceService.list());
    }

    @PostMapping("/schedules")
    public ApiResult<ScheduleView> createSchedule(
            @RequestBody ScheduleMaintenanceService.ScheduleRequest request,
            @AuthenticationPrincipal AuthUser admin) {
        return ApiResult.ok(scheduleMaintenanceService.upsert(null, request, admin));
    }

    @PutMapping("/schedules/{scheduleId}")
    public ApiResult<ScheduleView> updateSchedule(
            @PathVariable Long scheduleId,
            @RequestBody ScheduleMaintenanceService.ScheduleRequest request,
            @AuthenticationPrincipal AuthUser admin) {
        return ApiResult.ok(scheduleMaintenanceService.upsert(scheduleId, request, admin));
    }

    @PostMapping("/schedules/{scheduleId}/close")
    public ApiResult<ScheduleView> closeSchedule(
            @PathVariable Long scheduleId,
            @AuthenticationPrincipal AuthUser admin) {
        return ApiResult.ok(scheduleMaintenanceService.close(scheduleId, admin));
    }
}
