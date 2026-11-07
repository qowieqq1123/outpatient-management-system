package com.hospital.outpatient.queue;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** 每 20 秒扫描 3 分钟未应答的叫号记录，业务判定由 QueueService 统一完成。 */
@Component
public class QueueSweeper {

    private static final Logger log = LoggerFactory.getLogger(QueueSweeper.class);

    private final QueueService queueService;

    public QueueSweeper(QueueService queueService) {
        this.queueService = queueService;
    }

    @Scheduled(fixedDelayString = "PT20S", initialDelayString = "PT20S")
    public void sweep() {
        try {
            int count = queueService.sweepMissed();
            if (count > 0) {
                log.info("过号扫描完成，重排 {} 条挂号单", count);
            }
        } catch (Exception ex) {
            log.error("过号扫描失败，下轮继续", ex);
        }
    }
}
