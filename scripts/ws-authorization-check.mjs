import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiBase = process.env.API_BASE || 'http://127.0.0.1:8080';
const wsBase = process.env.WS_BASE || apiBase.replace(/^http/, 'ws');
const wsOrigin = process.env.WS_ORIGIN || 'http://127.0.0.1:5173';
const mysql = process.env.MYSQL_BIN || 'C:/Program Files/MySQL/MySQL Server 9.7/bin/mysql.exe';
const outDir = process.env.UI_OUT_DIR || path.join(projectRoot, 'docs', 'images');
const reportFile = path.join(outDir, 'ws-authorization-report.json');
const suffix = `WS${Date.now().toString().slice(-6)}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
const userA = `wsa${suffix}`;
const userB = `wsb${suffix}`;
const patientNoA = `WSA${suffix}`;
const patientNoB = `WSB${suffix}`;
const timeSlot = `WS验收 ${suffix}`;
const fixture = {
  suffix, userA, userB, patientNoA, patientNoB, timeSlot,
  pidA: null, pidB: null, uidA: null, uidB: null,
  scheduleId: null, regA: null, regB: null, workDate: null
};
const report = {
  scenario: 'AC-28 / WebSocket 患者专属主题授权与广播脱敏',
  baseline: 'V1.7',
  generatedAt: new Date().toISOString(),
  apiBase, wsBase: `${wsBase}/ws`, wsOrigin,
  fixture, cases: [], checks: {}, errors: [], cleanup: [], passed: false
};

const expect = (ok, message) => { if (!ok) report.errors.push(message); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const record = (name, value) => { report.checks[name] = value; console.log(name, JSON.stringify(value)); };

function mysqlRows(sql) {
  const result = spawnSync(mysql, [
    '-h', '127.0.0.1', '-P', '3306', '-u', 'root',
    '--default-character-set=utf8mb4', '-D', 'outpatient', '-N', '-B',
    '-e', `SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;\n${sql}`
  ], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`MySQL 执行失败：${result.stderr || result.stdout}`);
  return String(result.stdout || '').split(/\r?\n/).filter(Boolean).map(line => line.split('\t'));
}

async function login(username) {
  const response = await fetch(`${apiBase}/api/auth/login`, {
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
  const response = await fetch(apiBase + pathname, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { httpStatus: response.status, ...(await response.json()) };
}

function frame(command, headers = {}, body = '') {
  let text = `${command}\n`;
  for (const [key, value] of Object.entries(headers)) text += `${key}:${value}\n`;
  return `${text}\n${body}\0`;
}

function parseFrame(raw) {
  const split = raw.indexOf('\n\n');
  if (split < 0) return null;
  const lines = raw.slice(0, split).split('\n');
  const command = lines.shift();
  const headers = {};
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon > 0) headers[line.slice(0, colon)] = line.slice(colon + 1);
  }
  return { command, headers, body: raw.slice(split + 2) };
}

function wsProbe({ name, token, destination, expectAllow, expectMask = false, patientRefId = null }) {
  const item = {
    name, destination, expectAllow, connected: false, subscribeSent: false,
    stompError: null, error: null, messages: [], leakedFields: false, passed: false
  };
  report.cases.push(item);
  let settled = false;
  let readySettled = false;
  let resolveReady;
  let resolveDone;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const done = new Promise(resolve => { resolveDone = resolve; });
  const url = `${wsBase}/ws?token=${encodeURIComponent(token)}`;
  const ws = new WebSocket(url, { headers: { Origin: wsOrigin } });
  let buffer = '';
  let timer;

  const finish = (reason = '') => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    item.endedAt = new Date().toISOString();
    if (reason && !item.error) item.error = reason;
    if (!readySettled) {
      readySettled = true;
      resolveReady(false);
    }
    const base = item.connected && item.subscribeSent && !item.leakedFields;
    item.passed = expectAllow
      ? base && !item.stompError && item.messages.length > 0 && !item.error
      : base && !!item.stompError && item.messages.length === 0;
    try { ws.close(); } catch {}
    resolveDone(item);
  };

  timer = setTimeout(() => finish('timeout'), 15000);
  ws.addEventListener('open', () => {
    ws.send(frame('CONNECT', {
      'accept-version': '1.2', host: new URL(apiBase).host,
      heartbeat: '10000,10000', token
    }));
  });
  ws.addEventListener('error', () => { item.error = item.error || 'websocket-error'; });
  ws.addEventListener('close', () => { if (!settled) finish(item.error || 'closed-before-expected'); });
  ws.addEventListener('message', async event => {
    if (settled) return;
    const text = typeof event.data === 'string' ? event.data : await event.data.text();
    buffer += text;
    let index;
    while ((index = buffer.indexOf('\0')) >= 0) {
      const raw = buffer.slice(0, index).replace(/\r\n/g, '\n');
      buffer = buffer.slice(index + 1);
      const message = parseFrame(raw);
      if (!message || !message.command) continue;
      if (message.command === 'CONNECTED') {
        item.connected = true;
        ws.send(frame('SUBSCRIBE', { id: 'sub-0', destination, ack: 'auto' }));
        item.subscribeSent = true;
        if (!readySettled) {
          readySettled = true;
          resolveReady(true);
        }
        continue;
      }
      if (message.command === 'ERROR') {
        item.stompError = message.headers.message || message.body || 'stomp-error';
        item.error = item.stompError;
        finish(expectAllow ? 'unexpected-stomp-error' : '');
        return;
      }
      if (message.command === 'MESSAGE') {
        let payload;
        try { payload = JSON.parse(message.body); } catch { payload = []; }
        const rows = Array.isArray(payload) ? payload : (payload?.data || []);
        const refId = patientRefId == null ? null : Number(patientRefId);
        const ownRows = rows.filter(row => row.patientId != null && Number(row.patientId) === refId).length;
        const otherIdentityRows = rows.filter(row =>
          row.patientId != null && Number(row.patientId) !== refId).length;
        const otherLeaked = rows.filter(row => Number(row.patientId) !== refId
          && [row.patientId, row.patientNo, row.patientName].some(value =>
            value !== null && value !== undefined && value !== '')).length;
        const identityRows = rows.filter(row => row.patientId != null).length;
        if (expectMask) item.leakedFields = item.leakedFields || otherLeaked > 0;
        item.messages.push({
          destination: message.headers.destination,
          rows: rows.length, ownRows, otherIdentityRows, otherLeaked, identityRows,
          sample: rows.slice(0, 4).map(row => ({
            regId: row.regId, patientId: row.patientId, patientNo: row.patientNo,
            patientName: row.patientName, queueNo: row.queueNo, status: row.status
          }))
        });
        if (!expectAllow) return finish('unexpected-message');
        return finish();
      }
    }
  });
  return { ready, done, item };
}

function setupFixture() {
  const sql = `
SET @suffix='${suffix}';
SET @workDate=DATE_ADD(CURDATE(), INTERVAL 40 DAY);
INSERT INTO patient (patient_no,name,gender,birth_date,insurance_type)
VALUES ('${patientNoA}','验收患者甲','男','1990-01-01','SELF'),
       ('${patientNoB}','验收患者乙','女','1991-01-01','SELF');
SET @pidA=(SELECT patient_id FROM patient WHERE patient_no='${patientNoA}');
SET @pidB=(SELECT patient_id FROM patient WHERE patient_no='${patientNoB}');
INSERT INTO sys_user (username,password_hash,real_name,role_code,ref_id,enabled)
SELECT '${userA}',p.password_hash,'验收患者甲','PATIENT',@pidA,1
FROM (SELECT password_hash FROM sys_user WHERE username='pt0001') p;
SET @uidA=LAST_INSERT_ID();
INSERT INTO sys_user (username,password_hash,real_name,role_code,ref_id,enabled)
SELECT '${userB}',p.password_hash,'验收患者乙','PATIENT',@pidB,1
FROM (SELECT password_hash FROM sys_user WHERE username='pt0001') p;
SET @uidB=LAST_INSERT_ID();
INSERT INTO schedule (doctor_id,dept_id,work_date,time_slot,total_qty,remaining_qty,registration_fee,status,created_at)
VALUES (1,1,@workDate,'${timeSlot}',10,8,25.00,'OPEN',NOW());
SET @sid=LAST_INSERT_ID();
INSERT INTO registration
  (patient_id,schedule_id,doctor_id,dept_id,queue_no,call_order,miss_count,channel,status,
   registration_fee,fee_paid,reg_time,triage_time,called_time,arrived_at,queue_version,remark)
VALUES (@pidA,@sid,1,1,1,1,0,'ONLINE','TRIAGED',25.00,0,NOW(),NOW(),NULL,NULL,0,'V1.7 WS 验收甲 ${suffix}'),
       (@pidB,@sid,1,1,2,2,0,'ONLINE','REGISTERED',25.00,0,NOW(),NULL,NULL,NULL,0,'V1.7 WS 验收乙 ${suffix}');
SET @regA=(SELECT reg_id FROM registration WHERE remark='V1.7 WS 验收甲 ${suffix}');
SET @regB=(SELECT reg_id FROM registration WHERE remark='V1.7 WS 验收乙 ${suffix}');
SELECT CONCAT_WS('|',@pidA,@pidB,@uidA,@uidB,@sid,@regA,@regB,DATE_FORMAT(@workDate,'%Y-%m-%d'));
`;
  const line = mysqlRows(sql).map(row => row[0]).filter(value => value && value.includes('|')).at(-1);
  if (!line) throw new Error('WS 验收夹具未返回主键');
  const [pidA, pidB, uidA, uidB, scheduleId, regA, regB, workDate] = line.split('|');
  Object.assign(fixture, {
    pidA: Number(pidA), pidB: Number(pidB), uidA: Number(uidA), uidB: Number(uidB),
    scheduleId: Number(scheduleId), regA: Number(regA), regB: Number(regB), workDate
  });
}

function cleanupFixture() {
  const ids = {
    sid: fixture.scheduleId || -1, regA: fixture.regA || -1, regB: fixture.regB || -1,
    uidA: fixture.uidA || -1, uidB: fixture.uidB || -1,
    pidA: fixture.pidA || -1, pidB: fixture.pidB || -1
  };
  const logWhere = `(target_type='REGISTRATION'
      AND target_id IN (CAST(${ids.regA} AS CHAR),CAST(${ids.regB} AS CHAR)))
    OR (target_type='SCHEDULE' AND target_id=CAST(${ids.sid} AS CHAR))
    OR operator_id IN (${ids.uidA},${ids.uidB})
    OR detail LIKE CONCAT('%','${suffix}','%')`;
  const sql = `
DELETE FROM operation_log WHERE ${logWhere};
DELETE FROM refund_record WHERE reg_id IN (${ids.regA},${ids.regB});
DELETE FROM visit WHERE reg_id IN (${ids.regA},${ids.regB});
DELETE FROM registration WHERE reg_id IN (${ids.regA},${ids.regB})
  OR schedule_id=${ids.sid} OR remark LIKE CONCAT('%','${suffix}','%');
DELETE FROM schedule WHERE schedule_id=${ids.sid} OR time_slot='${timeSlot}';
DELETE FROM sys_user WHERE user_id IN (${ids.uidA},${ids.uidB})
  OR username IN ('${userA}','${userB}');
DELETE FROM patient WHERE patient_id IN (${ids.pidA},${ids.pidB})
  OR patient_no IN ('${patientNoA}','${patientNoB}');
SELECT CONCAT_WS('|',
  (SELECT COUNT(*) FROM patient WHERE patient_no IN ('${patientNoA}','${patientNoB}')),
  (SELECT COUNT(*) FROM sys_user WHERE username IN ('${userA}','${userB}')),
  (SELECT COUNT(*) FROM schedule WHERE schedule_id=${ids.sid} OR time_slot='${timeSlot}'),
  (SELECT COUNT(*) FROM registration WHERE reg_id IN (${ids.regA},${ids.regB})
    OR schedule_id=${ids.sid} OR remark LIKE CONCAT('%','${suffix}','%')),
  (SELECT COUNT(*) FROM operation_log WHERE ${logWhere}),
  (SELECT COUNT(*) FROM role),
  (SELECT COUNT(*) FROM sys_user),
  (SELECT COUNT(*) FROM schedule),
  (SELECT COUNT(*) FROM registration),
  (SELECT COUNT(*) FROM refund_record));
`;
  const line = mysqlRows(sql).map(row => row[0]).filter(value => value && value.includes('|')).at(-1);
  const values = line ? line.split('|').map(Number) : [];
  const residual = {
    tempPatients: values[0], tempUsers: values[1], tempSchedules: values[2],
    tempRegistrations: values[3], tempOperationLogs: values[4]
  };
  const baseline = {
    roles: values[5], users: values[6], schedules: values[7],
    registrations: values[8], refundRecords: values[9]
  };
  const zeroResidual = Object.values(residual).every(value => value === 0);
  const cleanBaseline = baseline.roles === 6 && baseline.users === 15
    && baseline.schedules === 10 && baseline.registrations === 7 && baseline.refundRecords === 0;
  report.cleanup.push({ status: zeroResidual && cleanBaseline ? 'PASS' : 'FAIL', residual, baseline });
  expect(zeroResidual, `WS 验收临时夹具未清理干净：${JSON.stringify(residual)}`);
  expect(cleanBaseline, `WS 验收后演示数据基线异常：${JSON.stringify(baseline)}`);
}

async function main() {
  try {
    if (typeof WebSocket === 'undefined') throw new Error('当前 Node 不支持全局 WebSocket');
    setupFixture();
    const tokens = {
      patientA: await login(userA), patientB: await login(userB),
      nurse: await login('nurse01'), admin: await login('admin01'),
      doctorOwn: await login('zhangming'), doctorOther: await login('lihui'),
      cashier: await login('cashier01')
    };
    expect(Number(tokens.patientA.refId) === fixture.pidA, '患者甲 JWT 未绑定临时患者档案');
    expect(Number(tokens.patientB.refId) === fixture.pidB, '患者乙 JWT 未绑定临时患者档案');

    const full = `/topic/queue/1/${fixture.workDate}`;
    const maskedA = `${full}/masked/${fixture.pidA}`;
    const maskedB = `${full}/masked/${fixture.pidB}`;
    const probes = [
      wsProbe({ name: 'patient_a_own_masked_allowed', token: tokens.patientA.token, destination: maskedA, expectAllow: true, expectMask: true, patientRefId: fixture.pidA }),
      wsProbe({ name: 'patient_b_own_masked_allowed', token: tokens.patientB.token, destination: maskedB, expectAllow: true, expectMask: true, patientRefId: fixture.pidB }),
      wsProbe({ name: 'patient_full_rejected', token: tokens.patientA.token, destination: full, expectAllow: false, patientRefId: fixture.pidA }),
      wsProbe({ name: 'patient_other_masked_rejected', token: tokens.patientA.token, destination: maskedB, expectAllow: false, patientRefId: fixture.pidA }),
      wsProbe({ name: 'patient_old_masked_rejected', token: tokens.patientA.token, destination: `${full}/masked`, expectAllow: false, patientRefId: fixture.pidA }),
      wsProbe({ name: 'patient_no_queue_rejected', token: tokens.patientA.token, destination: `/topic/queue/2/${fixture.workDate}/masked/${fixture.pidA}`, expectAllow: false, patientRefId: fixture.pidA }),
      wsProbe({ name: 'nurse_full_allowed', token: tokens.nurse.token, destination: full, expectAllow: true }),
      wsProbe({ name: 'admin_full_allowed', token: tokens.admin.token, destination: full, expectAllow: true }),
      wsProbe({ name: 'doctor_own_full_allowed', token: tokens.doctorOwn.token, destination: full, expectAllow: true }),
      wsProbe({ name: 'doctor_other_full_rejected', token: tokens.doctorOther.token, destination: full, expectAllow: false }),
      wsProbe({ name: 'cashier_full_rejected', token: tokens.cashier.token, destination: full, expectAllow: false }),
      wsProbe({ name: 'nurse_masked_rejected', token: tokens.nurse.token, destination: maskedA, expectAllow: false })
    ];
    const ready = await Promise.all(probes.map(probe => probe.ready));
    expect(ready.every(Boolean), '部分 STOMP 会话未建立或订阅帧未发送');
    await delay(200);

    // 真实护士报到会触发 QueueEventPublisher 向员工主题与各患者专属主题广播。
    const reportAction = await api('/api/queue/report', tokens.nurse.token, 'POST', { regId: fixture.regB });
    record('BROADCAST_TRIGGER', {
      httpStatus: reportAction.httpStatus, code: reportAction.code,
      regId: reportAction.data?.regId, status: reportAction.data?.status
    });
    expect(reportAction.code === 0 && reportAction.data?.status === 'TRIAGED',
      `真实报到广播触发失败：${reportAction.message}`);
    await Promise.all(probes.map(probe => probe.done));

    for (const item of report.cases) {
      expect(item.passed, `${item.name} 未达到预期：${JSON.stringify({
        connected: item.connected, subscribeSent: item.subscribeSent,
        stompError: item.stompError, error: item.error, messages: item.messages.length,
        leakedFields: item.leakedFields
      })}`);
    }
    const caseOf = name => report.cases.find(item => item.name === name);
    const patientA = caseOf('patient_a_own_masked_allowed')?.messages[0];
    const patientB = caseOf('patient_b_own_masked_allowed')?.messages[0];
    const nurseFull = caseOf('nurse_full_allowed')?.messages[0];
    record('MASKED_PAYLOADS', { patientA, patientB, nurseFull });
    expect(patientA?.rows >= 2 && patientA.ownRows === 1 && patientA.otherLeaked === 0,
      '患者甲专属广播未做到仅本人身份可见');
    expect(patientB?.rows >= 2 && patientB.ownRows === 1 && patientB.otherLeaked === 0,
      '患者乙专属广播未做到仅本人身份可见');
    expect(nurseFull?.rows >= 2 && nurseFull.identityRows >= 2 && nurseFull.otherIdentityRows >= 1,
      '员工完整主题广播缺少完整患者身份');
    expect(caseOf('doctor_other_full_rejected')?.stompError?.includes('只能订阅自己的叫号队列'),
      '其他医生订阅拒绝原因不符合服务端授权规则');

    const rest = await api(`/api/queue/board?doctorId=1&workDate=${fixture.workDate}`, tokens.patientA.token);
    const restRows = Array.isArray(rest.data) ? rest.data : [];
    const restOwn = restRows.filter(row => Number(row.patientId) === fixture.pidA).length;
    const restLeaked = restRows.filter(row => Number(row.patientId) !== fixture.pidA
      && [row.patientId, row.patientNo, row.patientName].some(value => value !== null && value !== undefined && value !== '')).length;
    record('REST_BOARD_CONSISTENCY', { code: rest.code, rows: restRows.length, ownRows: restOwn, otherLeaked: restLeaked });
    expect(rest.code === 0 && restOwn === 1 && restLeaked === 0,
      '患者 REST 看板与专属广播的脱敏口径不一致');
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
    console.log('WS_AUTHORIZATION_ACCEPTANCE', report.passed ? 'PASS' : 'FAIL', JSON.stringify(report.errors));
    if (!report.passed) process.exitCode = 1;
  }
}

main();
