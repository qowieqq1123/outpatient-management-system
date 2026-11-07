package com.hospital.outpatient.common;

/** 业务规则冲突，例如号源挂满、处方未审核、精神类药品缺少双人签字。 */
public class BizException extends RuntimeException {

    private final int code;

    public BizException(String message) {
        this(400, message);
    }

    public BizException(int code, String message) {
        super(message);
        this.code = code;
    }

    public int getCode() {
        return code;
    }
}
