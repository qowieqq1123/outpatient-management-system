package com.hospital.outpatient.common;

/** 与前端约定的业务错误码。 */
public final class BizCode {

    public static final int UNAUTHORIZED = 401;
    public static final int FORBIDDEN = 403;
    public static final int BAD_REQUEST = 400;
    public static final int NOT_FOUND = 404;
    public static final int RULE_CONFLICT = 409;
    public static final int INSURANCE_UNAVAILABLE = 502;

    private BizCode() {
    }
}
