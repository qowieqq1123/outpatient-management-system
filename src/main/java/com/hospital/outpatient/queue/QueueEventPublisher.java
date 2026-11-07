package com.hospital.outpatient.queue;

import com.hospital.outpatient.registration.RegistrationRepository;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/** 员工主题发送完整看板，患者主题发送脱敏看板。 */
@Service
public class QueueEventPublisher {

    private final RegistrationRepository registrationRepository;
    private final SimpMessagingTemplate messagingTemplate;

    public QueueEventPublisher(RegistrationRepository registrationRepository,
                               SimpMessagingTemplate messagingTemplate) {
        this.registrationRepository = registrationRepository;
        this.messagingTemplate = messagingTemplate;
    }

    public void publish(Long doctorId, LocalDate workDate) {
        List<QueueView> board = registrationRepository.findBoard(doctorId, workDate).stream()
                .map(QueueView::from)
                .toList();
        String prefix = "/topic/queue/" + doctorId + "/" + workDate;
        messagingTemplate.convertAndSend(prefix, board);
        // 每个患者只收到自己的专属主题；其余候诊者的身份字段在 payload 中置空。
        Set<Long> patientIds = board.stream()
                .map(QueueView::patientId)
                .filter(Objects::nonNull)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        for (Long patientId : patientIds) {
            List<QueueView> maskedBoard = board.stream()
                    .map(item -> item.maskedFor(patientId))
                    .toList();
            messagingTemplate.convertAndSend(prefix + "/masked/" + patientId, maskedBoard);
        }
    }
}
