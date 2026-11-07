package com.hospital.outpatient.common;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import jakarta.validation.ConstraintViolationException;

/** 把业务异常翻译成统一响应体，避免把堆栈暴露给前端。 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(BizException.class)
    public ResponseEntity<ApiResult<Void>> handleBiz(BizException ex) {
        HttpStatus status = ex.getCode() == BizCode.UNAUTHORIZED ? HttpStatus.UNAUTHORIZED : HttpStatus.OK;
        return ResponseEntity.status(status).body(ApiResult.fail(ex.getCode(), ex.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ApiResult<Void> handleValidation(MethodArgumentNotValidException ex) {
        FieldError first = ex.getBindingResult().getFieldError();
        String message = first == null ? "参数不合法" : first.getField() + " " + first.getDefaultMessage();
        return ApiResult.fail(400, message);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ApiResult<Void> handleConstraintViolation(ConstraintViolationException ex) {
        String message = ex.getConstraintViolations().stream()
                .findFirst()
                .map(violation -> violation.getMessage())
                .orElse("参数不合法");
        return ApiResult.fail(400, message);
    }

    @ExceptionHandler({HttpMessageNotReadableException.class,
            MethodArgumentTypeMismatchException.class,
            MissingServletRequestParameterException.class})
    public ApiResult<Void> handleBadRequest(Exception ex) {
        String message = ex instanceof MissingServletRequestParameterException missing
                ? "缺少请求参数：" + missing.getParameterName()
                : "请求参数格式不正确";
        return ApiResult.fail(400, message);
    }

    /** 唯一键、外键与 CHECK 约束统一转成中文业务拒绝，不把 SQL 异常落到 500。 */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ApiResult<Void> handleIntegrity(DataIntegrityViolationException ex) {
        log.warn("数据完整性约束拒绝", ex);
        return ApiResult.fail(BizCode.RULE_CONFLICT, "数据完整性校验未通过，请检查唯一编码或关联档案");
    }

    /** 方法级 @PreAuthorize 拒绝也沿用统一业务码，避免被通用异常处理器改写成 500。 */
    @ExceptionHandler(AccessDeniedException.class)
    public ApiResult<Void> handleAccessDenied(AccessDeniedException ex) {
        return ApiResult.fail(BizCode.FORBIDDEN, "当前角色无权访问");
    }

    @ExceptionHandler(Exception.class)
    public ApiResult<Void> handleOther(Exception ex) {
        log.error("未预期异常", ex);
        return ApiResult.fail(500, "系统繁忙，请稍后重试");
    }
}
