package com.hospital.outpatient;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 门诊挂号与就诊管理系统启动类。
 * 开启定时任务用于「叫号后 3 分钟未到诊室视为过号」的自动判定（FR-12）。
 */
@SpringBootApplication
@EnableScheduling
public class OutpatientApplication {

    public static void main(String[] args) {
        SpringApplication.run(OutpatientApplication.class, args);
    }
}
