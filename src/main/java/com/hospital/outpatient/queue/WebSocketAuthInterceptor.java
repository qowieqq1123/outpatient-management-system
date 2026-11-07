package com.hospital.outpatient.queue;

import com.hospital.outpatient.auth.AuthUser;
import com.hospital.outpatient.auth.JwtTokenProvider;
import com.hospital.outpatient.auth.SysUser;
import com.hospital.outpatient.auth.SysUserRepository;
import com.hospital.outpatient.registration.RegistrationRepository;
import io.jsonwebtoken.Claims;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/** 在 STOMP CONNECT 校验 JWT，并按角色限制队列主题订阅。 */
@Component
public class WebSocketAuthInterceptor implements ChannelInterceptor {

    private static final String TOPIC_PREFIX = "/topic/queue/";
    private static final String MASKED_SUFFIX = "/masked";
    private static final String MASKED_SEGMENT = "/masked/";
    private static final List<String> ACTIVE_QUEUE_STATUSES =
            List.of("REGISTERED", "TRIAGED", "CALLING", "VISITED");

    private final JwtTokenProvider tokenProvider;
    private final SysUserRepository userRepository;
    private final RegistrationRepository registrationRepository;

    public WebSocketAuthInterceptor(JwtTokenProvider tokenProvider,
                                    SysUserRepository userRepository,
                                    RegistrationRepository registrationRepository) {
        this.tokenProvider = tokenProvider;
        this.userRepository = userRepository;
        this.registrationRepository = registrationRepository;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(message);
        StompCommand command = accessor.getCommand();
        if (command == null) {
            return message;
        }
        if (StompCommand.CONNECT == command) {
            AuthUser authUser = authenticate(accessor);
            Authentication authentication =
                    new UsernamePasswordAuthenticationToken(authUser, null, authUser.getAuthorities());
            accessor.setUser(authentication);
            Map<String, Object> session = accessor.getSessionAttributes();
            if (session != null) {
                session.put("WS_AUTH_USER", authUser);
            }
            return MessageBuilder.createMessage(message.getPayload(), accessor.getMessageHeaders());
        }
        if (StompCommand.SUBSCRIBE == command) {
            authorizeSubscription(accessor);
        }
        return message;
    }

    private AuthUser authenticate(StompHeaderAccessor accessor) {
        String token = accessor.getFirstNativeHeader("token");
        Map<String, Object> session = accessor.getSessionAttributes();
        if ((token == null || token.isBlank()) && session != null) {
            Object handshakeToken = session.get("WS_TOKEN");
            token = handshakeToken == null ? null : handshakeToken.toString();
        }
        if (token == null || token.isBlank()) {
            throw new MessageDeliveryException("请先登录");
        }
        try {
            Claims claims = tokenProvider.parse(token);
            SysUser user = userRepository.findByUsernameWithRole(claims.getSubject()).orElse(null);
            if (user == null || !Boolean.TRUE.equals(user.getEnabled())) {
                throw new MessageDeliveryException("登录状态已失效");
            }
            return new AuthUser(user);
        } catch (MessageDeliveryException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new MessageDeliveryException("登录状态已失效");
        }
    }

    private void authorizeSubscription(StompHeaderAccessor accessor) {
        String destination = accessor.getDestination();
        if (destination == null || !destination.startsWith(TOPIC_PREFIX)) {
            return;
        }
        AuthUser user = currentUser(accessor);
        if (user == null) {
            throw new MessageDeliveryException("请先登录");
        }
        QueueTopic topic = parseTopic(destination);
        String role = user.getRoleCode();
        if (topic.masked()) {
            if (!"PATIENT".equals(role)) {
                throw new MessageDeliveryException("当前角色无权订阅患者专属队列");
            }
            if (topic.patientId() == null || user.getRefId() == null
                    || !topic.patientId().equals(user.getRefId())) {
                throw new MessageDeliveryException("无权订阅其他患者的叫号队列");
            }
            if (registrationRepository.existsPatientInDoctorQueue(
                    user.getRefId(), topic.doctorId(), topic.workDate(), ACTIVE_QUEUE_STATUSES)) {
                return;
            }
            throw new MessageDeliveryException("只能查看本人当日挂号对应的叫号队列");
        }
        if ("PATIENT".equals(role)) {
            throw new MessageDeliveryException("患者无权订阅员工完整叫号队列");
        }
        if ("ADMIN".equals(role) || "NURSE".equals(role)) {
            return;
        }
        if ("DOCTOR".equals(role)) {
            if (topic.doctorId().equals(user.getRefId())) {
                return;
            }
            throw new MessageDeliveryException("只能订阅自己的叫号队列");
        }
        throw new MessageDeliveryException("当前角色无权订阅该叫号队列");
    }

    private QueueTopic parseTopic(String destination) {
        try {
            String tail = destination.substring(TOPIC_PREFIX.length());
            int maskedAt = tail.indexOf(MASKED_SEGMENT);
            boolean masked = maskedAt >= 0;
            Long patientId = null;
            if (masked) {
                String patientText = tail.substring(maskedAt + MASKED_SEGMENT.length());
                if (!patientText.matches("\\d+")) {
                    throw new IllegalArgumentException("patient");
                }
                patientId = Long.parseLong(patientText);
                tail = tail.substring(0, maskedAt);
            } else if (tail.endsWith(MASKED_SUFFIX)) {
                throw new IllegalArgumentException("topic");
            }
            String[] parts = tail.split("/");
            if (parts.length != 2 || parts[1].isBlank()) {
                throw new IllegalArgumentException("topic");
            }
            return new QueueTopic(Long.parseLong(parts[0]), LocalDate.parse(parts[1]), masked, patientId);
        } catch (RuntimeException ex) {
            throw new MessageDeliveryException("队列主题不合法");
        }
    }

    private record QueueTopic(Long doctorId, LocalDate workDate, boolean masked, Long patientId) {
    }

    private AuthUser currentUser(StompHeaderAccessor accessor) {
        if (accessor.getUser() instanceof Authentication authentication
                && authentication.getPrincipal() instanceof AuthUser authUser) {
            return authUser;
        }
        Map<String, Object> session = accessor.getSessionAttributes();
        return session == null || !(session.get("WS_AUTH_USER") instanceof AuthUser authUser)
                ? null : authUser;
    }
}
