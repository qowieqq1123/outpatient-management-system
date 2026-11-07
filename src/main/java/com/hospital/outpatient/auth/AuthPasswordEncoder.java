package com.hospital.outpatient.auth;

import com.hospital.outpatient.security.PasswordHasher;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class AuthPasswordEncoder implements PasswordEncoder {

    private final PasswordHasher passwordHasher;

    public AuthPasswordEncoder(PasswordHasher passwordHasher) {
        this.passwordHasher = passwordHasher;
    }

    @Override
    public String encode(CharSequence rawPassword) {
        return passwordHasher.hash(rawPassword.toString());
    }

    @Override
    public boolean matches(CharSequence rawPassword, String encodedPassword) {
        return passwordHasher.matches(rawPassword.toString(), encodedPassword);
    }
}
