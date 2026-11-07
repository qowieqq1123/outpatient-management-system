import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.API_BASE || 'http://127.0.0.1:8080';
const outDir = process.env.UI_OUT_DIR || path.join(projectRoot, 'docs', 'images');
const reportFile = path.join(outDir, 'registration-cancel-refund-report.json');
const mysql = process.env.MYSQL_BIN || 'C:/Program Files/MySQL/MySQL Server 9.7/bin/mysql.exe';
const report = { base, baseline: 'V1.7', checks: {}, errors: [], cleanup: [] };
const record = (name, value) => { report.checks[name] = value; console.log(name, JSON.stringify(value)); };

async function login(username) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: '123456' })
  });
  const payload = await response.json();
  if (payload.code !== 0) throw new Error(`登录失败 ${username}: ${payload.message}`);
  return payload.data;
}

async function api(pathname, token, method = 'GET', body) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(base + pathname, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json();
  return { httpStatus: response.status, ...payload };
}

function mysqlQuery(sql) {
  const { spawnSync } = require('node:child_process');
  const result = spawnSync(mysql, [
    '-h', '127.0.0.1', '-P', '3306', '-u', 'root', '--default-character-set=utf8mb4',
    '-D', 'outpatient', '-N', '-B', '-e', sql
  ], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`MySQL 查询失败: ${result.stderr || result.stdout}`);
  return result.stdout.trim().split('\n').filter(Boolean).map(line => line.split('\t'));
}

function expect(ok, message) { if (!ok) report.errors.push(message); }

async function snapshot(regId) {
  const registration = mysqlQuery(`SELECT status, schedule_id, registration_fee FROM registration WHERE reg_id=${regId}`)[0];
  const schedule = mysqlQuery(`SELECT remaining_qty FROM schedule WHERE schedule_id=${registration[1]}`)[0];
  const refunds = mysqlQuery(`SELECT refund_id,refund_amount FROM refund_record WHERE reg_id=${regId} AND refund_type='REGISTRATION'`);
  const logs = mysqlQuery(`SELECT action,detail FROM operation_log WHERE target_id='${regId}' AND action LIKE 'REGISTRATION_%' ORDER BY log_id DESC LIMIT 3`);
  return { status: registration[0], scheduleId: Number(registration[1]), registrationFee: Number(registration[2]), remainingQty: Number(schedule[0]), refunds, logs };
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const patient = await login('pt0001');
  const cashier = await login('cashier01');
  const admin = await login('admin01');
  const nurse = await login('nurse01');
  const schedules = await api('/api/schedules', patient.token);
  expect(schedules.code === 0, '排班接口不可用');
  const schedule = (schedules.data || []).find(item => item.workDate >= new Date().toISOString().slice(0, 10)
    && item.remainingQty > 0 && item.status === 'OPEN');
  if (!schedule) throw new Error('没有可用于验收的开放号源');
  const beforeQty = schedule.remainingQty;

  // 场景一：患者取消本人未报到挂号单。
  const booked = await api('/api/registrations', patient.token, 'POST', {
    patientId: patient.refId, scheduleId: schedule.scheduleId, channel: 'ONLINE'
  });
  expect(booked.code === 0, `创建取消验收挂号单失败：${booked.message}`);
  if (booked.code !== 0) throw new Error(booked.message);
  const cancelRegId = booked.data.regId;
  const crossRole = await api(`/api/registrations/${cancelRegId}/cancel`, nurse.token, 'POST');
  expect(crossRole.code === 403, '护士越权取消未被拒绝');
  const cancel = await api(`/api/registrations/${cancelRegId}/cancel`, patient.token, 'POST');
  expect(cancel.code === 0 && cancel.data.status === 'CANCELLED', '合法取消未成功');
  const cancelSnapshot = await snapshot(cancelRegId);
  expect(cancelSnapshot.status === 'CANCELLED', '取消后数据库状态不是 CANCELLED');
  expect(cancelSnapshot.remainingQty === beforeQty, '取消后号源余量未精确回补');
  expect(cancelSnapshot.refunds.length === 0, '取消不应生成退费记录');
  expect(cancelSnapshot.logs.some(row => row[0] === 'REGISTRATION_CANCEL'), '取消审计日志缺失');
  const cancelAgain = await api(`/api/registrations/${cancelRegId}/cancel`, patient.token, 'POST');
  expect(cancelAgain.code === 409 && String(cancelAgain.message).includes('未报到'), '重复取消未被中文拒绝');
  record('PATIENT_CANCEL', { regId: cancelRegId, beforeQty, result: cancel.data, snapshot: cancelSnapshot, crossRole, cancelAgain });

  // 场景二：收费员退号，验证挂号费退费记录、号源回补与审计。
  const bookedRefund = await api('/api/registrations', patient.token, 'POST', {
    patientId: patient.refId, scheduleId: schedule.scheduleId, channel: 'ONLINE'
  });
  expect(bookedRefund.code === 0, `创建退号验收挂号单失败：${bookedRefund.message}`);
  if (bookedRefund.code !== 0) throw new Error(bookedRefund.message);
  const refundRegId = bookedRefund.data.regId;
  const patientCannotRefund = await api(`/api/registrations/${refundRegId}/refund`, patient.token, 'POST', { reason: '越权测试' });
  expect(patientCannotRefund.code === 403, '患者越权退号未被拒绝');
  const triage = await api('/api/queue/report', nurse.token, 'POST', { regId: refundRegId });
  expect(triage.code === 0, `分诊报到失败：${triage.message}`);
  const refund = await api(`/api/registrations/${refundRegId}/refund`, cashier.token, 'POST', { reason: '收费台办理退号退费' });
  expect(refund.code === 0 && refund.data.status === 'REFUNDED', '合法退号未成功');
  const refundSnapshot = await snapshot(refundRegId);
  expect(refundSnapshot.status === 'REFUNDED', '退号后数据库状态不是 REFUNDED');
  expect(refundSnapshot.remainingQty === beforeQty, '退号后号源余量未精确回补');
  expect(refundSnapshot.refunds.length === 1, '退号未生成唯一挂号费退费记录');
  expect(Number(refundSnapshot.refunds[0]?.[1]) === refundSnapshot.registrationFee, '退费金额不等于挂号费');
  expect(refundSnapshot.logs.some(row => row[0] === 'REGISTRATION_REFUND'), '退号审计日志缺失');
  const refundAgain = await api(`/api/registrations/${refundRegId}/refund`, cashier.token, 'POST', { reason: '重复退号' });
  expect(refundAgain.code === 409, '重复退号未被拒绝');
  record('CASHIER_REFUND', { regId: refundRegId, triage, result: refund.data, snapshot: refundSnapshot, patientCannotRefund, refundAgain });

  // 场景三：已就诊挂号单不可退号。
  const visited = await api(`/api/registrations/1/refund`, cashier.token, 'POST', { reason: '已就诊边界测试' });
  expect(visited.code === 409 && /不能退号/.test(visited.message || ''), '已就诊挂号单退号未被拒绝');
  record('VISITED_REJECTED', visited);

  // 清理本次验收创建的挂号单、退费记录与审计日志，保持演示数据基线。
  const ids = [cancelRegId, refundRegId].join(',');
  const { spawnSync } = require('node:child_process');
  const cleanupSql = `DELETE FROM operation_log WHERE target_type='REGISTRATION' AND target_id IN (${ids}) AND action LIKE 'REGISTRATION_%'; DELETE FROM refund_record WHERE reg_id IN (${ids}) AND refund_type='REGISTRATION'; DELETE FROM registration WHERE reg_id IN (${ids}); UPDATE schedule SET remaining_qty=${beforeQty} WHERE schedule_id=${schedule.scheduleId};`;
  const cleanup = spawnSync(mysql, ['-h','127.0.0.1','-P','3306','-u','root','--default-character-set=utf8mb4','-D','outpatient','-e',cleanupSql], { encoding: 'utf8' });
  expect(cleanup.status === 0, `验收数据清理失败：${cleanup.stderr || cleanup.stdout}`);
  report.cleanup.push({ regIds: [cancelRegId, refundRegId], scheduleId: schedule.scheduleId, remainingQty: beforeQty, status: cleanup.status === 0 ? 'PASS' : 'FAIL' });

  // 审计日志由管理台 REST 复核，确认独立前端可读取。
  const audit = await api('/api/audit?action=REGISTRATION_CANCEL', admin.token);
  expect(audit.code === 0, '管理员审计查询不可用');
  record('AUDIT_READ', { code: audit.code, rows: Array.isArray(audit.data) ? audit.data.length : null });

  report.passed = report.errors.length === 0;
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log('REGISTRATION_ACCEPTANCE', report.passed ? 'PASS' : 'FAIL', JSON.stringify(report.errors));
  if (!report.passed) process.exitCode = 1;
}

main().catch(error => { console.error('FATAL', error); process.exit(1); });
