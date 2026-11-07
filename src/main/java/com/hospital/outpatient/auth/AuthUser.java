package com.hospital.outpatient.auth;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Arrays;
import java.util.Collection;
import java.util.Set;
import java.util.stream.Collectors;

public class AuthUser implements UserDetails {

    private final Long userId;
    private final String username;
    private final String password;
    private final String realName;
    private final String roleCode;
    private final Long refId;
    private final Set<String> permissions;

    public AuthUser(SysUser user) {
        this.userId = user.getUserId();
        this.username = user.getUsername();
        this.password = user.getPasswordHash();
        this.realName = user.getRealName();
        this.roleCode = user.getRole().getRoleCode();
        this.refId = user.getRefId();
        this.permissions = Arrays.stream(user.getRole().getPermissions().split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toUnmodifiableSet());
    }

    /** 定时任务没有登录用户，使用稳定的系统身份，避免审计操作人为空。 */
    public static AuthUser system() {
        return new AuthUser(0L, "system", "", "系统任务", "SYSTEM", null, Set.of());
    }

    private AuthUser(Long userId, String username, String password, String realName,
                     String roleCode, Long refId, Set<String> permissions) {
        this.userId = userId;
        this.username = username;
        this.password = password;
        this.realName = realName;
        this.roleCode = roleCode;
        this.refId = refId;
        this.permissions = permissions == null ? Set.of() : permissions;
    }

    public Long getUserId() {
        return userId;
    }

    public String getRealName() {
        return realName;
    }

    public String getRoleCode() {
        return roleCode;
    }

    public Long getRefId() {
        return refId;
    }

    public Set<String> getPermissions() {
        return permissions;
    }

    public boolean hasPermission(String permission) {
        return permissions.contains(permission);
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return Set.of(new SimpleGrantedAuthority("ROLE_" + roleCode));
    }

    @Override
    public String getPassword() {
        return password;
    }

    @Override
    public String getUsername() {
        return username;
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return true;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return true;
    }
}
