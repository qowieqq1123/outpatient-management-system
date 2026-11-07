import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.UI_BASE || 'http://127.0.0.1:5173';
const debugPort = Number(process.env.UI_CDP_PORT || process.argv[2] || 9225);
const outDir = process.env.UI_OUT_DIR || path.join(projectRoot, 'docs', 'images');
fs.mkdirSync(outDir, { recursive: true });

const accounts = {
  PATIENT: 'pt0001', NURSE: 'nurse01', DOCTOR: 'zhangming',
  CASHIER: 'cashier01', PHARMACIST: 'pharma01', ADMIN: 'admin01'
};

async function login(username) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({username, password:'123456'})
  });
  const payload = await res.json();
  if (payload.code !== 0) throw new Error(`login failed ${username}: ${payload.message}`);
  const d = payload.data;
  return {
    token: d.token, userId: d.userId, username: d.username, realName: d.realName,
    role: d.role, refId: d.refId === '' || d.refId == null ? null : Number(d.refId),
    permissions: d.permissions || []
  };
}

async function connectCdp() {
  let target;
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
      const pages = list.filter(t => t.type === 'page');
      target = pages.find(t => t.url.startsWith(base))
        || pages.find(t => !t.url.startsWith('edge://'))
        || pages[0];
      if (target) break;
    } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  if (!target) throw new Error('no CDP page target');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const {resolve, reject} = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method) {
      events.push(msg);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const thisId = ++id;
    pending.set(thisId, {resolve, reject});
    ws.send(JSON.stringify({id:thisId, method, params}));
  });
  return {ws, send, events};
}

async function clearPageSession(cdp) {
  // 同时清 Storage/Cache，避免 CDP 复用已登录页面时残留会话让登录页等待超时。
  await cdp.send('Storage.clearDataForOrigin', {origin: new URL(base).origin, storageTypes: 'local_storage,session_storage,indexeddb,websql,cache_storage'});
  await cdp.send('Runtime.evaluate', {expression: 'localStorage.clear(); sessionStorage.clear();'});
}

const delay = ms => new Promise(r => setTimeout(r, ms));

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:true});
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(cdp, expression, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      if (await evaluate(cdp, expression)) return;
    } catch {}
    await delay(250);
  }
  throw new Error(`等待界面状态超时：${expression}`);
}

async function screenshot(cdp, file) {
  // 截图前移除启动遮罩并结束入场动画，避免证据只记录过渡态。
  await evaluate(cdp, `(() => {
    document.querySelector('#boot-screen')?.remove();
    document.querySelectorAll('.login-card, .story-lead, .story-copy, .wayfinding, .stat-card, .panel')
      .forEach(el => { el.style.animation = 'none'; el.style.opacity = '1'; el.style.transform = 'none'; });
    return true;
  })()`);
  const result = await cdp.send('Page.captureScreenshot', {format:'png', fromSurface:true, captureBeyondViewport:false});
  fs.writeFileSync(path.join(outDir,file), Buffer.from(result.data,'base64'));
}

async function domSummary(cdp) {
  const expr = `(() => ({
    title: document.querySelector('#workspace .page-head h2')?.textContent || null,
    nav: document.querySelectorAll('.nav-item').length,
    panels: document.querySelectorAll('#workspace .panel').length,
    stats: document.querySelectorAll('#workspace .stat-strip .stat-card').length,
    role: document.querySelector('#session-role')?.textContent || null,
    name: document.querySelector('#session-name')?.textContent || null,
    appVisible: !document.querySelector('#app-view')?.hidden,
    loginVisible: !document.querySelector('#login-view')?.hidden,
    bootVisible: !!document.querySelector('#boot-screen'),
    error: document.querySelector('#workspace .notice.danger')?.textContent?.trim() || null,
    toastVisible: !document.querySelector('#toast')?.hidden,
    connection: document.querySelector('#connection-pill')?.textContent?.trim() || null,
    sessionStored: !!localStorage.getItem('outpatient.session.v1'),
    roleCards: document.querySelectorAll('.role-option').length,
    loginHeading: document.querySelector('#login-view h2')?.textContent?.trim() || null,
    loginMessage: document.querySelector('#login-message')?.textContent?.trim() || null,
    clockText: document.querySelector('#clock')?.textContent?.trim() || null,
    dateBadges: [...document.querySelectorAll('#workspace .tag')]
      .map(el => el.textContent.trim())
      .filter(text => /^\\d{4}[-/]\\d{1,2}[-/]/.test(text)).slice(0, 3),
    moneyCells: [...document.querySelectorAll('#workspace .money')].map(el => el.textContent.trim()).slice(0, 12),
    badMoney: [...document.querySelectorAll('#workspace .money')]
      .filter(el => !/^-?\\d+\\.\\d{2} 元$/.test(el.textContent.trim())).length,
    rawStatusCodes: [...document.querySelectorAll('#workspace .status, #workspace .tag')]
      .map(el => el.textContent.trim())
      .filter(text => /^(UNPAID|PAID|RETRY|REFUNDED|PENDING_FEE|IN_TREATMENT|COMPLETED|CALLING|TRIAGED|MISSED|DISPENSED|APPROVED)$/.test(text)).length,
    rawStatusTexts: [...document.querySelectorAll('#workspace .stat-note, #workspace .panel-head p, #workspace .notice, #workspace .detail-meta')]
      .map(el => el.textContent.trim())
      .filter(text => /\b(UNPAID|PAID|RETRY|REFUNDED|PENDING_FEE|IN_TREATMENT|COMPLETED|CALLING|TRIAGED|MISSED|DISPENSED|APPROVED|REGISTERED)\b/.test(text)).slice(0, 5),
    bodyWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1
  }))()`;
  return evaluate(cdp, expr);
}

async function main() {
  const report = { base, baseline: 'V1.7', viewport: {}, checks: {}, errors: [] };
  const record = (name, value) => { report.checks[name] = value; console.log(name, JSON.stringify(value)); };
  const cdp = await connectCdp();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {width:1440,height:1000,deviceScaleFactor:1,mobile:false,screenWidth:1440,screenHeight:1000});
  await clearPageSession(cdp);
  await cdp.send('Page.navigate', {url: `${base}/`});
  await waitFor(cdp, `document.querySelector('#login-view') && !document.querySelector('#login-view').hidden`);

  // Verify the real login form, not just a pre-seeded session.
  await evaluate(cdp, `localStorage.clear(); location.reload();`);
  await waitFor(cdp, `(() => {
    const form = document.querySelector('#login-form');
    return !!form && document.querySelectorAll('.role-option').length === 6
      && !!document.querySelector('#login-username').value;
  })()`);
  const loginPage = await domSummary(cdp);
  record('LOGIN_PAGE', loginPage);
  await screenshot(cdp, '00-login-desktop.png');
  await evaluate(cdp, `(() => {
    const u=document.querySelector('#login-username');
    const p=document.querySelector('#login-password');
    u.value='pt0001'; p.value='123456';
    document.querySelector('#login-form').requestSubmit();
    return true;
  })()`);
  await waitFor(cdp, `!document.querySelector('#app-view').hidden && document.querySelector('#workspace .page-head h2')`);
  const loginSummary = await domSummary(cdp);
  record('LOGIN_FORM', loginSummary);
  await screenshot(cdp, '01-patient-after-login.png');

  // A malformed token must clear the local session and return to the login view.
  await evaluate(cdp, `(() => {
    const raw = JSON.parse(localStorage.getItem('outpatient.session.v1'));
    raw.token = 'invalid.token.value';
    localStorage.setItem('outpatient.session.v1', JSON.stringify(raw));
    location.reload();
  })()`);
  await waitFor(cdp, `!document.querySelector('#login-view').hidden`);
  const unauthorized = await domSummary(cdp);
  record('UNAUTHORIZED', unauthorized);
  await screenshot(cdp, '02-unauthorized-return.png');

  for (const [role, username] of Object.entries(accounts)) {
    const session = await login(username);
    await evaluate(cdp, `localStorage.setItem('outpatient.session.v1', ${JSON.stringify(JSON.stringify(session))}); location.reload();`);
    await waitFor(cdp, `!document.querySelector('#app-view').hidden && document.querySelector('#workspace .page-head h2')`);
    await delay(700);
    const summary = await domSummary(cdp);
    report.viewport[`desktop_${role}`] = { width: 1440, height: 1000 };
    record(`ROLE_${role}`, summary);
    await screenshot(cdp, `workspace-${role.toLowerCase()}-desktop.png`);
  }

  // Mobile checks for the login page and the densest operational view (nurse queue board).
  await cdp.send('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:true,screenWidth:390,screenHeight:844});
  await evaluate(cdp, `localStorage.clear(); location.reload();`);
  await waitFor(cdp, `!document.querySelector('#login-view').hidden && document.querySelectorAll('.role-option').length === 6`);
  record('MOBILE_LOGIN', await domSummary(cdp));
  await screenshot(cdp, 'mobile-login.png');
  const nurseSession = await login('nurse01');
  await evaluate(cdp, `localStorage.setItem('outpatient.session.v1', ${JSON.stringify(JSON.stringify(nurseSession))}); location.reload();`);
  await waitFor(cdp, `!document.querySelector('#app-view').hidden && document.querySelector('#workspace .page-head h2')`);
  await delay(700);
  report.viewport.mobile = { width: 390, height: 844 };
  record('MOBILE_NURSE', await domSummary(cdp));
  await screenshot(cdp, 'mobile-nurse-workspace.png');

  const exceptions = cdp.events.filter(e => e.method === 'Runtime.exceptionThrown');
  const severeLogs = cdp.events.filter(e => e.method === 'Log.entryAdded' && ['error','warning'].includes(e.params?.entry?.level));
  const runtime = {
    jsExceptions: exceptions.map(e => e.params.exceptionDetails.text),
    severeLogs: severeLogs.map(e => `${e.params.entry.level}:${e.params.entry.text}`)
  };
  record('RUNTIME', runtime);

  const expect = (ok, message) => { if (!ok) report.errors.push(message); };
  expect(loginPage.loginVisible && loginPage.roleCards === 6 && !loginPage.bootVisible,
    '登录页未正确显示六个身份卡片或启动遮罩未移除');
  expect(!loginPage.horizontalOverflow && loginPage.viewportWidth === 1440,
    '桌面登录页视口或横向布局异常');
  expect(loginSummary.appVisible && loginSummary.title === '患者工作台' && loginSummary.sessionStored,
    '真实表单登录未进入患者工作台或未保存 JWT');
  expect(unauthorized.loginVisible && !unauthorized.sessionStored && !unauthorized.appVisible,
    '失效 token 未清理会话并回到登录页');
  for (const [name, summary] of Object.entries(report.checks)) {
    if (!name.startsWith('ROLE_') && name !== 'MOBILE_NURSE') continue;
    expect(summary.appVisible && summary.title && summary.nav > 0 && summary.panels > 0 && summary.stats > 0,
      `${name} 工作台DOM不完整`);
    expect(!summary.horizontalOverflow, `${name} 存在横向溢出`);
    expect(!summary.clockText || /^\d{4}-\d{2}-\d{2} /.test(summary.clockText),
      `${name} 顶栏时间不是 yyyy-MM-dd HH:mm:ss 格式`);
    expect(summary.dateBadges.every(text => /^\d{4}-\d{2}-\d{2} /.test(text)),
      `${name} 页面时间标签不是 yyyy-MM-dd HH:mm 格式`);
    expect(summary.badMoney === 0, `${name} 存在金额格式错误`);
    expect(summary.rawStatusCodes === 0, `${name} 存在未翻译的状态码`);
    expect(summary.rawStatusTexts.length === 0, `${name} 说明文案存在未翻译的状态码：${summary.rawStatusTexts.join(' | ')}`);
    const expectedRetryNotice = summary.error?.startsWith('医保结算未成功，单据保持「待重试」');
    expect(!summary.error || expectedRetryNotice, `${name} 工作台显示业务错误：${summary.error}`);
  }
  expect(report.checks.MOBILE_LOGIN.loginVisible
    && !report.checks.MOBILE_LOGIN.horizontalOverflow
    && report.checks.MOBILE_LOGIN.viewportWidth === 390,
    '移动端登录页不可用、视口未保持 390px 或存在横向溢出');
  expect(report.checks.MOBILE_NURSE.viewportWidth === 390,
    `移动端护士台布局视口被撑到 ${report.checks.MOBILE_NURSE.viewportWidth}px`);
  expect(runtime.jsExceptions.length === 0, `浏览器捕获 ${runtime.jsExceptions.length} 个 JS exception`);
  expect(runtime.severeLogs.length === 0, `浏览器捕获 ${runtime.severeLogs.length} 条 error/warning 日志`);
  report.passed = report.errors.length === 0;
  fs.writeFileSync(path.join(outDir, 'ui-acceptance-report.json'), JSON.stringify(report, null, 2));
  console.log('ACCEPTANCE', report.passed ? 'PASS' : 'FAIL', JSON.stringify(report.errors));
  cdp.ws.close();
  if (!report.passed) process.exitCode = 1;
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
