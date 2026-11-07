package com.hospital.outpatient.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/** 系统可调参数：字段加密密钥、医保接口行为、过号规则。 */
@Component
@ConfigurationProperties(prefix = "app")
public class AppProperties {

    private final Crypto crypto = new Crypto();
    private final Insurance insurance = new Insurance();
    private final Queue queue = new Queue();
    private final Security security = new Security();

    public Crypto getCrypto() {
        return crypto;
    }

    public Insurance getInsurance() {
        return insurance;
    }

    public Queue getQueue() {
        return queue;
    }

    public Security getSecurity() {
        return security;
    }


    public static class Crypto {
        /** AES-GCM 主密钥原文，生产环境应放入密钥管理服务。 */
        private String aesKey;

        public String getAesKey() {
            return aesKey;
        }

        public void setAesKey(String aesKey) {
            this.aesKey = aesKey;
        }
    }

    public static class Insurance {
        /** NORMAL 正常结算 / FAIL 模拟医保系统不可用 / TIMEOUT 模拟超时。 */
        private String mode = "NORMAL";
        /** 医保统筹支付比例，用于模拟费用回传。 */
        private double fundRatio = 0.7d;
        /** 外部医保系统地址，仅作展示与扩展说明。 */
        private String endpoint = "http://insurance.local/api/settle";

        public String getMode() {
            return mode;
        }

        public void setMode(String mode) {
            this.mode = mode;
        }

        public double getFundRatio() {
            return fundRatio;
        }

        public void setFundRatio(double fundRatio) {
            this.fundRatio = fundRatio;
        }

        public String getEndpoint() {
            return endpoint;
        }

        public void setEndpoint(String endpoint) {
            this.endpoint = endpoint;
        }
    }

    public static class Queue {
        /** 叫号后多少分钟未到诊室判为过号（FR-12）。 */
        private int missMinutes = 3;
        /** 过号重排队时插到当前号后第几位（FR-12）。 */
        private int insertBehind = 3;

        public int getMissMinutes() {
            return missMinutes;
        }

        public void setMissMinutes(int missMinutes) {
            this.missMinutes = missMinutes;
        }

        public int getInsertBehind() {
            return insertBehind;
        }

        public void setInsertBehind(int insertBehind) {
            this.insertBehind = insertBehind;
        }
    }

    public static class Security {
        private String jwtSecret;
        private long jwtExpireMinutes = 720;

        public String getJwtSecret() {
            return jwtSecret;
        }

        public void setJwtSecret(String jwtSecret) {
            this.jwtSecret = jwtSecret;
        }

        public long getJwtExpireMinutes() {
            return jwtExpireMinutes;
        }

        public void setJwtExpireMinutes(long jwtExpireMinutes) {
            this.jwtExpireMinutes = jwtExpireMinutes;
        }
    }

}
