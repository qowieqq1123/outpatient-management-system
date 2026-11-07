package com.hospital.outpatient.common;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** 后端根路径只标识 API 服务，业务 SPA 由独立前端进程交付。 */
@RestController
public class ApiRootController {

    @GetMapping("/")
    public Map<String, Object> index() {
        return Map.of(
                "service", "outpatient-api",
                "version", "1.0.0",
                "frontend", "independent-spa",
                "endpoints", Map.of("rest", "/api", "websocket", "/ws")
        );
    }
}
