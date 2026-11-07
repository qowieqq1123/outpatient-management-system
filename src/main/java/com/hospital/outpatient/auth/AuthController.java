package com.hospital.outpatient.auth;

import com.hospital.outpatient.common.ApiResult;
import com.hospital.outpatient.common.BizException;
import jakarta.validation.constraints.NotBlank;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.List;

@Validated
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    public record LoginRequest(
            @NotBlank(message = "账号不能为空") String username,
            @NotBlank(message = "密码不能为空") String password) {
    }

    public record RoleView(String role, String label, String demoUsername) {
    }

    @PostMapping("/login")
    public ApiResult<Map<String, Object>> login(@RequestBody @Validated LoginRequest request) {
        try {
            return ApiResult.ok(authService.login(request.username(), request.password()));
        } catch (AuthenticationException ex) {
            throw new BizException(401, "账号或密码错误");
        }
    }

    @GetMapping("/roles")
    public ApiResult<List<RoleView>> roles() {
        return ApiResult.ok(List.of(
                new RoleView("PATIENT", "患者", "pt0001"),
                new RoleView("NURSE", "护士", "nurse01"),
                new RoleView("DOCTOR", "医生", "zhangming"),
                new RoleView("CASHIER", "收费员", "cashier01"),
                new RoleView("PHARMACIST", "药房", "pharma01"),
                new RoleView("ADMIN", "管理员", "admin01")
        ));
    }
}
