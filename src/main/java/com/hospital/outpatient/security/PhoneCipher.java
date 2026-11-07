package com.hospital.outpatient.security;

import com.hospital.outpatient.config.AppProperties;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * 敏感字段（手机号、身份证号）的 AES-256-GCM 加解密工具，对应 NFR-06。
 * 存储格式 ENC:v1:base64(iv || 密文 || tag)；PLAIN: 前缀表示演示数据尚未加密。
 */
@Component
public class PhoneCipher {

    public static final String PREFIX = "ENC:v1:";
    public static final String PLAIN_PREFIX = "PLAIN:";
    private static final int IV_LENGTH = 12;
    private static final int TAG_BITS = 128;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final AppProperties properties;

    public PhoneCipher(AppProperties properties) {
        this.properties = properties;
    }

    public String encrypt(String plain) {
        if (plain == null || plain.isBlank()) {
            return null;
        }
        if (plain.startsWith(PREFIX)) {
            return plain;
        }
        String raw = plain.startsWith(PLAIN_PREFIX) ? plain.substring(PLAIN_PREFIX.length()) : plain;
        try {
            byte[] iv = new byte[IV_LENGTH];
            RANDOM.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key(), new GCMParameterSpec(TAG_BITS, iv));
            byte[] cipherText = cipher.doFinal(raw.getBytes(StandardCharsets.UTF_8));
            byte[] combined = new byte[iv.length + cipherText.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(cipherText, 0, combined, iv.length, cipherText.length);
            return PREFIX + Base64.getEncoder().encodeToString(combined);
        } catch (Exception ex) {
            throw new IllegalStateException("敏感字段加密失败", ex);
        }
    }

    public String decrypt(String stored) {
        if (stored == null || stored.isBlank()) {
            return null;
        }
        if (stored.startsWith(PLAIN_PREFIX)) {
            return stored.substring(PLAIN_PREFIX.length());
        }
        if (!stored.startsWith(PREFIX)) {
            return stored;
        }
        try {
            byte[] combined = Base64.getDecoder().decode(stored.substring(PREFIX.length()));
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(),
                    new GCMParameterSpec(TAG_BITS, combined, 0, IV_LENGTH));
            return new String(cipher.doFinal(combined, IV_LENGTH, combined.length - IV_LENGTH), StandardCharsets.UTF_8);
        } catch (Exception ex) {
            throw new IllegalStateException("敏感字段解密失败，请检查 app.crypto.aes-key", ex);
        }
    }

    /** 列表展示用的脱敏形式：138****0001。 */
    public String mask(String plain) {
        if (plain == null || plain.length() < 7) {
            return plain;
        }
        StringBuilder builder = new StringBuilder();
        builder.append(plain, 0, 3);
        for (int i = 0; i < plain.length() - 7; i++) {
            builder.append('*');
        }
        builder.append(plain.substring(plain.length() - 4));
        return builder.toString();
    }

    public boolean isPendingMigration(String stored) {
        return stored != null && stored.startsWith(PLAIN_PREFIX);
    }

    private SecretKeySpec key() throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest(properties.getCrypto().getAesKey().getBytes(StandardCharsets.UTF_8));
        return new SecretKeySpec(digest, "AES");
    }
}
