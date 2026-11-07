import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiBase = process.env.API_BASE || 'http://127.0.0.1:8080';
const mysql = process.env.MYSQL_BIN || 'C:/Program Files/MySQL/MySQL Server 9.7/bin/mysql.exe';
const outDir = process.env.UI_OUT_DIR || path.join(projectRoot, 'docs', 'images');
const reportFile = path.join(outDir, 'audit-integrity-report.json');
const suffix = `AU${Date.now().toString().slice(-6)}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
const username = `aud${suffix}`;
const patientNoA = `AUA${suffix}`;
const patientNoC = `AUC${suffix}`;
const patientNoD = `AUD${suffix}`;
const timeSlot = `审计验收 ${suffix}`;
const startAtLocal = localDateTime(new Date(Date.now() - 2000));
const fixture = {
  suffix, username, patientNoA, patientNoC, patientNoD, timeSlot,
  pidA: null, pidC: null, pidD: null, userId: null, scheduleId: null,
  regBook: null, regArrive: null, regMiss: null, visitId: null,
  checkupId: null, billId: null, workDate: null
};
const report = {
  scenario: 'AC-29 / 关键操作审计完整性与 SYSTEM 身份',
  baseline: 'V1.7',
  generatedAt: new Date().toISOString(),
  apiBase, startAtLocal, fixture, checks: {}, errors: [], cleanup: [], passed: false
};

const expect = (ok, message) => { if (!ok) report.errors.push(message); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const record = (name, value) => { report.checks[name] = value; console.log(name, JSON.stringify(value)); };

function localDateTime(date) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function mysqlRows(sql) {
  const result = spawnSync(mysql, [
    '-h', '127.0.0.1', '-P', '3306', '-u', 'root',
    '--default-character-set=utf8mb4', '-D', 'outpatient', '-N', '-B',
    '-e', `SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;\n${sql}`
  ], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`MySQL 执行失败：${result.stderr || result.stdout}`);
  return String(result.stdout || '').split(/\r?\n/).filter(Boolean).map(line => line.split('\t'));
}

async function login(account) {
  const response = await fetch(`${apiBase}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: account, password: '123456' })
  });
  const payload = await response.json();
  if (payload.code !== 0) throw new Error(`登录失败 ${account}: ${payload.message}`);
  return payload.data;
}

async function api(pathname, token, method = 'GET', body) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(apiBase + pathname, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { httpStatus: response.status, ...(await response.json()) };
}

function setupFixture() {
  const sql = `
SET @suffix='${suffix}';
SET @workDate=DATE_ADD(CURDATE(), INTERVAL 41 DAY);
INSERT INTO patient (patient_no,name,gender,birth_date,insurance_type)
VALUES ('${patientNoA}','审计患者甲','男','1990-01-01','SELF'),
       ('${patientNoC}','审计患者丙','女','1991-01-01','SELF'),
       ('${patientNoD}','审计患者丁','男','1992-01-01','SELF');
SET @pidA=(SELECT patient_id FROM patient WHERE patient_no='${patientNoA}');
SET @pidC=(SELECT patient_id FROM patient WHERE patient_no='${patientNoC}');
SET @pidD=(SELECT patient_id FROM patient WHERE patient_no='${patientNoD}');
INSERT INTO sys_user (username,password_hash,real_name,role_code,ref_id,enabled)
SELECT '${username}',p.password_hash,'审计患者甲','PATIENT',@pidA,1
FROM (SELECT password_hash FROM sys_user WHERE username='pt0001') p;
SET @uid=LAST_INSERT_ID();
INSERT INTO schedule (doctor_id,dept_id,work_date,time_slot,total_qty,remaining_qty,registration_fee,status,created_at)
VALUES (1,1,@workDate,'${timeSlot}',10,8,25.00,'OPEN',NOW());
SET @sid=LAST_INSERT_ID();
INSERT INTO registration
  (patient_id,schedule_id,doctor_id,dept_id,queue_no,call_order,miss_count,channel,status,
   registration_fee,fee_paid,reg_time,triage_time,called_time,arrived_at,queue_version,remark)
VALUES (@pidC,@sid,1,1,2,2,0,'ONLINE','CALLING',25.00,1,NOW(),NOW(),NOW(),NULL,0,'V1.7 审计到诊 ${suffix}'),
       (@pidD,@sid,1,1,3,3,0,'ONLINE','CALLING',25.00,1,NOW(),NOW(),DATE_SUB(NOW(), INTERVAL 10 MINUTE),NULL,0,'V1.7 审计过号 ${suffix}');
SET @regArrive=(SELECT reg_id FROM registration WHERE remark='V1.7 审计到诊 ${suffix}');
SET @regMiss=(SELECT reg_id FROM registration WHERE remark='V1.7 审计过号 ${suffix}');
INSERT INTO visit (reg_id,patient_id,doctor_id,dept_id,start_time,end_time,status)
VALUES (@regArrive,@pidC,1,1,NOW(),NULL,'IN_TREATMENT');
SET @visitId=LAST_INSERT_ID();
INSERT INTO checkup_order
  (visit_id,patient_id,doctor_id,item_code,item_name,price,status,create_time)
VALUES (@visitId,@pidC,1,'C001','血常规',25.00,'PENDING_FEE',NOW());
SET @checkupId=LAST_INSERT_ID();
SELECT CONCAT_WS('|',@pidA,@pidC,@pidD,@uid,@sid,@regArrive,@regMiss,@visitId,@checkupId,DATE_FORMAT(@workDate,'%Y-%m-%d'));
`;
  const line = mysqlRows(sql).map(row => row[0]).filter(value => value && value.includes('|')).at(-1);
  if (!line) throw new Error('审计验收夹具未返回主键');
  const values = line.split('|');
  Object.assign(fixture, {
    pidA: Number(values[0]), pidC: Number(values[1]), pidD: Number(values[2]),
    userId: Number(values[3]), scheduleId: Number(values[4]),
    regArrive: Number(values[5]), regMiss: Number(values[6]),
    visitId: Number(values[7]), checkupId: Number(values[8]), workDate: values[9]
  });
}

function auditRows() {
  const sql = `
SELECT CONCAT_WS('|',log_id,IFNULL(operator_id,'NULL'),IFNULL(operator_name,'NULL'),
  IFNULL(operator_role,'NULL'),action,IFNULL(target_type,'NULL'),IFNULL(target_id,'NULL'),
  DATE_FORMAT(operate_time,'%Y-%m-%d %H:%i:%s'))
FROM operation_log
WHERE operate_time >= '${startAtLocal}'
  AND action IN ('REGISTRATION_BOOK','QUEUE_REPORT','QUEUE_ARRIVE','BILL_PRICE','QUEUE_MISS')
ORDER BY log_id;
`;
  return mysqlRows(sql).map(row => row[0])
    .filter(value => value && value.includes('|'))
    .map(line => {
      const [logId, operatorId, operatorName, operatorRole, action, targetType, targetId, operateTime] = line.split('|');
      return {
        logId: Number(logId), operatorId: operatorId === 'NULL' ? null : Number(operatorId),
        operatorName: operatorName === 'NULL' ? null : operatorName,
        operatorRole: operatorRole === 'NULL' ? null : operatorRole,
        action, targetType: targetType === 'NULL' ? null : targetType,
        targetId: targetId === 'NULL' ? null : targetId, operateTime
      };
    });
}

function findAudit(rows, action, targetId) {
  return rows.find(row => row.action === action && String(row.targetId) === String(targetId)) || null;
}

function cleanupFixture() {
  const ids = {
    pidA: fixture.pidA || -1, pidC: fixture.pidC || -1, pidD: fixture.pidD || -1,
    userId: fixture.userId || -1, sid: fixture.scheduleId || -1,
    regBook: fixture.regBook || -1, regArrive: fixture.regArrive || -1, regMiss: fixture.regMiss || -1,
    visitId: fixture.visitId || -1, checkupId: fixture.checkupId || -1, billId: fixture.billId || -1
  };
  const regIds = [ids.regBook, ids.regArrive, ids.regMiss].join(',');
  const patientIds = [ids.pidA, ids.pidC, ids.pidD].join(',');
  const patientNos = [patientNoA, patientNoC, patientNoD].map(value => `'${value}'`).join(',');
  const idSet = id => id && id > 0 ? String(id) : '-1';
  const visitIds = [idSet(ids.visitId)].join(',');
  const billIds = [idSet(ids.billId)].join(',');
  const logWhere = `(target_type='REGISTRATION' AND target_id IN (CAST(${ids.regBook} AS CHAR),CAST(${ids.regArrive} AS CHAR),CAST(${ids.regMiss} AS CHAR)))
    OR (target_type='BILL' AND target_id IN (CAST(${ids.billId} AS CHAR)))
    OR (target_type='SCHEDULE' AND target_id=CAST(${ids.sid} AS CHAR))
    OR (target_type='VISIT' AND target_id=CAST(${ids.visitId} AS CHAR))
    OR operator_id=${ids.userId}
    OR detail LIKE CONCAT('%','${suffix}','%')`;
  const sql = `
DELETE FROM operation_log WHERE ${logWhere};
DELETE FROM insurance_settlement WHERE bill_id IN (${billIds})
  OR bill_id IN (SELECT bill_id FROM fee_bill WHERE visit_id IN (${visitIds}));
DELETE FROM fee_item WHERE bill_id IN (${billIds})
  OR bill_id IN (SELECT bill_id FROM fee_bill WHERE visit_id IN (${visitIds}));
DELETE FROM refund_record WHERE bill_id IN (${billIds})
  OR bill_id IN (SELECT bill_id FROM fee_bill WHERE visit_id IN (${visitIds}))
  OR reg_id IN (${regIds});
DELETE FROM fee_bill WHERE bill_id IN (${billIds}) OR visit_id IN (${visitIds});
DELETE FROM dispense_record WHERE prescription_id IN (SELECT prescription_id FROM prescription WHERE visit_id IN (${visitIds}));
DELETE FROM prescription_item WHERE prescription_id IN (SELECT prescription_id FROM prescription WHERE visit_id IN (${visitIds}));
DELETE FROM prescription WHERE visit_id IN (${visitIds});
DELETE FROM checkup_order WHERE checkup_id=${ids.checkupId} OR visit_id IN (${visitIds});
DELETE FROM medical_record WHERE visit_id IN (${visitIds});
DELETE FROM visit WHERE visit_id IN (${visitIds}) OR reg_id IN (${regIds});
DELETE FROM registration WHERE reg_id IN (${regIds}) OR schedule_id=${ids.sid}
  OR remark LIKE CONCAT('%','${suffix}','%');
DELETE FROM schedule WHERE schedule_id=${ids.sid} OR time_slot='${timeSlot}';
DELETE FROM sys_user WHERE user_id=${ids.userId} OR username='${username}';
DELETE FROM patient WHERE patient_id IN (${patientIds}) OR patient_no IN (${patientNos});
SELECT CONCAT_WS('|',
  (SELECT COUNT(*) FROM patient WHERE patient_no IN (${patientNos})),
  (SELECT COUNT(*) FROM sys_user WHERE username='${username}'),
  (SELECT COUNT(*) FROM schedule WHERE schedule_id=${ids.sid} OR time_slot='${timeSlot}'),
  (SELECT COUNT(*) FROM registration WHERE reg_id IN (${regIds}) OR schedule_id=${ids.sid}
    OR remark LIKE CONCAT('%','${suffix}','%')),
  (SELECT COUNT(*) FROM visit WHERE visit_id IN (${visitIds}) OR reg_id IN (${regIds})),
  (SELECT COUNT(*) FROM checkup_order WHERE checkup_id=${ids.checkupId} OR visit_id IN (${visitIds})),
  (SELECT COUNT(*) FROM fee_bill WHERE bill_id IN (${billIds}) OR visit_id IN (${visitIds})),
  (SELECT COUNT(*) FROM fee_item WHERE bill_id IN (${billIds})),
  (SELECT COUNT(*) FROM operation_log WHERE ${logWhere}),
  (SELECT COUNT(*) FROM role),
  (SELECT COUNT(*) FROM sys_user),
  (SELECT COUNT(*) FROM schedule),
  (SELECT COUNT(*) FROM registration),
  (SELECT COUNT(*) FROM refund_record),
  (SELECT COUNT(*) FROM fee_bill),
  (SELECT COUNT(*) FROM insurance_settlement),
  (SELECT COUNT(*) FROM checkup_order));
`;
  const line = mysqlRows(sql).map(row => row[0]).filter(value => value && value.includes('|')).at(-1);
  const v = line ? line.split('|').map(Number) : [];
  const residual = {
    tempPatients: v[0], tempUsers: v[1], tempSchedules: v[2], tempRegistrations: v[3],
    tempVisits: v[4], tempCheckups: v[5], tempBills: v[6], tempFeeItems: v[7], tempOperationLogs: v[8]
  };
  const baseline = {
    roles: v[9], users: v[10], schedules: v[11], registrations: v[12],
    refundRecords: v[13], bills: v[14], settlements: v[15], checkups: v[16]
  };
  const zeroResidual = Object.values(residual).every(value => value === 0);
  const cleanBaseline = baseline.roles === 6 && baseline.users === 15
    && baseline.schedules === 10 && baseline.registrations === 7
    && baseline.refundRecords === 0 && baseline.bills === 3
    && baseline.settlements === 2 && baseline.checkups === 4;
  report.cleanup.push({ status: zeroResidual && cleanBaseline ? 'PASS' : 'FAIL', residual, baseline });
  expect(zeroResidual, `审计验收临时夹具未清理干净：${JSON.stringify(residual)}`);
  expect(cleanBaseline, `审计验收后演示数据基线异常：${JSON.stringify(baseline)}`);
}

async function main() {
  try {
    const preCandidates = Number(mysqlRows(
      "SELECT COUNT(*) FROM registration WHERE status='CALLING' AND arrived_at IS NULL AND called_time <= DATE_SUB(NOW(), INTERVAL 3 MINUTE);"
    )[0]?.[0] || 0);
    expect(preCandidates === 0, `过号扫描前存在 ${preCandidates} 条历史待扫描记录，会干扰演示数据`);
    setupFixture();
    const patient = await login(username);
    const nurse = await login('nurse01');
    const doctor = await login('zhangming');
    const cashier = await login('cashier01');
    const admin = await login('admin01');

    const book = await api('/api/registrations', patient.token, 'POST', {
      patientId: fixture.pidA, scheduleId: fixture.scheduleId, channel: 'ONLINE'
    });
    expect(book.code === 0, `临时挂号失败：${book.message}`);
    fixture.regBook = Number(book.data?.regId);
    record('REGISTRATION_BOOK', { code: book.code, regId: fixture.regBook, queueNo: book.data?.queueNo });

    const reportAction = await api('/api/queue/report', nurse.token, 'POST', { regId: fixture.regBook });
    record('QUEUE_REPORT', { code: reportAction.code, status: reportAction.data?.status, callOrder: reportAction.data?.callOrder });
    expect(reportAction.code === 0 && reportAction.data?.status === 'TRIAGED', `临时报到失败：${reportAction.message}`);

    const arrive = await api('/api/queue/arrive', doctor.token, 'POST', { regId: fixture.regArrive });
    record('QUEUE_ARRIVE', { code: arrive.code, arrivedAt: arrive.data?.arrivedAt });
    expect(arrive.code === 0 && !!arrive.data?.arrivedAt, `医生到诊确认失败：${arrive.message}`);

    const price = await api('/api/bills/price', cashier.token, 'POST', { visitId: fixture.visitId });
    fixture.billId = Number(price.data?.billId);
    record('BILL_PRICE', {
      code: price.code, billId: fixture.billId,
      status: price.data?.status, totalAmount: price.data?.totalAmount
    });
    expect(price.code === 0 && fixture.billId > 0, `临时划价失败：${price.message}`);

    const sweep = await api('/api/queue/sweep', admin.token, 'POST');
    record('QUEUE_SWEEP_TRIGGER', { code: sweep.code, swept: sweep.data });
    expect(sweep.code === 0, `手动过号扫描失败：${sweep.message}`);

    let rows = [];
    for (let i = 0; i < 25; i++) {
      rows = auditRows();
      if (findAudit(rows, 'QUEUE_MISS', fixture.regMiss)) break;
      await delay(1000);
    }
    record('AUDIT_ROWS', rows);

    const required = [
      { action: 'REGISTRATION_BOOK', targetId: fixture.regBook, role: 'PATIENT', operatorId: Number(patient.userId) },
      { action: 'QUEUE_REPORT', targetId: fixture.regBook, role: 'NURSE', operatorId: Number(nurse.userId) },
      { action: 'QUEUE_ARRIVE', targetId: fixture.regArrive, role: 'DOCTOR', operatorId: Number(doctor.userId) },
      { action: 'BILL_PRICE', targetId: fixture.billId, role: 'CASHIER', operatorId: Number(cashier.userId) },
      { action: 'QUEUE_MISS', targetId: fixture.regMiss, role: 'SYSTEM', operatorId: 0, operatorName: '系统任务' }
    ];
    for (const item of required) {
      const row = findAudit(rows, item.action, item.targetId);
      expect(!!row, `缺少 ${item.action} 审计记录，目标 ${item.targetId}`);
      if (!row) continue;
      expect(row.operatorRole === item.role
        && row.operatorId === item.operatorId
        && !!row.operatorName
        && !!row.targetType
        && !!row.operateTime,
      `${item.action} 审计操作人/角色/对象/时间不完整：${JSON.stringify(row)}`);
      if (item.operatorName) expect(row.operatorName === item.operatorName, `定时任务身份不是 ${item.operatorName}`);
      record(`AUDIT_${item.action}`, row);
    }

    const auditService = fs.readFileSync(
      path.join(projectRoot, 'src/main/java/com/hospital/outpatient/audit/AuditService.java'), 'utf8');
    const auditAspect = fs.readFileSync(
      path.join(projectRoot, 'src/main/java/com/hospital/outpatient/audit/AuditFlushAspect.java'), 'utf8');
    const sd = fs.readFileSync(
      path.join(projectRoot, 'docs/03-详细设计说明书-SD时序图与状态图.md'), 'utf8');
    const dbd = fs.readFileSync(
      path.join(projectRoot, 'docs/04-数据库设计说明书.md'), 'utf8');
    const semantics = {
      requiresNew: auditService.includes('Propagation.REQUIRES_NEW'),
      postTransactionFlush: auditService.includes('pendingEntries')
        && auditAspect.includes('@Around') && auditAspect.includes('Scheduled')
        && !auditService.includes('afterCommit'),
      notAtomicInSd: sd.includes('不等同业务与日志同事务原子一致'),
      noDoubleConnectionInDbd: dbd.includes('业务事务释放连接后')
    };
    record('REQUIRES_NEW_SEMANTICS', semantics);
    expect(Object.values(semantics).every(Boolean), 'REQUIRES_NEW 外层切面独立事务语义未在源代码或文档中正确说明');
  } catch (error) {
    report.fatal = error.stack || error.message;
    report.errors.push(`验收中断：${error.message}`);
  } finally {
    try { cleanupFixture(); } catch (error) {
      report.cleanup.push({ status: 'FAIL', error: error.message });
      report.errors.push(`夹具清理失败：${error.message}`);
    }
    report.passed = report.errors.length === 0;
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log('AUDIT_INTEGRITY_ACCEPTANCE', report.passed ? 'PASS' : 'FAIL', JSON.stringify(report.errors));
    if (!report.passed) process.exitCode = 1;
  }
}

main();
