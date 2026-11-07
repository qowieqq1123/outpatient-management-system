package com.hospital.outpatient.auth;

import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
public class AuthService {

    private final AuthenticationManager authenticationManager;
    private final JwtTokenProvider tokenProvider;

    public AuthService(AuthenticationManager authenticationManager, JwtTokenProvider tokenProvider) {
        this.authenticationManager = authenticationManager;
        this.tokenProvider = tokenProvider;
    }

    public Map<String, Object> login(String username, String password) {
        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(username, password));
        AuthUser user = (AuthUser) authentication.getPrincipal();
        String token = tokenProvider.createToken(user);
        return Map.of(
                "token", token,
                "userId", user.getUserId(),
                "username", user.getUsername(),
                "realName", user.getRealName(),
                "role", user.getRoleCode(),
                "refId", user.getRefId() == null ? "" : user.getRefId(),
                "permissions", user.getPermissions()
        );
    }
}
