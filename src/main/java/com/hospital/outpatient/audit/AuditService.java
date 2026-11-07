package com.hospital.outpatient.audit;

import com.hospital.outpatient.auth.AuthUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Service
public class AuditService {

    private final AuditTransactionWriter transactionWriter;
    private final ThreadLocal<List<AuditEntry>> pendingEntries = ThreadLocal.withInitial(ArrayList::new);

    public AuditService(AuditTransactionWriter transactionWriter) {
        this.transactionWriter = transactionWriter;
    }

    /**
     * 业务事务中只登记审计事件；外层切面在事务资源释放后同步刷出，避免持行锁时抢占第二条连接。
     */
    public void write(AuthUser user, String action, String targetType, String targetId, String detail) {
        AuditEntry entry = new AuditEntry(user, action, targetType, targetId, detail);
        if (AuditFlushAspect.isFlushStage()) {
            transactionWriter.save(entry);
        } else {
            pendingEntries.get().add(entry);
        }
    }

    List<AuditEntry> drainPendingEntries() {
        List<AuditEntry> entries = new ArrayList<>(pendingEntries.get());
        pendingEntries.get().clear();
        return entries;
    }

    void discardPendingEntries() {
        pendingEntries.remove();
    }

    record AuditEntry(AuthUser user, String action, String targetType, String targetId, String detail) {
    }
}

/** 以 Spring 代理开启独立审计事务，由业务事务外层的切面调用。 */
@Service
class AuditTransactionWriter {

    private final OperationLogRepository repository;

    AuditTransactionWriter(OperationLogRepository repository) {
        this.repository = repository;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void save(AuditService.AuditEntry entry) {
        AuthUser actor = entry.user() == null ? AuthUser.system() : entry.user();
        OperationLog log = OperationLog.builder()
                .operatorId(actor.getUserId())
                .operatorName(actor.getRealName())
                .operatorRole(actor.getRoleCode())
                .action(entry.action())
                .targetType(entry.targetType())
                .targetId(entry.targetId())
                .detail(entry.detail())
                .operateTime(LocalDateTime.now())
                .build();
        repository.saveAndFlush(log);
    }
}
