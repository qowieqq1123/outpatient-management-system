import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { spawnSync } = require('node:child_process');
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const apiBase = process.env.API_BASE || 'http://127.0.0.1:8080';
const outDir = process.env.UI_OUT_DIR || path.join(projectRoot, 'docs', 'images');
const mysqlBin = process.env.MYSQL_BIN || 'C:/Program Files/MySQL/MySQL Server 9.7/bin/mysql.exe';
const reportFile = path.join(outDir, 'perf-50-concurrency-report.json');

const envInt = (name, fallback, min, max) => {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} 必须是 ${min}~${max} 的整数`);
  return value;
};
const rounds = envInt('PERF_ROUNDS', 3, 1, 10);
const concurrency = envInt('PERF_CONCURRENCY', 50, 2, 200);
const p95BudgetMs = envInt('PERF_P95_BUDGET_MS', 3000, 1, 120000);

const report = {
  scenario: 'AC-26 / 50 并发挂号 P95 本机压测',
  baseline: 'V1.7',
  generatedAt: new Date().toISOString(),
  environment: {
    apiBase,
    node: process.version,
    platform: process.platform,
    mysqlVersion: null,
    hikariMaximumPoolSize: 20,
    rounds,
    concurrency,
    p95BudgetMs,
    timingScope: '客户端屏障释放到 HTTP 响应 JSON 解析完成；登录和夹具创建不计入'
  },
  rounds: [],
  summary: {},
  errors: [],
  cleanup: [],
  passed: false
};
const expect = (ok, message) => { if (!ok) report.errors.push(message); };
const sqlText = value => String(value).replaceAll("'", "''");

function mysqlCommand(sql, tabular = false) {
  const args = ['-h', '127.0.0.1', '-P', '3306', '-u', 'root', '--default-character-set=utf8mb4', '-D', 'outpatient'];
  if (tabular) args.push('-N', '-B');
  args.push('-e', sql);
  const result = spawnSync(mysqlBin, args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`MySQL 执行失败：${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function mysqlRows(sql) {
  return mysqlCommand(sql, true).split(/\r?\n/).filter(Boolean).map(line => line.split('\t'));
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

/** nearest-rank 分位数；50 个样本时 P95 取升序第 ceil(0.95*50)=48 个。 */
function percentile(sortedValues, fraction) {
  if (!sortedValues.length) return null;
  const rank = Math.ceil(fraction * sortedValues.length);
  return sortedValues[Math.min(sortedValues.length - 1, Math.max(0, rank - 1))];
}

function latencyStats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted.at(-1),
    avg: Number((sum / sorted.length).toFixed(1)),
    p50: percentile(sorted, 0.50),
    p90: percentile(sorted, 0.90),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99)
  };
}

/** 每轮使用唯一前缀/日期/时段，数据库写入独立于响应时间采样。 */
async function createFixture(adminToken, roundNo) {
  const suffix = `PF${Date.now().toString().slice(-7)}${String(roundNo).padStart(2, '0')}`;
  const workDate = new Date(Date.now() + (40 + roundNo) * 86400000).toISOString().slice(0, 10);
  const timeSlot = `压测 ${suffix}`.slice(0, 30);
  const catalog = await api('/api/admin/catalog', adminToken);
  if (catalog.code !== 0) throw new Error(`维护目录不可用：${catalog.message}`);
  const doctor = catalog.data.doctors[0];

  const patientValues = [];
  for (let index = 1; index <= concurrency; index++) {
    const number = `${suffix}P${String(index).padStart(3, '0')}`;
    patientValues.push(`('${sqlText(number)}','压测${index}','女','2000-01-01','PLAIN:13900000000','PLAIN:46010020000101${String(index).padStart(4, '0')}',NULL,'SELF')`);
  }
  mysqlCommand(`INSERT INTO patient (patient_no,name,gender,birth_date,phone_enc,id_card_enc,insurance_no,insurance_type) VALUES ${patientValues.join(',')};`);
  const patientIds = mysqlRows(`SELECT patient_id FROM patient WHERE patient_no LIKE '${suffix}P%' ORDER BY patient_id`)
    .flat().map(Number);
  if (patientIds.length !== concurrency) throw new Error(`临时患者应为 ${concurrency} 个，实际 ${patientIds.length} 个`);

  const hash = mysqlRows("SELECT password_hash FROM sys_user WHERE username='pt0001'")[0][0];
  const userValues = patientIds.map((patientId, index) => {
    const username = `${suffix.toLowerCase()}p${String(index + 1).padStart(3, '0')}`;
    return `('${sqlText(username)}','${sqlText(hash)}','压测${index + 1}','PATIENT',${patientId},1)`;
  });
  mysqlCommand(`INSERT INTO sys_user (username,password_hash,real_name,role_code,ref_id,enabled) VALUES ${userValues.join(',')};`);
  const userIds = mysqlRows(`SELECT user_id FROM sys_user WHERE username LIKE '${suffix.toLowerCase()}p%' ORDER BY user_id`)
    .flat().map(Number);
  if (userIds.length !== concurrency) throw new Error(`临时账号应为 ${concurrency} 个，实际 ${userIds.length} 个`);

  const schedule = await api('/api/admin/schedules', adminToken, 'POST', {
    doctorId: doctor.doctorId, deptId: doctor.deptId, workDate, timeSlot,
    totalQty: concurrency, registrationFee: 10
  });
  if (schedule.code !== 0) throw new Error(`临时号源创建失败：${schedule.message}`);
  return {
    suffix, workDate, timeSlot, doctor,
    patientIds, userIds,
    scheduleId: Number(schedule.data.scheduleId),
    totalQty: Number(schedule.data.totalQty),
    remainingQty: Number(schedule.data.remainingQty)
  };
}

async function cleanupRound(fixture, roundNo) {
  if (!fixture) return;
  const scheduleId = Number(fixture.scheduleId) || -1;
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
    DELETE FROM schedule WHERE schedule_id=${scheduleId} OR (work_date='${fixture.workDate}' AND time_slot='${sqlText(fixture.timeSlot)}');
    DELETE FROM sys_user WHERE user_id IN (${userIds}) OR username LIKE '${fixture.suffix.toLowerCase()}p%';
    DELETE FROM patient WHERE patient_id IN (${patientIds}) OR patient_no LIKE '${fixture.suffix}P%';
  `;
  try {
    mysqlCommand(sql);
    const residual = {
      patients: Number(mysqlRows(`SELECT COUNT(*) FROM patient WHERE patient_no LIKE '${fixture.suffix}P%'`)[0]?.[0] || 0),
      users: Number(mysqlRows(`SELECT COUNT(*) FROM sys_user WHERE username LIKE '${fixture.suffix.toLowerCase()}p%'`)[0]?.[0] || 0),
      schedules: Number(mysqlRows(`SELECT COUNT(*) FROM schedule WHERE work_date='${fixture.workDate}' AND time_slot='${sqlText(fixture.timeSlot)}'`)[0]?.[0] || 0),
      registrations: Number(mysqlRows(`SELECT COUNT(*) FROM registration WHERE schedule_id=${scheduleId}`)[0]?.[0] || 0),
      operationLogs: Number(mysqlRows(`SELECT COUNT(*) FROM operation_log
        WHERE (action='SCHEDULE_UPSERT' AND target_type='SCHEDULE' AND target_id='${scheduleId}')
          OR (action='REGISTRATION_BOOK' AND target_type='REGISTRATION'
              AND target_id IN (SELECT CAST(reg_id AS CHAR) COLLATE utf8mb4_unicode_ci
                                FROM registration WHERE schedule_id=${scheduleId}))`)[0]?.[0]?.replace('\r','') || 0)
    };
    const passed = Object.values(residual).every(value => value === 0);
    report.cleanup.push({ status: passed ? 'PASS' : 'FAIL', round: roundNo, suffix: fixture.suffix, residual });
    expect(passed, `第 ${roundNo} 轮夹具未清理干净：${JSON.stringify(residual)}`);
  } catch (error) {
    report.cleanup.push({ status: 'FAIL', round: roundNo, suffix: fixture.suffix, error: error.message });
    report.errors.push(`第 ${roundNo} 轮夹具清理失败：${error.message}`);
  }
}

async function runRound(adminToken, roundNo) {
  let fixture = null;
  try {
    fixture = await createFixture(adminToken, roundNo);
    const sessions = [];
    for (let index = 0; index < fixture.patientIds.length; index++) {
      const username = `${fixture.suffix.toLowerCase()}p${String(index + 1).padStart(3, '0')}`;
      const result = await login(username);
      if (result.code !== 0) throw new Error(`临时患者账号 ${username} 登录失败：${result.message}`);
      sessions.push({ username, token: result.data.token, patientId: fixture.patientIds[index] });
    }

    // 屏障确保 50 个 fetch 在同一轮事件循环发出；计时只包含挂号 REST 本身。
    let release;
    const barrier = new Promise(resolve => { release = resolve; });
    const requests = sessions.map(session => barrier.then(async () => {
      const began = performance.now();
      try {
        const result = await api('/api/registrations', session.token, 'POST', {
          patientId: session.patientId, scheduleId: fixture.scheduleId, channel: 'ONLINE'
        });
        return { username: session.username, elapsedMs: Math.round(performance.now() - began), ...result };
      } catch (error) {
        return { username: session.username, elapsedMs: Math.round(performance.now() - began), code: -1, message: error.message, httpStatus: 0 };
      }
    }));
    const wallStart = performance.now();
    release();
    const results = await Promise.all(requests);
    const wallMs = Math.round(performance.now() - wallStart);

    const successes = results.filter(item => item.code === 0);
    const queueNos = successes.map(item => Number(item.data?.queueNo)).sort((a, b) => a - b);
    const expectedQueueNos = Array.from({ length: concurrency }, (_, index) => index + 1);
    const dbRows = mysqlRows(`SELECT reg_id,queue_no,status FROM registration WHERE schedule_id=${fixture.scheduleId} AND patient_id IN (${fixture.patientIds.join(',')}) ORDER BY queue_no`);
    const dbQueueNos = dbRows.map(row => Number(row[1]));
    const scheduleRow = mysqlRows(`SELECT total_qty,remaining_qty,status FROM schedule WHERE schedule_id=${fixture.scheduleId}`)[0] || [];
    const latencies = results.map(item => item.elapsedMs);
    const stats = latencyStats(latencies);
    const serverErrors = results.filter(item => item.httpStatus >= 500);
    const allActive = dbRows.length === concurrency && dbRows.every(row => row[2] === 'REGISTERED');
    const roundReport = {
      round: roundNo,
      fixture: {
        suffix: fixture.suffix, workDate: fixture.workDate, timeSlot: fixture.timeSlot,
        doctorId: fixture.doctor.doctorId, deptId: fixture.doctor.deptId,
        scheduleId: fixture.scheduleId, totalQty: fixture.totalQty, remainingQty: fixture.remainingQty
      },
      attempts: results.length,
      successes: successes.length,
      failures: results.length - successes.length,
      wallMs,
      throughputPerSecond: Number((successes.length / (wallMs / 1000)).toFixed(1)),
      latencyMs: stats,
      rawLatencyMs: latencies,
      queueNos,
      dbQueueNos,
      scheduleRow,
      allActive,
      serverErrors: serverErrors.length,
      httpStatuses: [...new Set(results.map(item => item.httpStatus))],
      failureMessages: [...new Set(results.filter(item => item.code !== 0).map(item => item.message))]
    };
    report.rounds.push(roundReport);
    console.log(`PERF_ROUND_${roundNo}`, JSON.stringify({
      successes: roundReport.successes, wallMs, p95: stats.p95, p99: stats.p99,
      throughput: roundReport.throughputPerSecond, queueRange: [queueNos[0], queueNos.at(-1)], remainingQty: scheduleRow[1]
    }));

    expect(stats.p95 <= p95BudgetMs, `第 ${roundNo} 轮 P95 ${stats.p95}ms 超过 ${p95BudgetMs}ms`);
    expect(successes.length === concurrency, `第 ${roundNo} 轮成功应为 ${concurrency} 次，实际 ${successes.length} 次`);
    expect(JSON.stringify(queueNos) === JSON.stringify(expectedQueueNos), `第 ${roundNo} 轮响应号序不是 1~${concurrency}`);
    expect(JSON.stringify(dbQueueNos) === JSON.stringify(expectedQueueNos), `第 ${roundNo} 轮数据库号序不是 1~${concurrency}`);
    expect(allActive, `第 ${roundNo} 轮数据库存在非 REGISTERED 或多余的挂号单`);
    expect(Number(scheduleRow[0]) === concurrency && Number(scheduleRow[1]) === 0 && scheduleRow[2] === 'OPEN',
      `第 ${roundNo} 轮号源总量/余量/状态不符合 ${concurrency}/0/OPEN`);
    expect(serverErrors.length === 0, `第 ${roundNo} 轮存在 ${serverErrors.length} 个 5xx 响应`);
    expect(results.every(item => item.httpStatus === 200), `第 ${roundNo} 轮统一响应体 HTTP 状态异常`);
  } finally {
    await cleanupRound(fixture, roundNo);
  }
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  try {
    report.environment.mysqlVersion = mysqlRows('SELECT VERSION()')[0]?.[0] || null;
    const adminLogin = await login('admin01');
    if (adminLogin.code !== 0) throw new Error(`管理员登录失败：${adminLogin.message}`);
    const adminToken = adminLogin.data.token;
    for (let roundNo = 1; roundNo <= rounds; roundNo++) await runRound(adminToken, roundNo);

    const allLatencies = report.rounds.flatMap(round => round.rawLatencyMs);
    const summaryStats = latencyStats(allLatencies);
    const totalSuccesses = report.rounds.reduce((sum, round) => sum + round.successes, 0);
    const totalWallMs = report.rounds.reduce((sum, round) => sum + round.wallMs, 0);
    report.summary = {
      rounds: report.rounds.length,
      attempts: allLatencies.length,
      successes: totalSuccesses,
      latencyMs: summaryStats,
      totalWallMs,
      throughputPerSecond: Number((totalSuccesses / (totalWallMs / 1000)).toFixed(1)),
      perRoundP95: report.rounds.map(round => round.latencyMs.p95),
      p95BudgetMs,
      cleanupPassed: report.cleanup.filter(item => item.status === 'PASS').length,
      allFixturesClean: report.cleanup.length === rounds && report.cleanup.every(item => item.status === 'PASS')
    };
    expect(report.rounds.length === rounds, `采样轮次应为 ${rounds}，实际 ${report.rounds.length}`);
    expect(allLatencies.length === rounds * concurrency, `汇总请求数应为 ${rounds * concurrency}，实际 ${allLatencies.length}`);
    expect(summaryStats.p95 <= p95BudgetMs, `汇总 P95 ${summaryStats.p95}ms 超过 ${p95BudgetMs}ms`);
    expect(totalSuccesses === rounds * concurrency, `汇总成功次数应为 ${rounds * concurrency}，实际 ${totalSuccesses}`);
    expect(report.summary.allFixturesClean, `夹具清理结果不是 ${rounds} 轮全 PASS`);
    console.log('PERF_SUMMARY', JSON.stringify(report.summary));
  } catch (error) {
    report.fatal = error.stack || error.message;
    report.errors.push(`压测中断：${error.message}`);
  } finally {
    report.passed = report.errors.length === 0;
    fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log('PERF_50_CONCURRENCY', report.passed ? 'PASS' : 'FAIL', JSON.stringify(report.errors));
    if (!report.passed) process.exitCode = 1;
  }
}

main();
