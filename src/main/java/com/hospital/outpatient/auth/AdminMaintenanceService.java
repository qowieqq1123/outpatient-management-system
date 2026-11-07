package com.hospital.outpatient.auth;

import com.hospital.outpatient.audit.AuditService;
import com.hospital.outpatient.common.BizCode;
import com.hospital.outpatient.common.BizException;
import com.hospital.outpatient.registration.PatientRepository;
import com.hospital.outpatient.schedule.DoctorRepository;
import com.hospital.outpatient.security.PasswordHasher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;

/** 管理员维护角色目录与登录账号；不提供物理删除，避免破坏审计与业务外键。 */
@Service
public class AdminMaintenanceService {

    private static final Set<String> REF_ROLES = Set.of("PATIENT", "DOCTOR");

    private final RoleRepository roleRepository;
    private final SysUserRepository userRepository;
    private final PatientRepository patientRepository;
    private final DoctorRepository doctorRepository;
    private final PasswordHasher passwordHasher;
    private final AuditService auditService;

    public AdminMaintenanceService(RoleRepository roleRepository,
                                   SysUserRepository userRepository,
                                   PatientRepository patientRepository,
                                   DoctorRepository doctorRepository,
                                   PasswordHasher passwordHasher,
                                   AuditService auditService) {
        this.roleRepository = roleRepository;
        this.userRepository = userRepository;
        this.patientRepository = patientRepository;
        this.doctorRepository = doctorRepository;
        this.passwordHasher = passwordHasher;
        this.auditService = auditService;
    }

    @Transactional(readOnly = true)
    public List<RoleView> roles() {
        return roleRepository.findAllByOrderByRoleCode().stream().map(RoleView::from).toList();
    }

    @Transactional(readOnly = true)
    public List<UserView> users() {
        return userRepository.findAllWithRole().stream().map(UserView::from).toList();
    }

    @Transactional
    public RoleView upsertRole(String roleCode, RoleRequest request, AuthUser admin) {
        Role role;
        boolean created = false;
        if (roleCode == null || roleCode.isBlank()) {
            String code = normalizeCode(request.roleCode(), "角色编码");
            if (roleRepository.existsById(code)) {
                throw new BizException(BizCode.RULE_CONFLICT, "角色编码已存在");
            }
            role = Role.builder().roleCode(code).build();
            created = true;
        } else {
            String code = normalizeCode(roleCode, "角色编码");
            role = roleRepository.findById(code)
                    .orElseThrow(() -> new BizException(BizCode.NOT_FOUND, "角色不存在"));
        }
        role.setRoleName(requireText(request.roleName(), "角色名称", 30));
        role.setPermissions(requireText(request.permissions(), "权限清单", 500));
        roleRepository.saveAndFlush(role);
        auditService.write(admin, "ROLE_UPSERT", "ROLE", role.getRoleCode(),
                "created=" + created + ",name=" + role.getRoleName() + ",permissions=" + role.getPermissions());
        return RoleView.from(role);
    }

    @Transactional
    public UserView upsertUser(Long userId, UserRequest request, AuthUser admin) {
        Role role = roleRepository.findById(normalizeCode(request.roleCode(), "角色编码"))
                .orElseThrow(() -> new BizException(BizCode.NOT_FOUND, "角色不存在"));
        SysUser user;
        boolean created = false;
        if (userId == null) {
            String username = requireText(request.username(), "登录账号", 50);
            if (userRepository.findByUsername(username).isPresent()) {
                throw new BizException(BizCode.RULE_CONFLICT, "登录账号已存在");
            }
            if (request.password() == null || request.password().length() < 6) {
                throw new BizException(400, "新建账号口令至少 6 位");
            }
            user = SysUser.builder()
                    .username(username)
                    .enabled(request.enabled() == null || Boolean.TRUE.equals(request.enabled()))
                    .createdAt(java.time.LocalDateTime.now())
                    .build();
            created = true;
        } else {
            user = userRepository.findById(userId)
                    .orElseThrow(() -> new BizException(BizCode.NOT_FOUND, "用户不存在"));
            if (user.getUserId().equals(admin.getUserId())) {
                if (request.enabled() != null && !request.enabled()) {
                    throw new BizException(BizCode.RULE_CONFLICT, "不能禁用当前登录管理员");
                }
                if (!"ADMIN".equals(role.getRoleCode())) {
                    throw new BizException(BizCode.RULE_CONFLICT, "不能修改当前登录管理员的角色");
                }
            }
        }
        validateRefId(role.getRoleCode(), request.refId());
        user.setRealName(requireText(request.realName(), "姓名", 50));
        user.setRole(role);
        user.setRefId(request.refId());
        if (request.enabled() != null) {
            user.setEnabled(request.enabled());
        }
        if (request.password() != null && !request.password().isBlank()) {
            if (request.password().length() < 6) {
                throw new BizException(400, "重置口令至少 6 位");
            }
            user.setPasswordHash(passwordHasher.hash(request.password()));
        }
        if (user.getPasswordHash() == null) {
            throw new BizException(400, "账号缺少口令");
        }
        userRepository.saveAndFlush(user);
        auditService.write(admin, "USER_UPSERT", "USER", user.getUserId().toString(),
                "username=" + user.getUsername() + ",role=" + role.getRoleCode()
                        + ",enabled=" + user.getEnabled() + ",passwordChanged=" + (request.password() != null && !request.password().isBlank()));
        return UserView.from(user);
    }

    @Transactional
    public UserView setUserEnabled(Long userId, boolean enabled, AuthUser admin) {
        SysUser user = userRepository.findById(userId)
                .orElseThrow(() -> new BizException(BizCode.NOT_FOUND, "用户不存在"));
        if (!enabled && user.getUserId().equals(admin.getUserId())) {
            throw new BizException(BizCode.RULE_CONFLICT, "不能禁用当前登录管理员");
        }
        user.setEnabled(enabled);
        userRepository.saveAndFlush(user);
        auditService.write(admin, "USER_STATUS", "USER", user.getUserId().toString(),
                "username=" + user.getUsername() + ",enabled=" + enabled);
        return UserView.from(user);
    }

    private void validateRefId(String roleCode, Long refId) {
        if (!REF_ROLES.contains(roleCode)) {
            return;
        }
        if (refId == null) {
            throw new BizException(400, "患者/医生账号必须绑定业务档案");
        }
        boolean exists = "PATIENT".equals(roleCode)
                ? patientRepository.existsById(refId)
                : doctorRepository.existsById(refId);
        if (!exists) {
            throw new BizException(BizCode.NOT_FOUND, "业务档案不存在");
        }
    }

    private static String normalizeCode(String value, String label) {
        String code = requireText(value, label, 20).toUpperCase().replaceAll("[^A-Z0-9_]", "_");
        if (code.length() > 20) {
            throw new BizException(400, label + "不能超过 20 个字符");
        }
        return code;
    }

    private static String requireText(String value, String label, int maxLength) {
        if (value == null || value.isBlank()) {
            throw new BizException(400, label + "不能为空");
        }
        String text = value.trim();
        if (text.length() > maxLength) {
            throw new BizException(400, label + "不能超过 " + maxLength + " 个字符");
        }
        return text;
    }

    public record RoleRequest(String roleCode, String roleName, String permissions) {
    }

    public record UserRequest(String username, String realName, String roleCode,
                              Long refId, Boolean enabled, String password) {
    }

    public record RoleView(String roleCode, String roleName, String permissions) {
        static RoleView from(Role role) {
            return new RoleView(role.getRoleCode(), role.getRoleName(), role.getPermissions());
        }
    }

    /** 登录账号视图不含 password_hash，供独立 SPA 管理台安全展示。 */
    public record UserView(Long userId, String username, String realName, String roleCode,
                           Long refId, Boolean enabled, java.time.LocalDateTime createdAt) {
        static UserView from(SysUser user) {
            return new UserView(user.getUserId(), user.getUsername(), user.getRealName(),
                    user.getRole().getRoleCode(), user.getRefId(), user.getEnabled(), user.getCreatedAt());
        }
    }
}
