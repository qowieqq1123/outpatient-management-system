package com.hospital.outpatient.audit;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/** 在业务事务结束之后写独立审计事务，避免同一请求持两条数据库连接。 */
@Aspect
@Component
@Order(0)
public class AuditFlushAspect {

    private static final Logger log = LoggerFactory.getLogger(AuditFlushAspect.class);
    private static final ThreadLocal<Boolean> FLUSH_STAGE = ThreadLocal.withInitial(() -> false);

    private final AuditService auditService;

    public AuditFlushAspect(AuditService auditService) {
        this.auditService = auditService;
    }

    public static boolean isFlushStage() {
        return FLUSH_STAGE.get();
    }

    @Around("execution(* com.hospital.outpatient..*Controller.*(..)) "
            + "|| @annotation(org.springframework.scheduling.annotation.Scheduled)")
    public Object flushAfterController(ProceedingJoinPoint joinPoint) throws Throwable {
        boolean outer = !FLUSH_STAGE.get();
        Object result;
        Throwable failure = null;
        try {
            result = joinPoint.proceed();
            return result;
        } catch (Throwable ex) {
            failure = ex;
            throw ex;
        } finally {
            if (outer) {
                FLUSH_STAGE.set(true);
                try {
                    // 业务成功才写成功审计；失败或回滚时丢弃本次登记的条目。
                    if (failure == null) {
                        for (AuditService.AuditEntry entry : auditService.drainPendingEntries()) {
                            try {
                                auditService.write(entry.user(), entry.action(), entry.targetType(),
                                        entry.targetId(), entry.detail());
                            } catch (RuntimeException ex) {
                                log.error("审计事务写入失败：action={}, target={}", entry.action(), entry.targetId(), ex);
                            }
                        }
                    } else {
                        auditService.discardPendingEntries();
                    }
                } finally {
                    FLUSH_STAGE.remove();
                }
            }
        }
    }
}
