import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require=createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.UI_BASE || 'http://127.0.0.1:5174';
const debugPort = Number(process.env.UI_CDP_PORT || process.argv[2] || 9225);
const outDir = process.env.UI_OUT_DIR || path.join(projectRoot, 'docs', 'images');
const mysql = process.env.MYSQL_BIN || 'C:/Program Files/MySQL/MySQL Server 9.7/bin/mysql.exe';
const reportFile = path.join(outDir, 'ui-dynamic-acceptance-report.json');
const report = { base, baseline: 'V1.7', viewports: { desktop: [1440, 1000], mobile: [390, 844] }, checks: {}, errors: [] };
const record = (name, value) => { report.checks[name] = value; console.log(name, JSON.stringify(value)); };

function mysqlExec(sql) {
  const {spawnSync}=require('node:child_process');
  const result=spawnSync(mysql,['-h','127.0.0.1','-P','3306','-u','root','--default-character-set=utf8mb4','-D','outpatient','-e',sql],{encoding:'utf8'});
  if(result.status!==0)throw new Error(`MySQL fixture 执行失败：${result.stderr||result.stdout}`);
}

async function login(username) {
  const res = await fetch(`${base}/api/auth/login`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password:'123456'})});
  const p = await res.json();
  if (p.code !== 0) throw new Error(`login failed ${username}: ${p.message}`);
  const d = p.data;
  return {token:d.token,userId:d.userId,username:d.username,realName:d.realName,role:d.role,
    refId:d.refId===''||d.refId==null?null:Number(d.refId),permissions:d.permissions||[]};
}

async function api(pathname, token, method = 'GET', body) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(base + pathname, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json();
  if (payload.code !== 0) throw new Error(`${pathname}: ${payload.message}`);
  return payload.data;
}

async function connectCdp() {
  for (let i=0;i<40;i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
      const pages = list.filter(t=>t.type==='page');
      const target = pages.find(t=>t.url.startsWith(base)) || pages.find(t=>!t.url.startsWith('edge://')) || pages[0];
      if (!target) continue;
      const ws = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
      let id=0; const pending=new Map(); const events=[];
      ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const {resolve,reject}=pending.get(m.id);pending.delete(m.id);m.error?reject(new Error(JSON.stringify(m.error))):resolve(m.result);}else if(m.method){events.push(m)}};
      const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))});
      return {ws,send,events};
    } catch {}
    await new Promise(r=>setTimeout(r,250));
  }
  throw new Error('没有可用 CDP page target');
}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function evaluate(cdp,expression){
  const r=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
}
async function waitFor(cdp,expression,timeout=10000){
  const start=Date.now();
  while(Date.now()-start<timeout){try{if(await evaluate(cdp,expression))return}catch{}await delay(200)}
  throw new Error('等待超时：'+expression);
}
async function screenshot(cdp,file){
  await evaluate(cdp,`(() => {document.querySelector('#boot-screen')?.remove();document.querySelectorAll('.login-card,.story-lead,.story-copy,.wayfinding,.stat-card,.panel').forEach(el=>{el.style.animation='none';el.style.opacity='1';el.style.transform='none'});return true})()`);
  const r=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
  fs.writeFileSync(path.join(outDir,file),Buffer.from(r.data,'base64'));
}
async function sessionInPage(cdp,session){
  await evaluate(cdp,`(() => {localStorage.setItem('outpatient.session.v1', ${JSON.stringify(JSON.stringify(session))});location.reload();return true})()`);
  await waitFor(cdp,`!document.querySelector('#app-view').hidden && document.querySelector('#workspace .page-head h2')`);
  await waitFor(cdp,`!document.querySelector('#boot-screen')`);
  await delay(500);
}
async function dom(cdp){
  return evaluate(cdp,`(() => ({
    title:document.querySelector('#workspace .page-head h2')?.textContent||null,
    nav:document.querySelectorAll('.nav-item').length,
    panels:document.querySelectorAll('#workspace .panel').length,
    stats:document.querySelectorAll('#workspace .stat-strip .stat-card').length,
    viewportWidth:innerWidth,
    bodyWidth:document.body.scrollWidth,
    horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1,
    moneyBad:[...document.querySelectorAll('#workspace .money')].filter(el=>!/^-?\\d+\\.\\d{2} 元$/.test(el.textContent.trim())).length,
    rawStatus:[...document.querySelectorAll('#workspace .status,#workspace .tag')].filter(el=>/^(UNPAID|PAID|RETRY|REFUNDED|PENDING_FEE|IN_TREATMENT|COMPLETED|CALLING|TRIAGED|MISSED|DISPENSED|APPROVED)$/.test(el.textContent.trim())).length,
    rawStatusTexts:[...document.querySelectorAll('#workspace .stat-note,#workspace .panel-head p,#workspace .notice,#workspace .detail-meta')].map(el=>el.textContent.trim()).filter(text=>/\\b(UNPAID|PAID|RETRY|REFUNDED|PENDING_FEE|IN_TREATMENT|COMPLETED|CALLING|TRIAGED|MISSED|DISPENSED|APPROVED|REGISTERED)\\b/.test(text)).slice(0,5),
    appVisible:!document.querySelector('#app-view').hidden,
    connection:document.querySelector('#connection-pill')?.textContent?.trim()||null,
    bootVisible:!!document.querySelector('#boot-screen')
  }))()`);
}
async function retryDom(cdp){
  return evaluate(cdp,`(() => ({
    title:document.querySelector('#workspace .page-head h2')?.textContent||null,
    retryStat:[...document.querySelectorAll('#workspace .stat-card')].some(el=>el.textContent.includes('待重试')&&/\\b[1-9]\\d*\\b/.test(el.textContent)),
    retryBadge:document.querySelector('#cashier-invoice .status-danger')?.textContent?.trim()||null,
    retryNotice:document.querySelector('#cashier-invoice .notice.danger')?.textContent?.trim()||null,
    retryButton:document.querySelector('#cashier-pay-form button[type=submit]')?.textContent?.trim()||null,
    retrySettlement:[...document.querySelectorAll('#cashier-invoice .detail-meta')].map(el=>el.textContent.trim()).find(t=>t.includes('结算失败'))||null,
    paidBadge:document.querySelector('#cashier-invoice .status-success')?.textContent?.trim()||null,
    toast:document.querySelector('#toast')?.hidden?null:document.querySelector('#toast')?.textContent?.trim(),
    selectedBill:document.querySelector('#cashier-pay-form [name=billId]')?.value||null
  }))()`);
}
async function main(){
  const cdp=await connectCdp();
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Log.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false,screenWidth:1440,screenHeight:1000});
  await cdp.send('Storage.clearDataForOrigin',{origin:new URL(base).origin,storageTypes:'local_storage,session_storage,indexeddb,websql,cache_storage'});
  await cdp.send('Runtime.evaluate',{expression:'localStorage.clear(); sessionStorage.clear()'});
  await cdp.send('Page.navigate',{url:base+'/'});

  // AC-20: 把演示收费单 #3 重置成 UNPAID，确保后续点击确实产生本轮 FAILED 流水。
  const cashier=await login('cashier01');
  mysqlExec(`
    DELETE FROM insurance_settlement WHERE bill_id=3 AND settlement_id<>2;
    UPDATE insurance_settlement SET status='FAILED',retry_count=1,error_msg='医保系统暂不可用',trade_no=NULL WHERE settlement_id=2;
    UPDATE fee_bill SET status='UNPAID',pay_type=NULL,paid_amount=0,self_amount=0,insurance_amount=0,cashier_id=NULL,pay_time=NULL,remark=NULL WHERE bill_id=3;
    DELETE FROM checkup_order WHERE visit_id=2 AND checkup_id>4;
    UPDATE checkup_order SET status='PENDING_FEE' WHERE checkup_id=4;
  `);
  const freshBill=await api('/api/bills/3',cashier.token);
  if(freshBill.status!=='UNPAID')throw new Error('收费单 #3 未重置为待收费，无法验证本轮医保结算');
  const beforeSettlements=(freshBill.settlements||[]).length;
  const beforeMaxSettlementId=Math.max(0,...(freshBill.settlements||[]).map(item=>Number(item.settlementId)));
  await sessionInPage(cdp,cashier);
  await waitFor(cdp,`document.querySelector('#cashier-pay-form [name=billId]')?.value==='${freshBill.billId}'`);
  const retryBefore=await retryDom(cdp);
  record('RETRY_BEFORE_PAY',retryBefore);
  await screenshot(cdp,'dynamic-cashier-retry-before.png');
  await evaluate(cdp,`(() => {const s=document.querySelector('#cashier-pay-form [name=payType]');s.value='INSURANCE';document.querySelector('#cashier-pay-form').requestSubmit();return true})()`);
  // 先等服务层新增结算流水，避免旧 RETRY 提示让 DOM 等待条件提前命中。
  let freshBillAfter=await api(`/api/bills/${freshBill.billId}`,cashier.token);
  for(let i=0;i<40&&(freshBillAfter.settlements||[]).length<=beforeSettlements;i++){
    await delay(250);
    freshBillAfter=await api(`/api/bills/${freshBill.billId}`,cashier.token);
  }
  await waitFor(cdp,`document.querySelector('#cashier-invoice .notice.danger')?.textContent.includes('医保结算未成功') && document.querySelector('#cashier-pay-form [name=billId]')?.value==='${freshBill.billId}'`);
  await waitFor(cdp,`!document.querySelector('#app-view').hidden && document.querySelector('#workspace .page-head h2')?.textContent==='收费工作台' && document.querySelector('#cashier-invoice .status-danger')?.textContent==='待重试' && document.querySelector('#cashier-pay-form [name=billId]')?.value==='${freshBill.billId}'`);
  const retryAfter=await retryDom(cdp);
  const allAfterSettlements=freshBillAfter.settlements||[];
  const newSettlements=allAfterSettlements.filter(item=>Number(item.settlementId)>beforeMaxSettlementId);
  record('RETRY_BILL_AFTER_PAY',{
    billId:freshBill.billId,status:freshBillAfter.status,paidAmount:freshBillAfter.paidAmount,
    beforeSettlements,afterSettlements:allAfterSettlements.length,
    newSettlements:newSettlements.map(item=>({settlementId:item.settlementId,status:item.status,retryCount:item.retryCount,errorMsg:item.errorMsg}))
  });
  record('RETRY_AFTER_PAY',retryAfter);
  await screenshot(cdp,'dynamic-cashier-retry-after.png');

  // AC-21: 六个工作台在 390px 下均不溢出，业务时间/金额/状态继续按中文口径显示。
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true,screenWidth:390,screenHeight:844});
  const accounts={PATIENT:'pt0001',NURSE:'nurse01',DOCTOR:'zhangming',CASHIER:'cashier01',PHARMACIST:'pharma01',ADMIN:'admin01'};
  for(const [role,username] of Object.entries(accounts)){
    const session=await login(username);
    await sessionInPage(cdp,session);
    const summary=await dom(cdp);
    record(`MOBILE_ROLE_${role}`,summary);
    await screenshot(cdp,`mobile-workspace-${role.toLowerCase()}.png`);
  }
  const exceptions=cdp.events.filter(e=>e.method==='Runtime.exceptionThrown');
  const severe=cdp.events.filter(e=>e.method==='Log.entryAdded'&&['error','warning'].includes(e.params?.entry?.level));
  record('RUNTIME',{jsExceptions:exceptions.map(e=>e.params.exceptionDetails.text),severeLogs:severe.map(e=>`${e.params.entry.level}:${e.params.entry.text}`)});
  const expect=(ok,msg)=>{if(!ok)report.errors.push(msg)};
  expect(retryAfter.retryBadge==='待重试','医保 FAIL 模式下收费单未显示待重试');
  expect(retryAfter.retryNotice?.includes('医保结算未成功')&&retryAfter.retryNotice?.includes('医保系统暂不可用'),'医保失败中文原因缺失');
  expect(retryAfter.retryButton==='重新结算','待重试单据没有重新结算入口');
  expect(retryAfter.retrySettlement?.includes('结算失败'),'结算流水未显示结算失败');
  expect(!retryAfter.paidBadge,'医保失败页面显示了已收费状态');
  expect(freshBillAfter.status==='RETRY'&&Number(freshBillAfter.paidAmount)===0,'本轮收费单未保持 RETRY 或已记实收');
  expect(allAfterSettlements.length===beforeSettlements+1,'本轮结算流水数量没有增加 1');
  expect(newSettlements.length===1&&newSettlements[0].status==='FAILED'&&newSettlements[0].errorMsg?.includes('医保系统暂不可用'),'本轮未产生唯一的 FAILED 结算流水');
  expect(retryAfter.selectedBill===String(freshBill.billId),'收费台没有选中本轮新建的收费单');
  for(const [name,summary] of Object.entries(report.checks)){
    if(!name.startsWith('MOBILE_ROLE_'))continue;
    expect(summary.appVisible&&summary.title&&summary.nav>0&&summary.panels>0&&summary.stats>0,`${name} 工作台 DOM 不完整`);
    expect(summary.viewportWidth===390&&!summary.horizontalOverflow,`${name} 移动端视口或横向溢出异常`);
    expect(summary.moneyBad===0&&summary.rawStatus===0&&summary.rawStatusTexts.length===0,`${name} 金额/状态显示不符合中文口径：${summary.rawStatusTexts.join(' | ')}`);
    expect(!summary.bootVisible,`${name} 启动遮罩未移除`);
  }
  expect(report.checks.RUNTIME.jsExceptions.length===0,'动态验收出现 JS exception');
  expect(report.checks.RUNTIME.severeLogs.length===0,'动态验收出现 error/warning 日志');
  // 还原一条 RETRY 演示单与一条 FAILED 流水，避免重复运行追加无用结算记录/检查单。
  mysqlExec(`
    DELETE FROM insurance_settlement WHERE bill_id=3 AND settlement_id>2;
    UPDATE insurance_settlement SET status='FAILED',retry_count=1,error_msg='医保系统暂不可用',trade_no=NULL WHERE settlement_id=2;
    UPDATE fee_bill SET status='RETRY',pay_type='INSURANCE',paid_amount=0,self_amount=0,insurance_amount=0,cashier_id=NULL,pay_time=NULL,remark='医保系统暂不可用' WHERE bill_id=3;
    DELETE FROM checkup_order WHERE visit_id=2 AND checkup_id>4;
    UPDATE checkup_order SET status='PENDING_FEE' WHERE checkup_id=4;
  `);
  report.fixtureCleanup='PASS: fee_bill #3=RETRY, settlement #2=FAILED(retry_count=1), checkup #4=PENDING_FEE';
  report.passed=report.errors.length===0;
  fs.writeFileSync(reportFile,JSON.stringify(report,null,2));
  console.log('DYNAMIC_ACCEPTANCE',report.passed?'PASS':'FAIL',JSON.stringify(report.errors));
  cdp.ws.close();
  if(!report.passed)process.exitCode=1;
}
main().catch(e=>{console.error('FATAL',e);process.exit(1)});

