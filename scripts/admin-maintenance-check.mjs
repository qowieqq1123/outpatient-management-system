import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiBase = process.env.API_BASE || 'http://127.0.0.1:8080';
const uiBase = process.env.UI_BASE || 'http://127.0.0.1:5173';
const debugPort = Number(process.env.UI_CDP_PORT || process.argv[2] || 9225);
const outDir = process.env.UI_OUT_DIR || path.join(projectRoot, 'docs', 'images');
const mysql = process.env.MYSQL_BIN || 'C:/Program Files/MySQL/MySQL Server 9.7/bin/mysql.exe';
const reportFile = path.join(outDir, 'admin-maintenance-report.json');
const suffix = `QR${Date.now().toString().slice(-6)}`;
const roleCode = suffix;
const forbiddenRoleCode = `NO${suffix}`;
const username = `qa${suffix.toLowerCase()}`;
const invalidUsername = `bad${suffix.toLowerCase()}`;
const workDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
const timeSlot = `验收时段 ${suffix}`;
const report = { apiBase, uiBase, baseline: 'V1.7', fixture: { suffix, roleCode, username, workDate, timeSlot }, checks: {}, errors: [], cleanup: [] };
const screenshotFiles = [
  'admin-maintenance-desktop.png',
  'admin-maintenance-forms-desktop.png',
  'admin-maintenance-schedules-desktop.png',
  'admin-maintenance-mobile.png',
  'admin-maintenance-forms-mobile.png'
];
const fixture = { userId: null, scheduleId: null, regIds: [], catalog: null };
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

async function login(usernameValue, password = '123456') {
  const response = await fetch(`${apiBase}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: usernameValue, password })
  });
  const payload = await response.json();
  return { httpStatus: response.status, ...payload };
}

async function api(pathname, token, method = 'GET', body) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(apiBase + pathname, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json();
  return { httpStatus: response.status, ...payload };
}

async function connectCdp() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
      const pages = list.filter(target => target.type === 'page');
        const target = pages.find(page => page.url.startsWith(uiBase))
          || pages.find(page => !page.url.startsWith('edge://'))
          || pages[0];
        if (!target) continue;
      const ws = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
      let id = 0;
      const pending = new Map();
      const events = [];
      ws.onmessage = event => {
        const message = JSON.parse(event.data);
        if (message.id && pending.has(message.id)) {
          const { resolve, reject } = pending.get(message.id);
          pending.delete(message.id);
          message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
        } else if (message.method) events.push(message);
      };
      const send = (method, params = {}) => new Promise((resolve, reject) => {
        const requestId = ++id;
        pending.set(requestId, { resolve, reject });
        ws.send(JSON.stringify({ id: requestId, method, params }));
      });
      const originalUrl = target.url;
      const originalStorage = await (async () => {
        try {
          const result = await send('Runtime.evaluate', {
            expression: 'localStorage.getItem("outpatient.session.v1")', returnByValue: true
          });
          return result.result?.value || null;
        } catch { return null; }
      })();
      return { ws, send, events, originalUrl, originalStorage };
    } catch { /* CDP 页面尚未就绪，继续等待 */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('没有可用 CDP page target');
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(cdp, expression, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try { if (await evaluate(cdp, expression)) return; } catch { /* 页面刷新期间表达式可能短暂不可用 */ }
    await delay(200);
  }
  throw new Error(`等待界面状态超时：${expression}`);
}

async function screenshot(cdp, file) {
  await evaluate(cdp, `(() => {
    document.querySelector('#boot-screen')?.remove();
    document.querySelectorAll('.login-card, .story-lead, .story-copy, .wayfinding, .stat-card, .panel')
      .forEach(el => { el.style.animation = 'none'; el.style.opacity = '1'; el.style.transform = 'none'; });
    return true;
  })()`);
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  fs.writeFileSync(path.join(outDir, file), Buffer.from(result.data, 'base64'));
}

async function adminDom(cdp) {
  return evaluate(cdp, `(() => ({
    title: document.querySelector('#workspace .page-head h2')?.textContent || null,
    nav: document.querySelectorAll('.nav-item').length,
    panels: document.querySelectorAll('#workspace .panel').length,
    forms: ['admin-role-form','admin-user-form','admin-schedule-form'].filter(id => !!document.getElementById(id)),
    sections: ['sec-admin-access','sec-admin-schedules'].filter(id => !!document.getElementById(id)),
    roleRows: document.querySelectorAll('#sec-admin-access tbody tr').length,
    scheduleRows: document.querySelectorAll('#sec-admin-schedules tbody tr').length,
    versionBoundary: [...document.querySelectorAll('#workspace .detail-meta')].map(el => el.textContent.trim()).find(text => text.includes('用户 / 角色 / 排班维护')) || null,
    rawStatus: [...document.querySelectorAll('#workspace .status, #workspace .tag')]
      .map(el => el.textContent.trim())
      .filter(text => /^(OPEN|CLOSED|UNPAID|PAID|RETRY|REFUNDED|PENDING_FEE|IN_TREATMENT|COMPLETED|CALLING|TRIAGED|MISSED|DISPENSED|APPROVED|REGISTERED)$/.test(text)).length,
    rawStatusTexts: [...document.querySelectorAll('#workspace .stat-note, #workspace .panel-head p, #workspace .notice, #workspace .detail-meta')]
      .map(el => el.textContent.trim())
      .filter(text => /\\b(OPEN|CLOSED|UNPAID|PAID|RETRY|REFUNDED|PENDING_FEE|IN_TREATMENT|COMPLETED|CALLING|TRIAGED|MISSED|DISPENSED|APPROVED|REGISTERED)\\b/.test(text)).slice(0, 5),
    badMoney: [...document.querySelectorAll('#workspace .money')].filter(el => !/^-?\\d+\\.\\d{2} 元$/.test(el.textContent.trim())).length,
    viewportWidth: window.innerWidth,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1
  }))()`);
}

async function browserCheck(adminSession) {
  const cdp = await connectCdp();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.navigate', { url: `${uiBase}/` });
  await waitFor(cdp, `!!document.querySelector('#login-view') || !!document.querySelector('#app-view')`);
  cdp.events.splice(0);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false, screenWidth: 1440, screenHeight: 1000 });
  await evaluate(cdp, `(() => { localStorage.clear(); localStorage.setItem('outpatient.session.v1', ${JSON.stringify(JSON.stringify(adminSession))}); location.reload(); return true; })()`);
  await waitFor(cdp, `!document.querySelector('#app-view').hidden && document.querySelector('#admin-role-form') && document.querySelector('#admin-schedule-form')`);
  await delay(700);
  const desktop = await adminDom(cdp);
  record('SPA_ADMIN_DESKTOP', desktop);
  await screenshot(cdp, 'admin-maintenance-desktop.png');
  await evaluate(cdp, `(() => { document.getElementById('sec-admin-access')?.scrollIntoView({ block: 'start' }); return true; })()`);
  await delay(250);
  await screenshot(cdp, 'admin-maintenance-forms-desktop.png');
  await evaluate(cdp, `(() => { document.getElementById('sec-admin-schedules')?.scrollIntoView({ block: 'start' }); return true; })()`);
  await delay(250);
  await screenshot(cdp, 'admin-maintenance-schedules-desktop.png');

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844 });
  await delay(400);
  const mobile = await adminDom(cdp);
  record('SPA_ADMIN_MOBILE', mobile);
  await screenshot(cdp, 'admin-maintenance-mobile.png');
  await evaluate(cdp, `(() => { document.getElementById('sec-admin-access')?.scrollIntoView({ block: 'start' }); return true; })()`);
  await delay(250);
  await screenshot(cdp, 'admin-maintenance-forms-mobile.png');

  const exceptions = cdp.events.filter(event => event.method === 'Runtime.exceptionThrown');
  const severeLogs = cdp.events.filter(event => event.method === 'Log.entryAdded' && ['error', 'warning'].includes(event.params?.entry?.level));
  record('SPA_EVIDENCE', {
    screenshots: screenshotFiles,
    note: '截图取自本次临时验收夹具；main() 结束时统一清理角色、账号、排班、挂号与审计数据'
  });
  record('SPA_RUNTIME', {
    jsExceptions: exceptions.map(event => event.params.exceptionDetails.text),
    severeLogs: severeLogs.map(event => `${event.params.entry.level}:${event.params.entry.text}`)
  });
  for (const [name, summary] of [['SPA_ADMIN_DESKTOP', desktop], ['SPA_ADMIN_MOBILE', mobile]]) {
    expect(summary.title === '管理后台' && summary.nav >= 6 && summary.panels > 0, `${name} 管理台结构不完整`);
    expect(summary.forms.length === 3 && summary.sections.length === 2, `${name} 三个维护表单或两个锚点缺失`);
    expect(summary.roleRows > 0 && summary.scheduleRows > 0, `${name} 角色或排班列表为空`);
    expect(summary.versionBoundary?.includes('V1.7')
      && summary.versionBoundary?.includes('用户 / 角色 / 排班维护')
      && summary.versionBoundary?.includes('WebSocket 主题授权')
      && summary.versionBoundary?.includes('关键审计')
      && summary.versionBoundary?.includes('已交付'), `${name} 未标明 V1.7 维护、主题授权与审计边界`);
    expect(summary.rawStatus === 0 && summary.rawStatusTexts.length === 0 && summary.badMoney === 0, `${name} 状态或金额未按中文口径展示`);
    expect(!summary.horizontalOverflow, `${name} 存在横向溢出`);
  }
  expect(mobile.viewportWidth === 390, '移动端管理台视口宽度不是 390px');
  expect(report.checks.SPA_RUNTIME.jsExceptions.length === 0, '管理台验收出现 JS exception');
  expect(report.checks.SPA_RUNTIME.severeLogs.length === 0, '管理台验收出现 error/warning 日志');
  return cdp;
}

async function cleanup() {
  const userIds = fixture.userId ? String(fixture.userId) : '-1';
  const scheduleIds = fixture.scheduleId ? String(fixture.scheduleId) : '-1';
  const sql = `
    DELETE FROM operation_log WHERE action IN ('ROLE_UPSERT','USER_UPSERT','USER_STATUS','SCHEDULE_UPSERT','SCHEDULE_CLOSE')
      AND (target_type='ROLE' AND target_id IN ('${roleCode}','${forbiddenRoleCode}')
        OR target_type='USER' AND target_id IN (${userIds})
        OR target_type='SCHEDULE' AND target_id IN (${scheduleIds}));
    DELETE FROM refund_record WHERE reg_id IN (SELECT reg_id FROM registration WHERE schedule_id IN (
      SELECT schedule_id FROM schedule WHERE work_date='${workDate}' AND time_slot='${timeSlot}'));
    DELETE FROM registration WHERE schedule_id IN (SELECT schedule_id FROM schedule WHERE work_date='${workDate}' AND time_slot='${timeSlot}');
    DELETE FROM schedule WHERE work_date='${workDate}' AND time_slot='${timeSlot}';
    DELETE FROM sys_user WHERE username IN ('${username}','${invalidUsername}');
    DELETE FROM role WHERE role_code IN ('${roleCode}','${forbiddenRoleCode}');
  `;
  try {
    mysqlCommand(sql);
    const residual = {
      role: Number(mysqlRows(`SELECT COUNT(*) FROM role WHERE role_code IN ('${roleCode}','${forbiddenRoleCode}')`)[0]?.[0] || 0),
      user: Number(mysqlRows(`SELECT COUNT(*) FROM sys_user WHERE username IN ('${username}','${invalidUsername}')`)[0]?.[0] || 0),
      schedule: Number(mysqlRows(`SELECT COUNT(*) FROM schedule WHERE work_date='${workDate}' AND time_slot='${timeSlot}'`)[0]?.[0] || 0),
      registration: Number(mysqlRows(`SELECT COUNT(*) FROM registration WHERE schedule_id IN (SELECT schedule_id FROM schedule WHERE work_date='${workDate}' AND time_slot='${timeSlot}')`)[0]?.[0] || 0),
      operationLog: Number(mysqlRows(`SELECT COUNT(*) FROM operation_log WHERE action IN ('ROLE_UPSERT','USER_UPSERT','USER_STATUS','SCHEDULE_UPSERT','SCHEDULE_CLOSE') AND (target_type='ROLE' AND target_id IN ('${roleCode}','${forbiddenRoleCode}') OR target_type='USER' AND target_id IN (${userIds}) OR target_type='SCHEDULE' AND target_id IN (${scheduleIds}))`)[0]?.[0] || 0)
    };
    const passed = Object.values(residual).every(value => value === 0);
    report.cleanup.push({ status: passed ? 'PASS' : 'FAIL', residual });
    expect(passed, `演示数据未清理干净：${JSON.stringify(residual)}`);
  } catch (error) {
    report.cleanup.push({ status: 'FAIL', error: error.message });
    report.errors.push(`验收数据清理失败：${error.message}`);
  }
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  let cdp = null;
  try {
    const adminLogin = await login('admin01');
    expect(adminLogin.code === 0, `管理员登录失败：${adminLogin.message}`);
    if (adminLogin.code !== 0) throw new Error(adminLogin.message);
    const adminToken = adminLogin.data.token;
    const adminSession = {
      token: adminToken, userId: adminLogin.data.userId, username: adminLogin.data.username,
      realName: adminLogin.data.realName, role: adminLogin.data.role,
      refId: adminLogin.data.refId === '' ? null : Number(adminLogin.data.refId),
      permissions: adminLogin.data.permissions || []
    };
    const nurseLogin = await login('nurse01');
    expect(nurseLogin.code === 0, '护士登录失败');
    const forbiddenRead = await api('/api/admin/roles', nurseLogin.data.token);
    const forbiddenWrite = await api('/api/admin/roles', nurseLogin.data.token, 'POST', {
      roleCode: forbiddenRoleCode, roleName: '越权角色', permissions: 'none'
    });
    const forbiddenCount = Number(mysqlRows(`SELECT COUNT(*) FROM role WHERE role_code='${forbiddenRoleCode}'`)[0]?.[0] || 0);
    expect(forbiddenRead.code === 403 && forbiddenWrite.code === 403 && forbiddenCount === 0, '非管理员越权维护未被拒绝或产生脏数据');
    record('NON_ADMIN_FORBIDDEN', { read: forbiddenRead.code, write: forbiddenWrite.code, dirtyRoleRows: forbiddenCount });

    const catalog = await api('/api/admin/catalog', adminToken);
    expect(catalog.code === 0 && catalog.data.doctors?.length > 0 && catalog.data.departments?.length > 0, '医生/科室维护目录不可用');
    if (catalog.code !== 0) throw new Error(catalog.message);
    fixture.catalog = catalog.data;
    const doctor = catalog.data.doctors[0];
    record('ADMIN_CATALOG', { doctors: catalog.data.doctors.length, departments: catalog.data.departments.length, firstDoctor: doctor });

    const createdRole = await api('/api/admin/roles', adminToken, 'POST', {
      roleCode, roleName: '验收临时角色', permissions: 'log:query,user:query'
    });
    expect(createdRole.code === 0 && createdRole.data.roleCode === roleCode, `新建角色失败：${createdRole.message}`);
    const updatedRole = await api(`/api/admin/roles/${roleCode}`, adminToken, 'PUT', {
      roleCode, roleName: '验收临时角色已调整', permissions: 'log:query'
    });
    const duplicateRole = await api('/api/admin/roles', adminToken, 'POST', {
      roleCode, roleName: '重复角色', permissions: 'none'
    });
    const roleRow = mysqlRows(`SELECT role_name,permissions FROM role WHERE role_code='${roleCode}'`)[0] || [];
    const roleCount = Number(mysqlRows(`SELECT COUNT(*) FROM role WHERE role_code='${roleCode}'`)[0]?.[0] || 0);
    expect(updatedRole.code === 0 && roleRow[0] === '验收临时角色已调整' && roleRow[1] === 'log:query', '角色修改未落库');
    expect(duplicateRole.code === 409 && roleCount === 1, '重复角色编码未被拒绝或产生脏数据');
    record('ROLE_MAINTENANCE', { created: createdRole.data, updated: updatedRole.data, duplicate: duplicateRole, roleRow, roleCount });

    const createdUser = await api('/api/admin/users', adminToken, 'POST', {
      username, realName: '验收账号', roleCode, refId: null, password: 'Pass123456'
    });
    expect(createdUser.code === 0 && createdUser.data.enabled === true, `新建账号失败或默认状态不是启用：${createdUser.message}`);
    if (createdUser.code !== 0) throw new Error(createdUser.message);
    fixture.userId = createdUser.data.userId;
    const passwordRow = mysqlRows(`SELECT password_hash FROM sys_user WHERE user_id=${fixture.userId}`)[0]?.[0] || '';
    const userList = await api('/api/admin/users', adminToken);
    const userView = userList.data.find(item => Number(item.userId) === Number(fixture.userId)) || {};
    const viewJson = JSON.stringify(userView);
    const firstLogin = await login(username, 'Pass123456');
    expect(passwordRow.startsWith('pbkdf2:sha256:') && passwordRow !== 'Pass123456', '口令未以 PBKDF2 哈希落库');
    expect(!/passwordHash|password_hash/i.test(viewJson), '维护 API 用户视图泄露口令哈希');
    expect(firstLogin.code === 0, '新建账号不能用初始口令登录');
    record('USER_CREATE', { user: createdUser.data, hashPrefix: passwordRow.slice(0, 18), viewKeys: Object.keys(userView), loginCode: firstLogin.code });

    const badRef = await api('/api/admin/users', adminToken, 'POST', {
      username: invalidUsername, realName: '无效档案', roleCode: 'PATIENT',
      refId: 999999999, password: 'Pass123456'
    });
    const missingRef = await api('/api/admin/users', adminToken, 'POST', {
      username: invalidUsername, realName: '缺少档案', roleCode: 'PATIENT',
      refId: null, password: 'Pass123456'
    });
    const badRefRows = Number(mysqlRows(`SELECT COUNT(*) FROM sys_user WHERE username='${invalidUsername}'`)[0]?.[0] || 0);
    expect(badRef.code === 404 && missingRef.code === 400 && badRefRows === 0, '患者/医生档案关联校验未按中文拒绝或产生脏账号');
    record('INVALID_REF_ID', { badRef: { code: badRef.code, message: badRef.message }, missingRef: { code: missingRef.code, message: missingRef.message }, dirtyRows: badRefRows });

    const reset = await api(`/api/admin/users/${fixture.userId}`, adminToken, 'PUT', {
      username, realName: '验收账号已调整', roleCode, refId: null, enabled: true, password: 'Reset123456'
    });
    const oldPasswordLogin = await login(username, 'Pass123456');
    const newPasswordLogin = await login(username, 'Reset123456');
    const resetRow = mysqlRows(`SELECT real_name,password_hash FROM sys_user WHERE user_id=${fixture.userId}`)[0] || [];
    expect(reset.code === 0 && oldPasswordLogin.code !== 0 && newPasswordLogin.code === 0, '重置口令后新旧口令校验不符合预期');
    expect(resetRow[0] === '验收账号已调整' && resetRow[1] !== passwordRow, '重置口令未写入新哈希或姓名未更新');
    record('USER_PASSWORD_RESET', { update: reset.data, oldPasswordLogin: oldPasswordLogin.code, newPasswordLogin: newPasswordLogin.code, hashChanged: resetRow[1] !== passwordRow });

    const disabled = await api(`/api/admin/users/${fixture.userId}/status?enabled=false`, adminToken, 'POST');
    const disabledLogin = await login(username, 'Reset123456');
    const selfDisable = await api(`/api/admin/users/${adminSession.userId}/status?enabled=false`, adminToken, 'POST');
    const adminStillWorks = await api('/api/admin/roles', adminToken);
    expect(disabled.code === 0 && disabledLogin.code !== 0, '禁用账号后仍能登录');
    expect(selfDisable.code === 409 && adminStillWorks.code === 0, '未阻止禁用当前管理员或管理员状态被破坏');
    record('USER_STATUS', { disabled: disabled.data, disabledLogin: disabledLogin.code, selfDisable, adminStillWorks: adminStillWorks.code });

    const scheduleBody = {
      doctorId: doctor.doctorId, deptId: doctor.deptId, workDate, timeSlot,
      totalQty: 4, registrationFee: 18.5
    };
    const createdSchedule = await api('/api/admin/schedules', adminToken, 'POST', scheduleBody);
    expect(createdSchedule.code === 0 && createdSchedule.data.remainingQty === 4, `新建排班失败：${createdSchedule.message}`);
    if (createdSchedule.code !== 0) throw new Error(createdSchedule.message);
    fixture.scheduleId = createdSchedule.data.scheduleId;
    const duplicateSchedule = await api('/api/admin/schedules', adminToken, 'POST', { ...scheduleBody, totalQty: 3 });
    const duplicateScheduleRows = Number(mysqlRows(`SELECT COUNT(*) FROM schedule WHERE doctor_id=${doctor.doctorId} AND work_date='${workDate}' AND time_slot='${timeSlot}'`)[0]?.[0] || 0);
    expect(duplicateSchedule.code === 409 && duplicateScheduleRows === 1, '同一医生日期时段重复排班未被拒绝');

    const expanded = await api(`/api/admin/schedules/${fixture.scheduleId}`, adminToken, 'PUT', { ...scheduleBody, totalQty: 8 });
    expect(expanded.code === 0 && expanded.data.totalQty === 8 && expanded.data.remainingQty === 8, '空闲排班扩容量没有同步修正余量');
    const patientTokens = [];
    for (const [patientUsername, patientId] of [['pt0001', 1], ['pt0002', 2]]) {
      const patientLogin = await login(patientUsername);
      expect(patientLogin.code === 0, `${patientUsername} 登录失败`);
      const booked = await api('/api/registrations', patientLogin.data.token, 'POST', {
        patientId, scheduleId: fixture.scheduleId, channel: 'ONLINE'
      });
      expect(booked.code === 0, `验收挂号失败：${booked.message}`);
      if (booked.code !== 0) throw new Error(booked.message);
      fixture.regIds.push(booked.data.regId);
      patientTokens.push(booked.data.regId);
    }
    const afterBookings = mysqlRows(`SELECT total_qty,remaining_qty FROM schedule WHERE schedule_id=${fixture.scheduleId}`)[0] || [];
    expect(Number(afterBookings[1]) === 6, '占用两位号源后余量不是 6');
    const expandedOccupied = await api(`/api/admin/schedules/${fixture.scheduleId}`, adminToken, 'PUT', { ...scheduleBody, totalQty: 9 });
    const overbooked = await api(`/api/admin/schedules/${fixture.scheduleId}`, adminToken, 'PUT', { ...scheduleBody, totalQty: 1 });
    const afterConflict = mysqlRows(`SELECT total_qty,remaining_qty FROM schedule WHERE schedule_id=${fixture.scheduleId}`)[0] || [];
    expect(expandedOccupied.code === 0 && expandedOccupied.data.remainingQty === 7, '已有占用时增加总量未按 newRemaining=newTotal-used 修正');
    expect(overbooked.code === 409 && /已占用数量/.test(overbooked.message || ''), '把总量调低到已占用量以下未被中文拒绝');
    expect(Number(afterConflict[0]) === 9 && Number(afterConflict[1]) === 7, '非法容量拒绝后排班余量被改写');
    record('SCHEDULE_CAPACITY', {
      created: createdSchedule.data, duplicateSchedule, duplicateScheduleRows,
      expanded: expanded.data, afterBookings, regIds: patientTokens,
      expandedOccupied: expandedOccupied.data, overbooked, afterConflict
    });

    const closed = await api(`/api/admin/schedules/${fixture.scheduleId}/close`, adminToken, 'POST');
    const closedScheduleRows = mysqlRows(`SELECT status FROM schedule WHERE schedule_id=${fixture.scheduleId}`)[0] || [];
    const patient3 = await login('pt0003');
    const closedBook = await api('/api/registrations', patient3.data.token, 'POST', {
      patientId: 3, scheduleId: fixture.scheduleId, channel: 'ONLINE'
    });
    const editClosed = await api(`/api/admin/schedules/${fixture.scheduleId}`, adminToken, 'PUT', { ...scheduleBody, totalQty: 10 });
    expect(closed.code === 0 && closed.data.status === 'CLOSED' && closedScheduleRows[0] === 'CLOSED', '停诊状态未落库');
    expect(closedBook.code === 409 && /停诊/.test(closedBook.message || ''), '停诊排班仍允许挂号');
    expect(editClosed.code === 409, '已停诊排班仍允许编辑');
    record('SCHEDULE_CLOSE', { closed: closed.data, closedBook, editClosed, registrationRows: fixture.regIds.length });

    const auditChecks = {
      ROLE_UPSERT: `target_type='ROLE' AND target_id='${roleCode}'`,
      USER_UPSERT: `target_type='USER' AND target_id='${fixture.userId}'`,
      USER_STATUS: `target_type='USER' AND target_id='${fixture.userId}'`,
      SCHEDULE_UPSERT: `target_type='SCHEDULE' AND target_id='${fixture.scheduleId}'`,
      SCHEDULE_CLOSE: `target_type='SCHEDULE' AND target_id='${fixture.scheduleId}'`
    };
    const auditRows = {};
    for (const [action, where] of Object.entries(auditChecks)) {
      auditRows[action] = Number(mysqlRows(`SELECT COUNT(*) FROM operation_log WHERE action='${action}' AND ${where}`)[0]?.[0] || 0);
      expect(auditRows[action] > 0, `审计日志缺失：${action}`);
    }
    const auditRead = await api('/api/audit?action=SCHEDULE_CLOSE', adminToken);
    expect(auditRead.code === 0 && auditRead.data.some(item => String(item.targetId) === String(fixture.scheduleId)), '管理员审计 REST 未读到停诊日志');
    record('AUDIT_ACTIONS', { rows: auditRows, restRows: Array.isArray(auditRead.data) ? auditRead.data.length : null, restCode: auditRead.code });

    cdp = await browserCheck(adminSession);
  } catch (error) {
    report.fatal = error.stack || error.message;
    report.errors.push(`验收中断：${error.message}`);
  } finally {
    await cleanup();
    if (cdp) {
      try {
        if (cdp.originalUrl && !cdp.originalUrl.startsWith('edge://')) {
          const restore = cdp.originalStorage
            ? `localStorage.setItem('outpatient.session.v1', ${JSON.stringify(cdp.originalStorage)});`
            : 'localStorage.removeItem("outpatient.session.v1");';
          await evaluate(cdp, `(() => { ${restore} return true; })()`);
          await cdp.send('Page.navigate', { url: cdp.originalUrl });
        }
      } catch { /* 恢复原有浏览器标签失败不影响接口验收结论 */ }
      try { cdp.ws.close(); } catch { /* 已关闭 */ }
    }
    report.passed = report.errors.length === 0;
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log('ADMIN_MAINTENANCE_ACCEPTANCE', report.passed ? 'PASS' : 'FAIL', JSON.stringify(report.errors));
    if (!report.passed) process.exitCode = 1;
  }
}

main();
