import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mysql = process.env.MYSQL_BIN || 'C:/Program Files/MySQL/MySQL Server 9.7/bin/mysql.exe';
const apiBases = {
  direct: process.env.API_BASE || 'http://127.0.0.1:8080',
  viaSpa: process.env.UI_BASE || 'http://127.0.0.1:5173'
};
const outDir = process.env.UI_OUT_DIR || path.join(projectRoot, 'docs', 'images');
const reportFile = path.join(outDir, 'read-only-connectivity-report.json');
const out = { generatedAt: new Date().toISOString(), baseline: 'V1.7', checks: {}, findings: [], errors: [] };

function rows(sql) {
  const result = spawnSync(mysql, [
    '-h', '127.0.0.1', '-P', '3306', '-u', 'root',
    '--default-character-set=utf8mb4', '-D', 'outpatient', '-N', '-B', '-e', sql
  ], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return String(result.stdout || '').split(/\r?\n/).filter(Boolean).map(line => line.split('\t'));
}

async function call(base, path, token, method = 'GET', body) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const json = await response.json().catch(() => null);
  return { httpStatus: response.status, code: json?.code, message: json?.message, data: json?.data };
}

async function login(username, password = '123456', base = apiBases.direct) {
  const result = await call(base, '/api/auth/login', null, 'POST', { username, password });
  if (result.code !== 0) throw new Error(`${username} 登录失败：${result.message}`);
  return result.data.token;
}

try {
  const spaLogin = await call(apiBases.viaSpa, '/api/auth/login', null, 'POST', {
    username: 'admin01', password: '123456'
  });
  out.checks.loginViaSpa = {
    httpStatus: spaLogin.httpStatus,
    code: spaLogin.code,
    message: spaLogin.message,
    role: spaLogin.data?.role,
    username: spaLogin.data?.username
  };
  if (spaLogin.code !== 0) out.errors.push('Vite 代理登录失败');

  const tokens = {};
  for (const username of ['pt0001', 'pt0002', 'pt0004', 'nurse01', 'zhangming', 'lihui', 'cashier01', 'pharma01', 'pharma02', 'admin01']) {
    tokens[username] = await login(username);
  }

  const boardDate = rows(`
    SELECT s.work_date FROM schedule s
    JOIN registration r ON r.schedule_id=s.schedule_id
    WHERE r.doctor_id=1 AND r.status IN ('REGISTERED','TRIAGED','CALLING')
    ORDER BY s.work_date LIMIT 1
  `)[0]?.[0];
  if (!boardDate) throw new Error('找不到可测试的医生队列日期');
  const noQueueDate = rows(`
    SELECT DATE_ADD(MAX(work_date), INTERVAL 1 DAY) FROM schedule
  `)[0]?.[0];
  const start = '2020-01-01T00:00:00';
  const end = '2030-12-31T23:59:59';
  const matrix = {
    PATIENT: [
      '/api/schedules',
      '/api/registrations/mine?patientId=1',
      '/api/visits/mine',
      '/api/bills/mine',
      `/api/queue/board?doctorId=1&workDate=${boardDate}`
    ],
    NURSE: [
      '/api/schedules',
      '/api/registrations/workbench?status=ALL',
      `/api/queue/board?doctorId=1&workDate=${boardDate}`
    ],
    DOCTOR: [
      `/api/queue/board?doctorId=1&workDate=${boardDate}`,
      '/api/registrations/workbench?status=ALL',
      '/api/visits/workbench?status=ALL',
      '/api/pharmacy/medicines',
      '/api/prescriptions/checkup-catalog',
      '/api/prescriptions/workbench?status=ALL'
    ],
    CASHIER: [
      '/api/visits/workbench?status=ALL',
      '/api/bills/workbench?status=ALL',
      '/api/registrations/workbench?status=ALL',
      `/api/stats/revenue?start=${start}&end=${end}`
    ],
    PHARMACIST: [
      '/api/prescriptions/workbench?status=ALL',
      '/api/pharmacy/medicines?keyword='
    ],
    ADMIN: [
      `/api/stats/workload?start=${start}&end=${end}`,
      `/api/stats/revenue?start=${start}&end=${end}`,
      `/api/audit?start=${start}&end=${end}`,
      '/api/registrations/workbench?status=ALL',
      '/api/admin/roles',
      '/api/admin/users',
      '/api/admin/schedules',
      '/api/admin/catalog'
    ]
  };
  const userOfRole = {
    PATIENT: 'pt0001', NURSE: 'nurse01', DOCTOR: 'zhangming',
    CASHIER: 'cashier01', PHARMACIST: 'pharma01', ADMIN: 'admin01'
  };
  out.checks.matrix = {};
  for (const [role, endpoints] of Object.entries(matrix)) {
    out.checks.matrix[role] = [];
    for (const path of endpoints) {
      const result = await call(apiBases.viaSpa, path, tokens[userOfRole[role]]);
      const ok = result.httpStatus === 200 && result.code === 0;
      out.checks.matrix[role].push({
        path,
        ok,
        httpStatus: result.httpStatus,
        code: result.code,
        message: result.message,
        rows: Array.isArray(result.data) ? result.data.length : null
      });
      if (!ok) out.errors.push(`${role} ${path} 非 code=0：${result.code} ${result.message}`);
    }
  }

  const bill1 = await call(apiBases.direct, '/api/bills/1', tokens.pt0002);
  const adminBill1 = await call(apiBases.direct, '/api/bills/1', tokens.admin01);
  const visit1 = await call(apiBases.direct, '/api/visits/1', tokens.pt0002);
  const prescriptions1 = await call(apiBases.direct, '/api/prescriptions/visit/1', tokens.pt0002);
  const boardOther = await call(apiBases.direct, `/api/queue/board?doctorId=1&workDate=${boardDate}`, tokens.pt0002);
  const boardNoQueue = await call(apiBases.direct, `/api/queue/board?doctorId=1&workDate=${noQueueDate}`, tokens.pt0002);
  const boardPatientWithoutRegistration = await call(apiBases.direct, `/api/queue/board?doctorId=1&workDate=${boardDate}`, tokens.pt0004);
  const boardOtherDoctor = await call(apiBases.direct, `/api/queue/board?doctorId=1&workDate=${boardDate}`, tokens.lihui);
  const boardOwnDoctor = await call(apiBases.direct, `/api/queue/board?doctorId=2&workDate=${boardDate}`, tokens.lihui);
  const patientAdminRoles = await call(apiBases.direct, '/api/admin/roles', tokens.pt0001);
  const nursePrice = await call(apiBases.direct, '/api/bills/price', tokens.nurse01, 'POST', { visitId: 1 });
  const cashierReport = await call(apiBases.direct, '/api/queue/report', tokens.cashier01, 'POST', { regId: 1 });
  const firstBoardRegId = (Array.isArray(boardOther.data) ? boardOther.data[0]?.regId : null) || 1;
  const otherDoctorArrive = await call(apiBases.direct, '/api/queue/arrive', tokens.lihui, 'POST', {
    regId: firstBoardRegId
  });
  const doctorWorkload = await call(apiBases.direct,
    `/api/stats/workload?start=${start}&end=${end}`, tokens.zhangming);
  const otherDoctorWorkload = await call(apiBases.direct,
    `/api/stats/workload?start=${start}&end=${end}`, tokens.lihui);
  out.checks.security = {
    otherPatientBillDetail: {
      httpStatus: bill1.httpStatus, code: bill1.code,
      patientId: bill1.data?.patientId, patientName: bill1.data?.patientName
    },
    otherPatientVisitDetail: { httpStatus: visit1.httpStatus, code: visit1.code, message: visit1.message },
    otherPatientPrescriptions: { httpStatus: prescriptions1.httpStatus, code: prescriptions1.code, message: prescriptions1.message },
    otherPatientQueueBoard: {
      httpStatus: boardOther.httpStatus, code: boardOther.code,
      rowCount: Array.isArray(boardOther.data) ? boardOther.data.length : null,
      rows: Array.isArray(boardOther.data) ? boardOther.data.map(item => ({
        patientId: item.patientId,
        patientNo: item.patientNo,
        patientName: item.patientName,
        status: item.status
      })) : null
    },
    adminBillDetail: { httpStatus: adminBill1.httpStatus, code: adminBill1.code, patientId: adminBill1.data?.patientId },
    patientBoardNoQueueDate: boardNoQueue,
    patientWithoutRegistrationBoard: boardPatientWithoutRegistration,
    otherDoctorBoard: boardOtherDoctor,
    ownDoctorBoard: { httpStatus: boardOwnDoctor.httpStatus, code: boardOwnDoctor.code, rows: Array.isArray(boardOwnDoctor.data) ? boardOwnDoctor.data.length : null },
    patientAdminRoles,
    nurseBillsPrice: nursePrice,
    cashierQueueReport: cashierReport,
    otherDoctorArrive,
    doctorWorkload: {
      httpStatus: doctorWorkload.httpStatus,
      code: doctorWorkload.code,
      doctorIds: Array.isArray(doctorWorkload.data) ? doctorWorkload.data.map(item => item.doctorId) : null
    },
    otherDoctorWorkload: {
      httpStatus: otherDoctorWorkload.httpStatus,
      code: otherDoctorWorkload.code,
      doctorIds: Array.isArray(otherDoctorWorkload.data) ? otherDoctorWorkload.data.map(item => item.doctorId) : null
    }
  };

  if (bill1.code !== 403) out.findings.push('P0：/api/bills/{billId} 未按患者归属拒绝');
  if (adminBill1.code !== 0) out.errors.push('管理员读取收费单详情失败');
  const patientBoardRows = Array.isArray(boardOther.data) ? boardOther.data : [];
  const leakedBoardRows = patientBoardRows.filter(item => item.patientId && Number(item.patientId) !== 2);
  if (boardOther.code !== 0 || leakedBoardRows.length) {
    out.findings.push('P1：患者队列看板未按本人归属脱敏');
  }
  if (visit1.code !== 403 || prescriptions1.code !== 403) {
    out.findings.push('P0：就诊/处方的患者越权读取未按预期拒绝');
  }
  if (patientAdminRoles.code !== 403 || nursePrice.code !== 403 || cashierReport.code !== 403) {
    out.findings.push('P1：部分跨角色写端点未按预期返回 403');
  }
  if (boardNoQueue.code !== 403 || boardPatientWithoutRegistration.code !== 403) {
    out.findings.push('P1：患者可查看与本人当日挂号无关的队列');
  }
  if (boardOtherDoctor.code !== 403 || boardOwnDoctor.code !== 0) {
    out.findings.push('P1：医生队列看板未按医生归属限制');
  }
  if (otherDoctorArrive.code !== 403) {
    out.findings.push('P1：医生可确认其他医生队列的到诊');
  }
  const workloadRows = Array.isArray(doctorWorkload.data) ? doctorWorkload.data : [];
  const otherWorkloadRows = Array.isArray(otherDoctorWorkload.data) ? otherDoctorWorkload.data : [];
  if (doctorWorkload.code !== 0 || workloadRows.some(item => Number(item.doctorId) !== 1)
      || otherDoctorWorkload.code !== 0 || otherWorkloadRows.some(item => Number(item.doctorId) === 1)) {
    out.findings.push('P1：医生工作量统计未按医生归属过滤');
  }

  out.checks.demoData = {
    activeCalling: Number(rows("SELECT COUNT(*) FROM registration WHERE status='CALLING'")[0]?.[0] || 0),
    boardDate,
    bill1PatientId: Number(rows('SELECT patient_id FROM fee_bill WHERE bill_id=1')[0]?.[0] || 0),
    visit1PatientId: Number(rows('SELECT patient_id FROM visit WHERE visit_id=1')[0]?.[0] || 0)
  };
  out.passed = out.errors.length === 0 && out.findings.length === 0;
} catch (error) {
  out.fatal = String(error.stack || error);
  out.passed = false;
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(reportFile, JSON.stringify(out, null, 2));
if (!out.passed) process.exitCode = 1;
console.log(JSON.stringify(out, null, 2));
