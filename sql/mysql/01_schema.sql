-- ============================================================
-- 门诊挂号与就诊管理系统 · MySQL 8/9 建表脚本
-- 对应实验三《类图》的 17 个业务类与实验一 NFR-08/09/10 完整性约束
-- 执行：mysql -u root -P 3306 < sql/mysql/01_schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS outpatient
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE outpatient;

-- ---------- 1. 用户与权限 ----------

CREATE TABLE IF NOT EXISTS role (
    role_code   VARCHAR(20)  PRIMARY KEY COMMENT '角色编码',
    role_name   VARCHAR(30)  NOT NULL COMMENT '角色名称',
    permissions TEXT         NOT NULL COMMENT '权限编码清单，逗号分隔',
    CONSTRAINT chk_role_code CHECK (role_code <> '')
) ENGINE = InnoDB COMMENT '角色';

CREATE TABLE IF NOT EXISTS sys_user (
    user_id       BIGINT       AUTO_INCREMENT PRIMARY KEY COMMENT '用户ID',
    username      VARCHAR(50)  NOT NULL UNIQUE COMMENT '登录账号',
    password_hash VARCHAR(255) NOT NULL COMMENT 'PBKDF2 加盐哈希',
    real_name     VARCHAR(50)  NOT NULL COMMENT '姓名',
    role_code     VARCHAR(20)  NOT NULL COMMENT '角色',
    ref_id        BIGINT       NULL COMMENT '业务档案主键（医生/患者/…）',
    enabled       TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '是否启用',
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_role FOREIGN KEY (role_code) REFERENCES role (role_code)
) ENGINE = InnoDB COMMENT '系统登录用户';

-- ---------- 2. 组织架构与人员 ----------

CREATE TABLE IF NOT EXISTS department (
    dept_id   BIGINT      AUTO_INCREMENT PRIMARY KEY COMMENT '科室ID',
    dept_name VARCHAR(50) NOT NULL UNIQUE COMMENT '科室名称',
    leader    VARCHAR(50) NULL COMMENT '负责人',
    location  VARCHAR(50) NULL COMMENT '诊区位置',
    phone_enc VARCHAR(255) NULL COMMENT '科室电话（加密存储）'
) ENGINE = InnoDB COMMENT '科室';

CREATE TABLE IF NOT EXISTS doctor (
    doctor_id  BIGINT      AUTO_INCREMENT PRIMARY KEY COMMENT '医生ID',
    emp_no     VARCHAR(20) NOT NULL UNIQUE COMMENT '工号',
    name       VARCHAR(50) NOT NULL COMMENT '姓名',
    title      VARCHAR(30) NULL COMMENT '职称',
    dept_id    BIGINT      NOT NULL COMMENT '所属科室',
    specialty  VARCHAR(100) NULL COMMENT '擅长',
    phone_enc  VARCHAR(255) NULL COMMENT '联系电话（加密存储）',
    CONSTRAINT fk_doctor_dept FOREIGN KEY (dept_id) REFERENCES department (dept_id)
) ENGINE = InnoDB COMMENT '医生';

CREATE TABLE IF NOT EXISTS patient (
    patient_id     BIGINT      AUTO_INCREMENT PRIMARY KEY COMMENT '患者ID',
    patient_no     VARCHAR(20) NOT NULL UNIQUE COMMENT '病历号',
    name           VARCHAR(50) NOT NULL COMMENT '姓名',
    gender         CHAR(2)     NOT NULL COMMENT '性别',
    birth_date     DATE        NULL COMMENT '出生日期',
    id_card_enc    VARCHAR(255) NULL COMMENT '身份证号（加密存储）',
    phone_enc      VARCHAR(255) NULL COMMENT '手机号（加密存储，NFR-06）',
    insurance_no   VARCHAR(30) NULL COMMENT '医保号',
    insurance_type VARCHAR(10) NOT NULL DEFAULT 'SELF' COMMENT 'SELF自费 / INS医保',
    created_at     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_patient_gender CHECK (gender IN ('男', '女'))
) ENGINE = InnoDB COMMENT '患者';

-- ---------- 3. 排班与号源（FR-01~FR-04） ----------

CREATE TABLE IF NOT EXISTS schedule (
    schedule_id      BIGINT        AUTO_INCREMENT PRIMARY KEY COMMENT '号源ID',
    doctor_id        BIGINT        NOT NULL COMMENT '出诊医生',
    dept_id          BIGINT        NOT NULL COMMENT '出诊科室',
    work_date        DATE          NOT NULL COMMENT '出诊日期',
    time_slot        VARCHAR(30)   NOT NULL COMMENT '出诊时段',
    total_qty        INT           NOT NULL COMMENT '号源总量',
    remaining_qty    INT           NOT NULL COMMENT '号源余量',
    registration_fee DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '挂号费',
    status           VARCHAR(10)   NOT NULL DEFAULT 'OPEN' COMMENT 'OPEN停诊为CLOSED',
    created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_schedule_doctor FOREIGN KEY (doctor_id) REFERENCES doctor (doctor_id),
    CONSTRAINT fk_schedule_dept FOREIGN KEY (dept_id) REFERENCES department (dept_id),
    CONSTRAINT uk_schedule_slot UNIQUE (doctor_id, work_date, time_slot),
    CONSTRAINT chk_schedule_qty CHECK (remaining_qty >= 0 AND remaining_qty <= total_qty)
) ENGINE = InnoDB COMMENT '号源（排班）';

-- ---------- 4. 挂号单（FR-05~FR-09） ----------

CREATE TABLE IF NOT EXISTS registration (
    reg_id        BIGINT        AUTO_INCREMENT PRIMARY KEY COMMENT '挂号ID',
    patient_id    BIGINT        NOT NULL COMMENT '患者',
    schedule_id   BIGINT        NOT NULL COMMENT '所占号源',
    doctor_id     BIGINT        NOT NULL COMMENT '医生',
    dept_id       BIGINT        NOT NULL COMMENT '科室',
    queue_no      INT           NOT NULL COMMENT '号序，过号重排时更新',
    call_order    INT           NULL COMMENT '叫号顺序，由护士维护；过号按规则重排',
    miss_count    INT           NOT NULL DEFAULT 0 COMMENT '累计过号次数',
    active_schedule_id BIGINT GENERATED ALWAYS AS
        (CASE WHEN status IN ('REGISTERED','TRIAGED') THEN schedule_id ELSE NULL END) STORED
        COMMENT '有效挂号号源，用于同患者同号源唯一约束',
    channel       VARCHAR(10)   NOT NULL DEFAULT 'ONLINE' COMMENT 'ONLINE线上/KIOSK自助机',
    status        VARCHAR(20)   NOT NULL DEFAULT 'REGISTERED'
                  COMMENT 'REGISTERED已挂号 TRIAGED已报到 CALLING叫号中 VISITED已就诊 MISSED已过号 CANCELLED已取消 REFUNDED已退号',
    registration_fee DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '挂号费',
    fee_paid      TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '挂号费是否已收',
    reg_time      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '挂号时间',
    triage_time   DATETIME      NULL COMMENT '分诊报到时间',
    called_time   DATETIME      NULL COMMENT '最近一次叫号时间（过号判定基准）',
    arrived_at    DATETIME      NULL COMMENT '患者到诊室时间，为空表示尚未应答',
    queue_version INT           NOT NULL DEFAULT 0 COMMENT '队列版本号，防并发重排',
    end_time      DATETIME      NULL COMMENT '退号/完成时间',
    remark        VARCHAR(200)  NULL,
    CONSTRAINT fk_reg_patient FOREIGN KEY (patient_id) REFERENCES patient (patient_id),
    CONSTRAINT fk_reg_schedule FOREIGN KEY (schedule_id) REFERENCES schedule (schedule_id),
    CONSTRAINT fk_reg_doctor FOREIGN KEY (doctor_id) REFERENCES doctor (doctor_id),
    CONSTRAINT uk_reg_queue UNIQUE (schedule_id, queue_no),
    CONSTRAINT uk_patient_active_schedule UNIQUE (patient_id, active_schedule_id),
    CONSTRAINT chk_reg_status CHECK (status IN
        ('REGISTERED','TRIAGED','CALLING','VISITED','MISSED','CANCELLED','REFUNDED'))
) ENGINE = InnoDB COMMENT '挂号单';

CREATE INDEX idx_reg_doctor_status ON registration (doctor_id, status);
CREATE INDEX idx_reg_patient ON registration (patient_id, reg_time);
CREATE INDEX idx_reg_call ON registration (doctor_id, call_order);

-- ---------- 5. 就诊与病历（FR-13~FR-18） ----------

CREATE TABLE IF NOT EXISTS visit (
    visit_id   BIGINT      AUTO_INCREMENT PRIMARY KEY COMMENT '就诊ID',
    reg_id     BIGINT      NOT NULL UNIQUE COMMENT '来源挂号单',
    patient_id BIGINT      NOT NULL COMMENT '患者',
    doctor_id  BIGINT      NOT NULL COMMENT '医生',
    dept_id    BIGINT      NOT NULL COMMENT '科室',
    start_time DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '接诊时间',
    end_time   DATETIME    NULL COMMENT '结束时间',
    status     VARCHAR(20) NOT NULL DEFAULT 'IN_TREATMENT' COMMENT 'IN_TREATMENT / COMPLETED',
    CONSTRAINT fk_visit_reg FOREIGN KEY (reg_id) REFERENCES registration (reg_id),
    CONSTRAINT fk_visit_patient FOREIGN KEY (patient_id) REFERENCES patient (patient_id),
    CONSTRAINT chk_visit_status CHECK (status IN ('IN_TREATMENT', 'COMPLETED'))
) ENGINE = InnoDB COMMENT '就诊（一次完整接诊过程）';

CREATE TABLE IF NOT EXISTS medical_record (
    record_id        BIGINT      AUTO_INCREMENT PRIMARY KEY COMMENT '病历ID',
    visit_id         BIGINT      NOT NULL UNIQUE COMMENT '所属就诊',
    patient_id       BIGINT      NOT NULL COMMENT '患者',
    doctor_id        BIGINT      NOT NULL COMMENT '书写医生',
    chief_complaint  VARCHAR(200) NOT NULL COMMENT '主诉',
    diagnosis        VARCHAR(300) NOT NULL COMMENT '诊断结果',
    advice           VARCHAR(300) NULL COMMENT '医嘱',
    create_time      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_record_visit FOREIGN KEY (visit_id) REFERENCES visit (visit_id),
    CONSTRAINT fk_record_patient FOREIGN KEY (patient_id) REFERENCES patient (patient_id)
) ENGINE = InnoDB COMMENT '电子病历';

-- ---------- 6. 处方与药品（FR-15/17/24~FR-28） ----------

CREATE TABLE IF NOT EXISTS medicine (
    medicine_id BIGINT        AUTO_INCREMENT PRIMARY KEY COMMENT '药品ID',
    code        VARCHAR(20)   NOT NULL UNIQUE COMMENT '药品编码',
    name        VARCHAR(80)   NOT NULL COMMENT '药品名称',
    spec        VARCHAR(50)   NOT NULL COMMENT '规格',
    unit        VARCHAR(10)   NOT NULL COMMENT '单位',
    category    VARCHAR(10)   NOT NULL DEFAULT 'NORMAL' COMMENT 'NORMAL普通 PSYCHO精神类',
    price       DECIMAL(10,2) NOT NULL COMMENT '零售价（划价依据）',
    stock_qty   INT           NOT NULL DEFAULT 0 COMMENT '库存数量',
    low_warn    INT           NOT NULL DEFAULT 20 COMMENT '库存下限',
    high_warn   INT           NOT NULL DEFAULT 1000 COMMENT '库存上限',
    expiry_date DATE          NULL COMMENT '有效期',
    supplier    VARCHAR(80)   NULL COMMENT '供应商',
    CONSTRAINT chk_medicine_cat CHECK (category IN ('NORMAL', 'PSYCHO')),
    CONSTRAINT chk_medicine_stock CHECK (stock_qty >= 0)
) ENGINE = InnoDB COMMENT '药品与库存';

CREATE TABLE IF NOT EXISTS prescription (
    prescription_id     BIGINT        AUTO_INCREMENT PRIMARY KEY COMMENT '处方ID',
    visit_id            BIGINT        NOT NULL COMMENT '所属就诊（一次就诊可开多张处方）',
    patient_id          BIGINT        NOT NULL COMMENT '患者',
    doctor_id           BIGINT        NOT NULL COMMENT '开方医生',
    category            VARCHAR(10)   NOT NULL DEFAULT 'NORMAL' COMMENT 'NORMAL普通 PSYCHO精神类',
    status              VARCHAR(20)   NOT NULL DEFAULT 'PENDING_FEE'
                        COMMENT 'PENDING_FEE待收费 PAID待审核 APPROVED待发药 DISPENSED已发药 RETURNED已退药 CANCELLED已作废',
    total_amount        DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '处方金额',
    create_time         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    audit_pharmacist    VARCHAR(50)   NULL COMMENT '审核人（FR-24）',
    audit_time          DATETIME      NULL,
    first_signer        VARCHAR(50)   NULL COMMENT '第一签字人（精神类双人签字）',
    second_signer       VARCHAR(50)   NULL COMMENT '第二签字人',
    dispense_pharmacist VARCHAR(50)   NULL COMMENT '发药人',
    dispense_time       DATETIME      NULL,
    CONSTRAINT fk_presc_visit FOREIGN KEY (visit_id) REFERENCES visit (visit_id),
    CONSTRAINT fk_presc_patient FOREIGN KEY (patient_id) REFERENCES patient (patient_id),
    CONSTRAINT chk_presc_cat CHECK (category IN ('NORMAL', 'PSYCHO')),
    CONSTRAINT chk_presc_status CHECK (status IN
        ('PENDING_FEE','PAID','APPROVED','DISPENSED','RETURNED','CANCELLED'))
) ENGINE = InnoDB COMMENT '处方';

CREATE TABLE IF NOT EXISTS prescription_item (
    item_id         BIGINT        AUTO_INCREMENT PRIMARY KEY COMMENT '明细ID',
    prescription_id BIGINT        NOT NULL COMMENT '所属处方',
    medicine_id     BIGINT        NOT NULL COMMENT '药品',
    medicine_name   VARCHAR(80)   NOT NULL COMMENT '药品名称快照',
    quantity        INT           NOT NULL COMMENT '数量',
    unit_price      DECIMAL(10,2) NOT NULL COMMENT '单价快照',
    amount          DECIMAL(10,2) NOT NULL COMMENT '小计',
    usage_text      VARCHAR(100)  NULL COMMENT '用法用量',
    CONSTRAINT fk_item_presc FOREIGN KEY (prescription_id) REFERENCES prescription (prescription_id),
    CONSTRAINT fk_item_medicine FOREIGN KEY (medicine_id) REFERENCES medicine (medicine_id),
    CONSTRAINT chk_item_qty CHECK (quantity > 0)
) ENGINE = InnoDB COMMENT '处方明细';

CREATE INDEX idx_item_presc ON prescription_item (prescription_id);

CREATE TABLE IF NOT EXISTS dispense_record (
    dispense_id     BIGINT      AUTO_INCREMENT PRIMARY KEY COMMENT '发药/退药记录ID',
    prescription_id BIGINT      NOT NULL COMMENT '处方',
    medicine_id     BIGINT      NOT NULL COMMENT '药品',
    quantity        INT         NOT NULL COMMENT '数量',
    biz_type        VARCHAR(10) NOT NULL COMMENT 'DISPENSE发药 RETURN退药',
    operator_id     BIGINT      NOT NULL COMMENT '经办药房人员',
    second_signer   VARCHAR(50) NULL COMMENT '双人签字的第二人',
    create_time     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_dispense_presc FOREIGN KEY (prescription_id) REFERENCES prescription (prescription_id),
    CONSTRAINT chk_dispense_type CHECK (biz_type IN ('DISPENSE', 'RETURN'))
) ENGINE = InnoDB COMMENT '发药与退药流水';

-- ---------- 7. 检查单（FR-16/17） ----------

CREATE TABLE IF NOT EXISTS checkup_catalog (
    item_code VARCHAR(20)   PRIMARY KEY COMMENT '检查项目编码',
    item_name VARCHAR(80)   NOT NULL COMMENT '项目名称',
    category  VARCHAR(20)   NOT NULL COMMENT '分类：检验/影像/功能',
    price     DECIMAL(10,2) NOT NULL COMMENT '标准价',
    enabled   TINYINT(1)    NOT NULL DEFAULT 1
) ENGINE = InnoDB COMMENT '检查项目字典';

CREATE TABLE IF NOT EXISTS checkup_order (
    checkup_id  BIGINT        AUTO_INCREMENT PRIMARY KEY COMMENT '检查单ID',
    visit_id    BIGINT        NOT NULL COMMENT '所属就诊（一次就诊可开多张检查单）',
    patient_id  BIGINT        NOT NULL COMMENT '患者',
    doctor_id   BIGINT        NOT NULL COMMENT '开单医生',
    item_code   VARCHAR(20)   NOT NULL COMMENT '检查项目',
    item_name   VARCHAR(80)   NOT NULL COMMENT '项目名称快照',
    price       DECIMAL(10,2) NOT NULL COMMENT '价格快照',
    status      VARCHAR(20)   NOT NULL DEFAULT 'PENDING_FEE' COMMENT 'PENDING_FEE待收费 PAID已缴费 DONE已完成',
    create_time DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    done_time   DATETIME      NULL,
    result_text VARCHAR(300)  NULL COMMENT '检查结果',
    CONSTRAINT fk_checkup_visit FOREIGN KEY (visit_id) REFERENCES visit (visit_id),
    CONSTRAINT fk_checkup_item FOREIGN KEY (item_code) REFERENCES checkup_catalog (item_code),
    CONSTRAINT chk_checkup_status CHECK (status IN ('PENDING_FEE','PAID','DONE'))
) ENGINE = InnoDB COMMENT '检查单';

-- ---------- 8. 收费与医保（FR-19~FR-23） ----------

CREATE TABLE IF NOT EXISTS fee_bill (
    bill_id          BIGINT        AUTO_INCREMENT PRIMARY KEY COMMENT '收费ID',
    visit_id         BIGINT        NOT NULL COMMENT '就诊',
    patient_id       BIGINT        NOT NULL COMMENT '患者',
    total_amount     DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '应收（自动划价）',
    paid_amount      DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '实收',
    self_amount      DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '自费部分',
    insurance_amount DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '医保统筹部分',
    pay_type         VARCHAR(10)   NULL COMMENT 'SELF自费 INSURANCE医保',
    status           VARCHAR(20)   NOT NULL DEFAULT 'UNPAID' COMMENT 'UNPAID待收费 PAID已收费 RETRY待重试 REFUNDED已退费',
    cashier_id       BIGINT        NULL COMMENT '收费员',
    create_time      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    pay_time         DATETIME      NULL,
    remark           VARCHAR(200)  NULL,
    CONSTRAINT fk_bill_visit FOREIGN KEY (visit_id) REFERENCES visit (visit_id),
    CONSTRAINT fk_bill_patient FOREIGN KEY (patient_id) REFERENCES patient (patient_id),
    CONSTRAINT chk_bill_status CHECK (status IN ('UNPAID','PAID','RETRY','REFUNDED'))
) ENGINE = InnoDB COMMENT '收费单';

CREATE TABLE IF NOT EXISTS fee_item (
    fee_item_id BIGINT        AUTO_INCREMENT PRIMARY KEY COMMENT '收费明细ID',
    bill_id     BIGINT        NOT NULL COMMENT '收费单',
    source_type VARCHAR(20)   NOT NULL COMMENT 'PRESCRIPTION处方 CHECKUP检查 REGISTRATION挂号',
    source_id   BIGINT        NOT NULL COMMENT '来源单据ID',
    item_name   VARCHAR(120)  NOT NULL COMMENT '项目名称',
    amount      DECIMAL(10,2) NOT NULL COMMENT '金额',
    CONSTRAINT fk_feeitem_bill FOREIGN KEY (bill_id) REFERENCES fee_bill (bill_id),
    CONSTRAINT chk_feeitem_type CHECK (source_type IN ('PRESCRIPTION','CHECKUP','REGISTRATION'))
) ENGINE = InnoDB COMMENT '收费明细（划价过程留痕）';

CREATE TABLE IF NOT EXISTS insurance_settlement (
    settlement_id  BIGINT        AUTO_INCREMENT PRIMARY KEY COMMENT '结算ID',
    bill_id        BIGINT        NOT NULL COMMENT '对应收费单（NFR-10）',
    insurance_no   VARCHAR(30)   NOT NULL COMMENT '医保号',
    total_amount   DECIMAL(10,2) NOT NULL COMMENT '本次结算总额',
    fund_amount    DECIMAL(10,2) NOT NULL COMMENT '医保支付',
    self_amount    DECIMAL(10,2) NOT NULL COMMENT '个人自付',
    status         VARCHAR(10)   NOT NULL COMMENT 'SUCCESS成功 FAILED失败',
    trade_no       VARCHAR(40)   NULL COMMENT '外部医保流水号（回传）',
    error_msg      VARCHAR(200)  NULL,
    retry_count    INT           NOT NULL DEFAULT 0 COMMENT '重试次数',
    request_time   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    response_time  DATETIME      NULL,
    CONSTRAINT fk_settle_bill FOREIGN KEY (bill_id) REFERENCES fee_bill (bill_id),
    CONSTRAINT chk_settle_status CHECK (status IN ('SUCCESS', 'FAILED'))
) ENGINE = InnoDB COMMENT '医保结算流水';

CREATE TABLE IF NOT EXISTS refund_record (
    refund_id     BIGINT        AUTO_INCREMENT PRIMARY KEY COMMENT '退费ID',
    bill_id       BIGINT        NULL COMMENT '收费单（退挂号费时为空）',
    reg_id        BIGINT        NULL COMMENT '挂号单',
    patient_id    BIGINT        NOT NULL COMMENT '患者',
    refund_amount DECIMAL(10,2) NOT NULL COMMENT '退费金额',
    refund_type   VARCHAR(20)   NOT NULL COMMENT 'REGISTRATION退挂号费 FEE退医疗费',
    reason        VARCHAR(200)  NULL,
    operator_id   BIGINT        NOT NULL COMMENT '经办收费员',
    create_time   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status        VARCHAR(10)   NOT NULL DEFAULT 'DONE' COMMENT 'DONE已退 PENDING待审',
    CONSTRAINT fk_refund_type CHECK (refund_type IN ('REGISTRATION', 'FEE'))
) ENGINE = InnoDB COMMENT '退费记录';

-- ---------- 9. 操作日志（FR-32 / NFR-07） ----------

CREATE TABLE IF NOT EXISTS operation_log (
    log_id        BIGINT       AUTO_INCREMENT PRIMARY KEY,
    operator_id   BIGINT       NULL COMMENT '操作人用户ID',
    operator_name VARCHAR(50)  NULL COMMENT '操作人姓名',
    operator_role VARCHAR(20)  NULL COMMENT '操作人角色',
    action        VARCHAR(60)  NOT NULL COMMENT '动作，如 CHARGE_PAY / DRUG_DISPENSE / INSURANCE_SETTLE',
    target_type   VARCHAR(30)  NULL COMMENT '对象类型',
    target_id     VARCHAR(40)  NULL COMMENT '对象标识',
    detail        VARCHAR(500) NULL COMMENT '关键参数与结果',
    client_ip     VARCHAR(50)  NULL,
    operate_time  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE = InnoDB COMMENT '关键操作审计日志';

CREATE INDEX idx_log_action ON operation_log (action, operate_time);

-- ---------- 10. 业务视图（供查询统计模块直接取数） ----------

CREATE OR REPLACE VIEW V_QUEUE_BOARD AS
SELECT r.schedule_id, s.dept_id, d.name AS doctor_name, s.work_date, s.time_slot,
       r.reg_id, r.queue_no, r.call_order, r.miss_count, r.status,
       p.patient_no, p.name AS patient_name,
       r.triage_time, r.called_time, r.arrived_at
FROM registration r
JOIN schedule s ON s.schedule_id = r.schedule_id
JOIN doctor d ON d.doctor_id = r.doctor_id
JOIN patient p ON p.patient_id = r.patient_id
WHERE r.status IN ('REGISTERED','TRIAGED','CALLING')
ORDER BY s.work_date, d.name, r.call_order;

CREATE OR REPLACE VIEW V_UNPAID_VISIT AS
SELECT v.visit_id, v.patient_id, p.patient_no, p.name AS patient_name,
       v.doctor_id, d.name AS doctor_name, v.start_time,
       IFNULL((SELECT SUM(total_amount) FROM prescription x
               WHERE x.visit_id = v.visit_id AND x.status = 'PENDING_FEE'), 0)
     + IFNULL((SELECT SUM(price) FROM checkup_order c
               WHERE c.visit_id = v.visit_id AND c.status = 'PENDING_FEE'), 0) AS payable
FROM visit v
JOIN patient p ON p.patient_id = v.patient_id
JOIN doctor d ON d.doctor_id = v.doctor_id
WHERE NOT EXISTS (SELECT 1 FROM fee_bill b WHERE b.visit_id = v.visit_id
                  AND b.status IN ('UNPAID','PAID','RETRY'));

CREATE OR REPLACE VIEW V_MEDICINE_WARNING AS
SELECT medicine_id, code, name, spec, category, stock_qty, low_warn, high_warn, expiry_date,
       CASE WHEN stock_qty <= low_warn THEN '低于下限'
            WHEN stock_qty >= high_warn THEN '高于上限'
            WHEN expiry_date IS NOT NULL AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
            THEN '近效期' ELSE '正常' END AS warning
FROM medicine;
