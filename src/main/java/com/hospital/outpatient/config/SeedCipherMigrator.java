package com.hospital.outpatient.config;

import com.hospital.outpatient.security.PhoneCipher;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * 演示数据里的手机号/身份证以 PLAIN: 前缀存放，首次启动时统一加密回写，
 * 让 NFR-06「存储加密」在真实数据库里可见而不是只写在文档里。
 */
@Component
public class SeedCipherMigrator implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SeedCipherMigrator.class);

    private final JdbcTemplate jdbcTemplate;
    private final PhoneCipher cipher;

    public SeedCipherMigrator(JdbcTemplate jdbcTemplate, PhoneCipher cipher) {
        this.jdbcTemplate = jdbcTemplate;
        this.cipher = cipher;
    }

    @Override
    public void run(ApplicationArguments args) {
        int total = 0;
        total += migrate("patient", "patient_id", List.of("phone_enc", "id_card_enc"));
        total += migrate("doctor", "doctor_id", List.of("phone_enc"));
        total += migrate("department", "dept_id", List.of("phone_enc"));
        if (total > 0) {
            log.info("敏感字段加密迁移完成，共处理 {} 个字段", total);
        }
    }

    private int migrate(String table, String idColumn, List<String> columns) {
        int count = 0;
        for (String column : columns) {
            String sql = "SELECT " + idColumn + " AS id, " + column + " AS value FROM " + table
                    + " WHERE " + column + " LIKE 'PLAIN:%'";
            List<Map<String, Object>> rows = jdbcTemplate.queryForList(sql);
            for (Map<String, Object> row : rows) {
                String encrypted = cipher.encrypt((String) row.get("value"));
                jdbcTemplate.update("UPDATE " + table + " SET " + column + " = ? WHERE " + idColumn + " = ?",
                        encrypted, row.get("id"));
                count++;
            }
        }
        return count;
    }
}
