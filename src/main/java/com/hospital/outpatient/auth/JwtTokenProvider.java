package com.hospital.outpatient.auth;

import com.hospital.outpatient.config.AppProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

@Component
public class JwtTokenProvider {

    private final SecretKey key;
    private final long expireMinutes;

    public JwtTokenProvider(AppProperties properties) {
        this.key = Keys.hmacShaKeyFor(properties.getSecurity().getJwtSecret()
                .getBytes(StandardCharsets.UTF_8));
        this.expireMinutes = properties.getSecurity().getJwtExpireMinutes();
    }

    public String createToken(AuthUser user) {
        Instant now = Instant.now();
        Instant expire = now.plusSeconds(expireMinutes * 60);
        return Jwts.builder()
                .subject(user.getUsername())
                .id(UUID.randomUUID().toString())
                .claim("userId", user.getUserId())
                .claim("realName", user.getRealName())
                .claim("role", user.getRoleCode())
                .claim("refId", user.getRefId())
                .claim("permissions", String.join(",", user.getPermissions()))
                .issuedAt(Date.from(now))
                .expiration(Date.from(expire))
                .signWith(key)
                .compact();
    }

    public Claims parse(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
