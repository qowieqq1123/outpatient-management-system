import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiBase = process.env.API_BASE || 'http://127.0.0.1:8080';
const outDir = process.env.UI_OUT_DIR || path.join(projectRoot, 'docs', 'images');
const mysql = process.env.MYSQL_BIN || 'C:/Program Files/MySQL/MySQL Server 9.7/bin/mysql.exe';
const reportFile = path.join(outDir, 'concurrency-acceptance-report.json');
const suffix = `CC${Date.now().toString().slice(-6)}`;
const capacity = 15;
const attempts = 20;
const workDate = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
const timeSlot = `并发验收 ${suffix}`;
const report = {
  apiBase, baseline: 'V1.7', scenario: 'AC-04 / BR-03',
  fixture: { suffix, workDate, timeSlot, capacity, attempts },
  checks: {}, errors: [], cleanup: []
};
const fixture = { patientIds: [], userIds: [], scheduleId: null, regIds: [] };
const record = (name, value) => { report.checks[name] = value; console.log(name, JSON.stringify(value)); };
const expect = (ok, message) => { if (!ok) report.errors.push(message); };

function mysqlCommand(sql, tabular = false) {
  const { spawnSync } = require('node:child_process');
  const args = ['-h', '127.0.0.1', '-P', '3306', '-u', 'root', '--default-character-set=utf8mb4', '-D', 'outpatient'];
  if (tabular) args.push('-N', '-B');
  args.push('-e', sql);
  const result = spawnSync(mysql, args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`MySQL 执行失败：${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function mysqlRows(sql) {
  return mysqlCommand(sql, true).split('\n').filter(Boolean).map(line => line.split('\t'));
}

function sqlText(value) {
  return String(value).replaceAll("'", "''");
}

async function login(username, password = '123456') {
  const response = await fetch(`${apiBase}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  return response.json();
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

/** 先用管理员维护端点建临时号源，再以一批独立患者账号同时抢号。 */
async function createFixture(adminToken) {
  const catalog = await api('/api/admin/catalog', adminToken);
  if (catalog.code !== 0) throw new Error(`维护目录不可用：${catalog.message}`);
  const doctor = catalog.data.doctors[0];

  const patientValues = [];
  for (let index = 1; index <= attempts; index++) {
    const number = `${suffix}P${String(index).padStart(2, '0')}`;
    patientValues.push(`('${sqlText(number)}', '并发验收${index}', '女', '2000-01-01', 'PLAIN:13900000000', 'PLAIN:46010020000101000${String(index).padStart(2, '0')}', NULL, 'SELF')`);
  }
  mysqlCommand(`INSERT INTO patient (patient_no,name,gender,birth_date,phone_enc,id_card_enc,insurance_no,insurance_type) VALUES ${patientValues.join(',')};`);
  fixture.patientIds = mysqlRows(`SELECT patient_id FROM patient WHERE patient_no LIKE '${suffix}P%' ORDER BY patient_id`)
    .flat().map(Number);
  if (fixture.patientIds.length !== attempts) throw new Error('临时患者创建数量不等于 20');

  const hash = mysqlRows("SELECT password_hash FROM sys_user WHERE username='pt0001'")[0][0];
  const userValues = fixture.patientIds.map((patientId, index) => {
    const username = `${suffix.toLowerCase()}p${String(index + 1).padStart(2, '0')}`;
    return `('${sqlText(username)}','${sqlText(hash)}','并发验收${index + 1}','PATIENT',${patientId},1)`;
  });
  mysqlCommand(`INSERT INTO sys_user (username,password_hash,real_name,role_code,ref_id,enabled) VALUES ${userValues.join(',')};`);
  fixture.userIds = mysqlRows(`SELECT user_id FROM sys_user WHERE username LIKE '${suffix.toLowerCase()}p%' ORDER BY user_id`)
    .flat().map(Number);
  if (fixture.userIds.length !== attempts) throw new Error('临时登录账号创建数量不等于 20');

  const schedule = await api('/api/admin/schedules', adminToken, 'POST', {
    doctorId: doctor.doctorId, deptId: doctor.deptId, workDate, timeSlot,
    totalQty: capacity, registrationFee: 10
  });
  if (schedule.code !== 0) throw new Error(`临时号源创建失败：${schedule.message}`);
  fixture.scheduleId = schedule.data.scheduleId;
  report.checks.FIXTURE = {
    doctor: { doctorId: doctor.doctorId, deptId: doctor.deptId },
    patients: fixture.patientIds.length, users: fixture.userIds.length,
    scheduleId: fixture.scheduleId, totalQty: schedule.data.totalQty,
    remainingQty: schedule.data.remainingQty
  };
}

async function cleanup() {
  const scheduleId = fixture.scheduleId == null ? '-1' : Number(fixture.scheduleId);
  const patientIds = fixture.patientIds.length ? fixture.patientIds.join(',') : '-1';
  const userIds = fixture.userIds.length ? fixture.userIds.join(',') : '-1';
  const sql = `
    SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
    DELETE FROM operation_log
      WHERE (action='SCHEDULE_UPSERT' AND target_type='SCHEDULE' AND target_id='${scheduleId}')
        OR (action='REGISTRATION_BOOK' AND target_type='REGISTRATION'
            AND target_id IN (SELECT CAST(reg_id AS CHAR) COLLATE utf8mb4_unicode_ci
                              FROM registration WHERE schedule_id=${scheduleId}));
    DELETE FROM refund_record WHERE reg_id IN (SELECT reg_id FROM registration WHERE schedule_id=${scheduleId});
    DELETE FROM registration WHERE schedule_id=${scheduleId};
    DELETE FROM schedule WHERE schedule_id=${scheduleId} OR (work_date='${workDate}' AND time_slot='${sqlText(timeSlot)}');
    DELETE FROM sys_user WHERE user_id IN (${userIds}) OR username LIKE '${suffix.toLowerCase()}p%';
    DELETE FROM patient WHERE patient_id IN (${patientIds}) OR patient_no LIKE '${suffix}P%';
  `;
  try {
    mysqlCommand(sql);
    const residual = {
      patients: Number(mysqlRows(`SELECT COUNT(*) FROM patient WHERE patient_no LIKE '${suffix}P%'`)[0]?.[0] || 0),
      users: Number(mysqlRows(`SELECT COUNT(*) FROM sys_user WHERE username LIKE '${suffix.toLowerCase()}p%'`)[0]?.[0] || 0),
      schedules: Number(mysqlRows(`SELECT COUNT(*) FROM schedule WHERE work_date='${workDate}' AND time_slot='${sqlText(timeSlot)}'`)[0]?.[0] || 0),
      registrations: Number(mysqlRows(`SELECT COUNT(*) FROM registration WHERE schedule_id=${scheduleId}`)[0]?.[0] || 0),
      operationLogs: Number(mysqlRows(`SELECT COUNT(*) FROM operation_log WHERE action='SCHEDULE_UPSERT' AND target_type='SCHEDULE' AND target_id='${scheduleId}'`)[0]?.[0] || 0)
    };
    const passed = Object.values(residual).every(value => value === 0);
    report.cleanup.push({ status: passed ? 'PASS' : 'FAIL', residual });
    expect(passed, `并发验收夹具未清理干净：${JSON.stringify(residual)}`);
  } catch (error) {
    report.cleanup.push({ status: 'FAIL', error: error.message });
    report.errors.push(`并发验收夹具清理失败：${error.message}`);
  }
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  try {
    const adminLogin = await login('admin01');
    if (adminLogin.code !== 0) throw new Error(`管理员登录失败：${adminLogin.message}`);
    const adminToken = adminLogin.data.token;
    await createFixture(adminToken);

    const sessions = [];
    for (let index = 0; index < fixture.patientIds.length; index++) {
      const username = `${suffix.toLowerCase()}p${String(index + 1).padStart(2, '0')}`;
      const result = await login(username);
      expect(result.code === 0, `临时患者账号 ${username} 登录失败`);
      if (result.code !== 0) throw new Error(result.message);
      sessions.push({ username, token: result.data.token, patientId: fixture.patientIds[index] });
    }

    // 屏障保证 20 个 fetch 在同一轮事件循环发出，避免顺序执行退化成串行测试。
    let release;
    const barrier = new Promise(resolve => { release = resolve; });
    const started = Date.now();
    const requests = sessions.map(session => barrier.then(async () => {
      const began = Date.now();
      try {
        const result = await api('/api/registrations', session.token, 'POST', {
          patientId: session.patientId, scheduleId: fixture.scheduleId, channel: 'ONLINE'
        });
        return { username: session.username, elapsedMs: Date.now() - began, ...result };
      } catch (error) {
        return { username: session.username, elapsedMs: Date.now() - began, code: -1, message: error.message };
      }
    }));
    release();
    const results = await Promise.all(requests);
    const elapsedMs = Date.now() - started;

    const successes = results.filter(item => item.code === 0);
    const rejections = results.filter(item => item.code !== 0);
    const queueNos = successes.map(item => Number(item.data?.queueNo)).sort((a, b) => a - b);
    const expectedQueueNos = Array.from({ length: capacity }, (_, index) => index + 1);
    const dbRows = mysqlRows(`SELECT reg_id,queue_no,status,patient_id FROM registration WHERE schedule_id=${fixture.scheduleId} ORDER BY queue_no`);
    const scheduleRow = mysqlRows(`SELECT total_qty,remaining_qty,status FROM schedule WHERE schedule_id=${fixture.scheduleId}`)[0] || [];
    fixture.regIds = dbRows.map(row => Number(row[0]));
    const dbQueueNos = dbRows.map(row => Number(row[1]));
    const allActive = dbRows.length === capacity && dbRows.every(row => row[2] === 'REGISTERED');
    const chineseRejections = rejections.every(item => item.code === 409 && /号源|挂满/.test(item.message || ''));

    expect(successes.length === capacity, `并发成功次数应为 ${capacity}，实际 ${successes.length}`);
    expect(rejections.length === attempts - capacity, `中文拒绝次数应为 ${attempts - capacity}，实际 ${rejections.length}`);
    expect(JSON.stringify(queueNos) === JSON.stringify(expectedQueueNos), '成功挂号号序不是 1~15 且不重复');
    expect(JSON.stringify(dbQueueNos) === JSON.stringify(expectedQueueNos), '数据库号序不是 1~15 或存在重复');
    expect(allActive, '数据库存在非 REGISTERED 的多余挂号单');
    expect(Number(scheduleRow[0]) === capacity && Number(scheduleRow[1]) === 0, '并发后总量/余量不符合 15/0');
    expect(scheduleRow[2] === 'OPEN', '并发后临时排班状态不是 OPEN');
    expect(chineseRejections, '号源耗尽后的拒绝不是中文业务 409');
    expect(results.every(item => item.httpStatus === 200), '统一响应体 HTTP 状态异常');
    record('CONCURRENT_BOOKING', {
      elapsedMs, attempts, successes: successes.length, rejections: rejections.length,
      queueNos, dbQueueNos, scheduleRow, allActive, chineseRejections,
      rejectionMessages: [...new Set(rejections.map(item => item.message))],
      latencyMs: { min: Math.min(...results.map(item => item.elapsedMs)), max: Math.max(...results.map(item => item.elapsedMs)) }
    });
    record('REQUEST_DETAILS', results.map(item => ({
      username: item.username, code: item.code, message: item.message,
      queueNo: item.data?.queueNo ?? null, regId: item.data?.regId ?? null,
      elapsedMs: item.elapsedMs
    })));
  } catch (error) {
    report.fatal = error.stack || error.message;
    report.errors.push(`并发验收中断：${error.message}`);
  } finally {
    await cleanup();
    report.passed = report.errors.length === 0;
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log('CONCURRENCY_ACCEPTANCE', report.passed ? 'PASS' : 'FAIL', JSON.stringify(report.errors));
    if (!report.passed) process.exitCode = 1;
  }
}

main();
