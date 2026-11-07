-- ============================================================
-- 门诊挂号与就诊管理系统 · 演示数据
-- 复用数据库课程设计（医务室门诊）的数据口径并扩展到题目四的业务规则
-- 执行：mysql -u root -P 3306 outpatient < sql/mysql/02_data.sql
-- 说明：手机号/身份证写成 PLAIN: 前缀，首次启动时由 SeedCipherMigrator 加密回写
-- 所有演示账号初始密码：123456
-- ============================================================

USE outpatient;

-- ---------- 角色与权限 ----------
INSERT IGNORE INTO role (role_code, role_name, permissions) VALUES
('PATIENT',    '患者',    'schedule:query,registration:create,registration:cancel,registration:refund,visit:query,self'),
('NURSE',      '护士',    'schedule:query,registration:query,triage:report,queue:maintain'),
('DOCTOR',     '医生',    'schedule:query,registration:query,queue:call,visit:manage,record:manage,prescription:create,checkup:create'),
('CASHIER',    '收费员',  'bill:create,bill:pay,bill:refund,insurance:settle,stats:revenue'),
('PHARMACIST', '药房人员','prescription:audit,prescription:sign,medicine:query,medicine:dispense,medicine:return,medicine:stock'),
('ADMIN',      '系统管理员','user:manage,schedule:manage,dept:manage,stats:all,log:query');

-- ---------- 科室 ----------
INSERT IGNORE INTO department (dept_id, dept_name, leader, location, phone_enc) VALUES
(1, '内科',   '张明', '门诊楼 1 层 101', 'PLAIN:089866551001'),
(2, '外科',   '王强', '门诊楼 2 层 201', 'PLAIN:089866551002'),
(3, '儿科',   '李慧', '门诊楼 2 层 205', 'PLAIN:089866551003'),
(4, '精神科', '陈静', '门诊楼 3 层 301', 'PLAIN:089866551004'),
(5, '眼科',   '刘伟', '门诊楼 3 层 308', 'PLAIN:089866551005');

-- ---------- 医生 ----------
INSERT IGNORE INTO doctor (doctor_id, emp_no, name, title, dept_id, specialty, phone_enc) VALUES
(1, 'D1001', '张明', '主任医师', 1, '高血压、糖尿病',       'PLAIN:13801000001'),
(2, 'D1002', '李慧', '副主任医师', 3, '小儿呼吸、生长发育', 'PLAIN:13801000002'),
(3, 'D1003', '王强', '主治医师', 2, '普外、甲状腺',         'PLAIN:13801000003'),
(4, 'D1004', '陈静', '主任医师', 4, '焦虑抑郁、睡眠障碍',   'PLAIN:13801000004'),
(5, 'D1005', '刘伟', '主治医师', 5, '白内障、青光眼',       'PLAIN:13801000005');

-- ---------- 患者 ----------
INSERT IGNORE INTO patient (patient_id, patient_no, name, gender, birth_date, id_card_enc, phone_enc, insurance_no, insurance_type) VALUES
(1, 'P000001', '林晓', '女', '1993-04-12', 'PLAIN:460100199304120021', 'PLAIN:13907600001', 'HN2024000001', 'INS'),
(2, 'P000002', '陈立', '男', '1965-11-03', 'PLAIN:460100196511030011', 'PLAIN:13907600002', 'HN2024000002', 'INS'),
(3, 'P000003', '赵乐', '男', '2015-06-21', 'PLAIN:460100201506210015', 'PLAIN:13907600003', NULL,           'SELF'),
(4, 'P000004', '孙蕾', '女', '1988-02-08', 'PLAIN:460100198802080028', 'PLAIN:13907600004', 'HN2024000004', 'INS'),
(5, 'P000005', '吴海', '男', '1957-09-30', 'PLAIN:460100195709300019', 'PLAIN:13907600005', 'HN2024000005', 'INS'),
(6, 'P000006', '周颖', '女', '2000-01-17', 'PLAIN:460100200001170026', 'PLAIN:13907600006', NULL,           'SELF'),
(7, 'P000007', '郑凯', '男', '1979-05-25', 'PLAIN:460100197905250017', 'PLAIN:13907600007', 'HN2024000007', 'INS'),
(8, 'P000008', '安琪', '女', '2012-08-09', 'PLAIN:460100201208090024', 'PLAIN:13907600008', NULL,           'SELF');

-- ---------- 药品（含精神类，对应 FR-25 双人签字） ----------
INSERT IGNORE INTO medicine (code, name, spec, unit, category, price, stock_qty, low_warn, high_warn, expiry_date, supplier) VALUES
('M001','苯磺酸氨氯地平片','5mg*7片','盒','NORMAL', 26.50, 320, 50, 800, '2027-06-30','国药控股海南公司'),
('M002','二甲双胍缓释片','0.5g*30片','盒','NORMAL', 33.80, 260, 50, 800, '2027-03-31','华东医药'),
('M003','阿莫西林胶囊','0.25g*24粒','盒','NORMAL', 18.60, 42,  60, 900, '2026-12-31','哈药集团'),
('M004','布洛芬混悬液','100ml','瓶','NORMAL', 15.20, 180, 40, 600, '2027-08-31','国药控股海南公司'),
('M005','氯硝西泮片','2mg*100片','瓶','PSYCHO', 42.00, 60,  20, 200, '2027-01-31','华药集团'),
('M006','奥氮平片','5mg*14片','盒','PSYCHO', 128.70, 55, 20, 200, '2027-05-31','苏糖麦康'),
('M007','阿普唑仑片','0.4mg*20片','盒','PSYCHO', 22.40, 16, 20, 200, '2026-11-30','鲁抗医药'),
('M008','硝酸甘油片','0.5mg*100片','瓶','NORMAL', 12.90, 240, 30, 600, '2027-02-28','乐药制药'),
('M009','左氧氟沙星滴眼液','5ml','瓶','NORMAL', 28.00, 150, 30, 500, '2027-07-31','恒瑞医药'),
('M010','复方甘草片','100片','瓶','NORMAL', 9.80, 1200, 50, 1000, '2027-04-30','修正药业'),
('M011','蒙脱石散','3g*10袋','盒','NORMAL', 21.50, 96, 30, 500, '2027-09-30','博福-益普生'),
('M012','维生素D滴剂','30粒','盒','NORMAL', 45.00, 8, 20, 400, '2026-10-31','星鲨药业');

-- ---------- 检查项目字典 ----------
INSERT IGNORE INTO checkup_catalog (item_code, item_name, category, price, enabled) VALUES
('C001','血常规','检验', 25.00, 1),
('C002','空腹血糖','检验', 18.00, 1),
('C003','糖化血红蛋白','检验', 85.00, 1),
('C004','肝功五项','检验', 60.00, 1),
('C005','胸部正位DR','影像', 110.00, 1),
('C006','腹部彩超','影像', 145.00, 1),
('C007','心电图','功能', 45.00, 1),
('C008','眼底照相','功能', 120.00, 1);

-- ---------- 号源：今天与明天（对应 FR-01/FR-02） ----------
INSERT IGNORE INTO schedule (schedule_id, doctor_id, dept_id, work_date, time_slot, total_qty, remaining_qty, registration_fee, status) VALUES
(1,  1, 1, CURDATE(),                     '上午 08:00-12:00', 25, 22, 25.00, 'OPEN'),
(2,  1, 1, CURDATE(),                     '下午 14:30-17:30', 20, 20, 25.00, 'OPEN'),
(3,  2, 3, CURDATE(),                     '上午 08:00-12:00', 30, 27, 20.00, 'OPEN'),
(4,  3, 2, CURDATE(),                     '下午 14:30-17:30', 18, 18, 25.00, 'OPEN'),
(5,  4, 4, CURDATE(),                     '上午 08:00-12:00',  8,  7, 40.00, 'OPEN'),
(6,  5, 5, CURDATE(),                     '下午 14:30-17:30', 22, 22, 20.00, 'OPEN'),
(7,  1, 1, DATE_ADD(CURDATE(), INTERVAL 1 DAY), '上午 08:00-12:00', 25, 25, 25.00, 'OPEN'),
(8,  2, 3, DATE_ADD(CURDATE(), INTERVAL 1 DAY), '上午 08:00-12:00', 30, 30, 20.00, 'OPEN'),
(9,  4, 4, DATE_ADD(CURDATE(), INTERVAL 1 DAY), '下午 14:30-17:30',  8,  8, 40.00, 'OPEN'),
(10, 3, 2, DATE_ADD(CURDATE(), INTERVAL 2 DAY), '上午 08:00-12:00', 18, 18, 25.00, 'OPEN');

-- ---------- 挂号单：让叫号看板与候诊队列有数据 ----------
INSERT IGNORE INTO registration (reg_id, patient_id, schedule_id, doctor_id, dept_id, queue_no, channel, status, registration_fee, fee_paid, reg_time, triage_time, called_time) VALUES
(1, 1, 1, 1, 1, 1, 'ONLINE', 'VISITED',  25.00, 1, NOW() - INTERVAL 3 HOUR, NOW() - INTERVAL 3 HOUR + INTERVAL 5 MINUTE, NOW() - INTERVAL 3 HOUR + INTERVAL 10 MINUTE),
(2, 2, 1, 1, 1, 2, 'KIOSK',  'CALLING',  25.00, 1, NOW() - INTERVAL 2 HOUR, NOW() - INTERVAL 2 HOUR + INTERVAL 8 MINUTE, NOW() - INTERVAL 1 MINUTE),
(3, 3, 1, 1, 1, 3, 'ONLINE', 'TRIAGED',  20.00, 1, NOW() - INTERVAL 2 HOUR, NOW() - INTERVAL 110 MINUTE, NULL),
(4, 4, 3, 2, 3, 1, 'ONLINE', 'REGISTERED',20.00, 1, NOW() - INTERVAL 1 HOUR, NULL, NULL),
(5, 5, 3, 2, 3, 2, 'KIOSK',  'TRIAGED',  20.00, 1, NOW() - INTERVAL 50 MINUTE, NOW() - INTERVAL 45 MINUTE, NULL),
(6, 6, 5, 4, 4, 1, 'ONLINE', 'MISSED',   40.00, 1, NOW() - INTERVAL 40 MINUTE, NOW() - INTERVAL 35 MINUTE, NOW() - INTERVAL 6 MINUTE);

-- ---------- 就诊与病历（reg_id=1 已完成一次接诊） ----------
INSERT IGNORE INTO visit (visit_id, reg_id, patient_id, doctor_id, dept_id, start_time, end_time, status) VALUES
(1, 1, 1, 1, 1, NOW() - INTERVAL 2 HOUR + INTERVAL 20 MINUTE, NOW() - INTERVAL 100 MINUTE, 'COMPLETED');

INSERT IGNORE INTO medical_record (record_id, visit_id, patient_id, doctor_id, chief_complaint, diagnosis, advice) VALUES
(1, 1, 1, 1, '间断头晕 2 周，晨起明显', '原发性高血压 1 级', '低盐饮食，规律服药，两周后复诊');

INSERT IGNORE INTO prescription (prescription_id, visit_id, patient_id, doctor_id, category, status, total_amount, audit_pharmacist, audit_time, first_signer, second_signer, dispense_pharmacist, dispense_time) VALUES
(1, 1, 1, 1, 'NORMAL', 'DISPENSED', 26.50, '郑洁', NOW() - INTERVAL 80 MINUTE, '郑洁', NULL, '冯磊', NOW() - INTERVAL 70 MINUTE);

INSERT IGNORE INTO prescription_item (item_id, prescription_id, medicine_id, medicine_name, quantity, unit_price, amount, usage_text) VALUES
(1, 1, 1, '苯磺酸氨氯地平片', 1, 26.50, 26.50, '每日一次，每次一片，早餐后');

INSERT IGNORE INTO dispense_record (dispense_id, prescription_id, medicine_id, quantity, biz_type, operator_id, second_signer, create_time) VALUES
(1, 1, 1, 1, 'DISPENSE', 11, NULL, NOW() - INTERVAL 70 MINUTE);

INSERT IGNORE INTO checkup_order (checkup_id, visit_id, patient_id, doctor_id, item_code, item_name, price, status, create_time, done_time, result_text) VALUES
(1, 1, 1, 1, 'C002', '空腹血糖', 18.00, 'DONE', NOW() - INTERVAL 105 MINUTE, NOW() - INTERVAL 95 MINUTE, '5.1 mmol/L，正常'),
(2, 1, 1, 1, 'C007', '心电图',   45.00, 'PAID', NOW() - INTERVAL 105 MINUTE, NULL, NULL);

INSERT IGNORE INTO fee_bill (bill_id, visit_id, patient_id, total_amount, paid_amount, self_amount, insurance_amount, pay_type, status, cashier_id, create_time, pay_time) VALUES
(1, 1, 1, 93.00, 93.00, 27.90, 65.10, 'INSURANCE', 'PAID', 8, NOW() - INTERVAL 90 MINUTE, NOW() - INTERVAL 88 MINUTE);

INSERT IGNORE INTO fee_item (fee_item_id, bill_id, source_type, source_id, item_name, amount) VALUES
(1, 1, 'PRESCRIPTION', 1, '苯磺酸氨氯地平片', 26.50),
(2, 1, 'CHECKUP', 1, '空腹血糖', 18.00),
(3, 1, 'CHECKUP', 2, '心电图', 45.00);

INSERT IGNORE INTO insurance_settlement (settlement_id, bill_id, insurance_no, total_amount, fund_amount, self_amount, status, trade_no, request_time, response_time) VALUES
(1, 1, 'HN2024000001', 93.00, 65.10, 27.90, 'SUCCESS', 'MOCK-HN-000001', NOW() - INTERVAL 88 MINUTE, NOW() - INTERVAL 88 MINUTE + INTERVAL 2 SECOND);

-- ---------- 登录账号（密码统一 123456） ----------
INSERT IGNORE INTO sys_user (username, password_hash, real_name, role_code, ref_id, enabled) VALUES
('admin01',   'pbkdf2:sha256:120000$3TYverDHYfej7z1JpEHpmQ==$NDQGRP9e18WO6B+BqdpqVcJYaSzrjGFmcHAUyLHHwnc=', '王建国', 'ADMIN', NULL, 1),
('zhangming', 'pbkdf2:sha256:120000$iVGAbQCsGlEOHdw6SqTbTg==$mppINJu89tQ762cUDJ4wYyedZv4OMjVWuvbU4aEKVfU=', '张明', 'DOCTOR', 1, 1),
('lihui',     'pbkdf2:sha256:120000$zoOQ9+Dss7guoZMMyYoWJQ==$9YJ72DKOjJUOq34sYnc+MivMheipkACDFWUOGqwp+Lg=', '李慧', 'DOCTOR', 2, 1),
('wangqiang', 'pbkdf2:sha256:120000$0TZMEwQTtOH7EUPsVsqniw==$i8eMDbo4cOjZTcAKwANB+ZPqC+8tG6eaHYOr3p5arnw=', '王强', 'DOCTOR', 3, 1),
('chenjing',  'pbkdf2:sha256:120000$GSRimyQFTKJd/aNRu9aVcg==$F/Ubqd/Kwbw/AZdggmyhopwwXq9ftrV7MjzDCqaoDyI=', '陈静', 'DOCTOR', 4, 1),
('liuwei',    'pbkdf2:sha256:120000$uCvP34yVS8dzUyEJ29uiSA==$xK4lEhZ3QB+wrh0Nbfi2Tdx+mbQJIOXLvSRaHzjDbY0=', '刘伟', 'DOCTOR', 5, 1),
('nurse01',   'pbkdf2:sha256:120000$NZc31qI2c/WMRc9HcY6f2g==$5HqJaKSFCKzSoktvNKf3eaRwh6qXcJD9r+unzNXVrH8=', '孙雪', 'NURSE', NULL, 1),
('cashier01', 'pbkdf2:sha256:120000$6DBD2FOVyGU5hBcNlNPajw==$rYPabNRdppO3nBhZ+80HsZrklcwNTBMXM4yqMOk1Dj8=', '周芳', 'CASHIER', NULL, 1),
('cashier02', 'pbkdf2:sha256:120000$X2ow8g9WWRpTt3fdjFSI9Q==$DcKFIdv6vk7pO9az+iXKFVRF56jwkn32FIXU4tonaXA=', '吴迪', 'CASHIER', NULL, 1),
('pharma01',  'pbkdf2:sha256:120000$yMtOGOLHaYmB+SZcn6zz9w==$1R4pukiabkaCIt6DrvdlF4V5vH/NDe/MO2VLQGMxwxE=', '郑洁', 'PHARMACIST', NULL, 1),
('pharma02',  'pbkdf2:sha256:120000$DQVTtlUaaE89+FM+dALTpA==$lncxrz6HBRkE14rlx3oMg4JYaT7zFlXCJZVCOUNtY8s=', '冯磊', 'PHARMACIST', NULL, 1),
('pt0001',    'pbkdf2:sha256:120000$VRMk2SA1ykRUYXCjO3XFIw==$DsT9PVUEDeExIJMfAZ7Qlc3lauoByamPaZw1h0pgpvo=', '林晓', 'PATIENT', 1, 1),
('pt0002',    'pbkdf2:sha256:120000$gK3gevKAsGql4nn1SOWziw==$hq4+SLQ14ejVcwgEf+aDI/prQyEM3oFqj9Dr74P3rFU=', '陈立', 'PATIENT', 2, 1),
('pt0003',    'pbkdf2:sha256:120000$kTNgV5VTYzZ6G3KRLmafgg==$ATqZlAL0WpGBlKa65S2d5Q9OijZT93yN+8tWfqFlpog=', '赵乐', 'PATIENT', 3, 1),
('pt0004',    'pbkdf2:sha256:120000$pIuy7jMVC3C9h2fy9gRyVg==$/PiMa0CbB1s/yQU9VWA6AtCFxuaeAVXR3MhZ8/O2nD4=', '孙蕾', 'PATIENT', 4, 1);
