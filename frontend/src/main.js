import { apiUrl, wsUrl } from './config.js';

const STORAGE_KEY = 'outpatient.session.v1';

const DEFAULT_ROLE_META = {
  PATIENT: { label: '患者', sub: '预约 / 取消', icon: '患', user: 'pt0001', blurb: '查排班、挂号、取消与查看就诊账单' },
  NURSE: { label: '护士', sub: '分诊 / 叫号', icon: '护', user: 'nurse01', blurb: '报到、叫号看板与到诊应答' },
  DOCTOR: { label: '医生', sub: '接诊 / 开单', icon: '医', user: 'zhangming', blurb: '接诊、病历、处方与检查单' },
  CASHIER: { label: '收费员', sub: '划价 / 退号', icon: '收', user: 'cashier01', blurb: '划价、收费、挂号退号与退费' },
  PHARMACIST: { label: '药房', sub: '审核 / 发药', icon: '药', user: 'pharma01', blurb: '处方审核、双签、发药与库存' },
  ADMIN: { label: '管理员', sub: '统计 / 审计', icon: '管', user: 'admin01', blurb: '工作量、收入、过号扫描与日志' }
};

let ROLE_META = { ...DEFAULT_ROLE_META };

const STATUS_MAPS = {
  registration: {
    REGISTERED: ['已挂号', 'info'], TRIAGED: ['已报到', 'success'], CALLING: ['叫号中', 'warning'],
    VISITED: ['已就诊', 'success'], MISSED: ['已过号', 'danger'], CANCELLED: ['已取消', 'muted'],
    REFUNDED: ['已退号', 'muted']
  },
  visit: { IN_TREATMENT: ['接诊中', 'warning'], COMPLETED: ['已完成', 'success'] },
  bill: { UNPAID: ['待收费', 'warning'], PAID: ['已收费', 'success'], RETRY: ['待重试', 'danger'], REFUNDED: ['已退费', 'muted'] },
  prescription: {
    PENDING_FEE: ['待收费', 'warning'], PAID: ['待审核', 'info'], APPROVED: ['待发药', 'success'],
    DISPENSED: ['已发药', 'success'], RETURNED: ['已退药', 'muted'], CANCELLED: ['已作废', 'muted']
  },
  checkup: { PENDING_FEE: ['待缴费', 'warning'], PAID: ['已缴费', 'success'], DONE: ['已完成', 'success'] },
  settlement: { SUCCESS: ['结算成功', 'success'], FAILED: ['结算失败', 'danger'] },
  schedule: {
    OPEN: ['开放', 'success'], FULL: ['已挂满', 'warning'],
    EXPIRED: ['已过期', 'muted'], CLOSED: ['已停诊', 'muted']
  },
  user: { 'true': ['启用', 'success'], 'false': ['禁用', 'muted'] },
  payType: { SELF: '自费', INSURANCE: '医保' },
  channel: { ONLINE: '线上', KIOSK: '自助机' }
};

const NAV = {
  PATIENT: [
    { id: 'sec-overview', label: '总览', sub: '今日就诊状态', icon: '览' },
    { id: 'sec-schedules', label: '预约挂号', sub: '排班与号源', icon: '号' },
    { id: 'sec-registrations', label: '我的挂号', sub: '号序与状态', icon: '单' },
    { id: 'sec-visits', label: '就诊记录', sub: '病历与诊断', icon: '历' },
    { id: 'sec-bills', label: '我的账单', sub: '费用明细', icon: '费' }
  ],
  NURSE: [
    { id: 'sec-overview', label: '分诊总览', sub: '队列关键指标', icon: '览' },
    { id: 'sec-queue', label: '叫号看板', sub: '实时 / 轮询降级', icon: '叫' },
    { id: 'sec-report', label: '分诊报到', sub: '登记与应答', icon: '到' },
    { id: 'sec-registrations', label: '挂号列表', sub: '按状态处理', icon: '单' }
  ],
  DOCTOR: [
    { id: 'sec-overview', label: '接诊总览', sub: '队列与工作量', icon: '览' },
    { id: 'sec-queue', label: '候诊队列', sub: '叫号与接诊', icon: '队' },
    { id: 'sec-visit', label: '电子病历', sub: '主诉 / 诊断 / 医嘱', icon: '历' },
    { id: 'sec-prescription', label: '开具处方', sub: '药品明细与快照', icon: '方' },
    { id: 'sec-checkups', label: '开具检查', sub: '项目字典', icon: '检' },
    { id: 'sec-visits', label: '我的接诊', sub: '历史与结束就诊', icon: '诊' }
  ],
  CASHIER: [
    { id: 'sec-overview', label: '收费总览', sub: '待办与收入', icon: '览' },
    { id: 'sec-price', label: '自动划价', sub: '按就诊生成收费单', icon: '价' },
    { id: 'sec-bills', label: '收费与退费', sub: '自费 / 医保 / 重试', icon: '费' },
    { id: 'sec-revenue', label: '收入口径', sub: '已收金额统计', icon: '计' }
  ],
  PHARMACIST: [
    { id: 'sec-overview', label: '药房总览', sub: '审核与库存预警', icon: '览' },
    { id: 'sec-prescriptions', label: '处方处理', sub: '审核 / 双签 / 发药', icon: '方' },
    { id: 'sec-inventory', label: '库存查询', sub: '低限 / 高限 / 近效期', icon: '库' }
  ],
  ADMIN: [
    { id: 'sec-overview', label: '运营总览', sub: '工作量与收入', icon: '览' },
    { id: 'sec-admin-access', label: '账号与角色', sub: '目录 / 口令 / 启用', icon: '权' },
    { id: 'sec-admin-schedules', label: '排班维护', sub: '号源 / 停诊', icon: '班' },
    { id: 'sec-stats', label: '统计报表', sub: '医生工作量分布', icon: '计' },
    { id: 'sec-queue', label: '过号扫描', sub: '手动触发与规则', icon: '队' },
    { id: 'sec-audit', label: '审计日志', sub: '关键操作留痕', icon: '志' }
  ]
};

const state = {
  loginRole: 'PATIENT',
  loginTouched: false,
  session: null,
  rolesLoaded: false,
  renderToken: 0,
  live: { client: null, pollTimer: null },
  patient: { schedules: [], registrations: [], visits: [], bills: [], board: [], filters: { workDate: '', deptId: '', doctorId: '' } },
  nurse: { schedules: [], registrations: [], board: [], doctorId: null, workDate: '' },
  doctor: { board: [], registrations: [], visits: [], medicines: [], catalog: [], prescriptions: [], visitId: null, workDate: '' },
  cashier: { visits: [], bills: [], registrations: [], selectedBillId: null, revenue: null },
  pharmacist: { prescriptions: [], medicines: [], keyword: '' },
  admin: {
    workload: [], revenue: null, logs: [], registrations: [], start: '', end: '',
    roles: [], users: [], schedules: [], doctors: [], departments: [],
    edits: { roleCode: null, userId: null, scheduleId: null }
  }
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

class ApiError extends Error {
  constructor(code, message, data) {
    super(message || '请求失败');
    this.code = code;
    this.data = data;
  }
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}

function pad(value) { return String(value).padStart(2, '0'); }

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function futureDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function localDateTime(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function apiDateTime(value, fallback) {
  if (!value) return fallback;
  return value.length === 16 ? `${value}:00` : value;
}

function dateTime(value) {
  if (!value) return '—';
  if (Array.isArray(value)) {
    const [y, m, d, h = 0, min = 0, s = 0] = value;
    return `${y}-${pad(m)}-${pad(d)} ${pad(h)}:${pad(min)}:${pad(s)}`;
  }
  if (value instanceof Date) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
  }
  return String(value).replace('T', ' ').slice(0, 19).replace(
    /^(\d{4})\/(\d{1,2})\/(\d{1,2})/,
    (_, y, m, d) => `${y}-${pad(m)}-${pad(d)}`
  );
}

function dateOnly(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function money(value) {
  const number = Number(value ?? 0);
  return `${(Number.isFinite(number) ? number : 0).toFixed(2)} 元`;
}

function qs(params) {
  return Object.entries(params)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

function statusBadge(type, value) {
  const entry = STATUS_MAPS[type]?.[value];
  if (!entry) return `<span class="status status-neutral">${esc(value || '—')}</span>`;
  return `<span class="status status-${entry[1]}">${esc(entry[0])}</span>`;
}

function statusText(type, value) {
  return STATUS_MAPS[type]?.[value]?.[0] || value || '—';
}

function roleLabel(code) {
  return state.admin.roles.find(item => item.roleCode === code)?.roleName || code || '—';
}

/** 维护面板单独重绘，编辑回填时不会打断统计/审计的页面滚动位置。 */
function renderAdminMaintenance() {
  const { roles, users, schedules, doctors, departments, edits } = state.admin;
  const role = edits.roleCode ? roles.find(item => item.roleCode === edits.roleCode) : null;
  const user = edits.userId ? users.find(item => Number(item.userId) === Number(edits.userId)) : null;
  const schedule = edits.scheduleId
    ? schedules.find(item => Number(item.scheduleId) === Number(edits.scheduleId)) : null;
  const firstDoctor = doctors[0];
  const selectedDoctor = doctors.find(item => Number(item.doctorId) === Number(schedule?.doctorId))
    || firstDoctor || null;
  const selectedDeptId = schedule?.deptId || selectedDoctor?.deptId || departments[0]?.deptId || '';
  const roleOptions = roles.map(item => `<option value="${esc(item.roleCode)}" ${user?.roleCode === item.roleCode ? 'selected' : ''}>${esc(item.roleName)} · ${esc(item.roleCode)}</option>`).join('');
  const doctorOptions = doctors.map(item => `<option value="${item.doctorId}" data-dept-id="${item.deptId}" ${Number(item.doctorId) === Number(selectedDoctor?.doctorId) ? 'selected' : ''}>${esc(item.name)} · ${esc(item.deptName)}</option>`).join('');
  const departmentOptions = departments.map(item => `<option value="${item.deptId}" ${Number(item.deptId) === Number(selectedDeptId) ? 'selected' : ''}>${esc(item.deptName)}${item.location ? ` · ${esc(item.location)}` : ''}</option>`).join('');
  const rolesRows = roles.length ? roles.map(item => `<tr>
    <td><span class="primary">${esc(item.roleName)}</span><span class="sub">${esc(item.roleCode)}</span></td>
    <td>${esc(String(item.permissions || '').slice(0, 72))}${String(item.permissions || '').length > 72 ? '…' : ''}</td>
    <td><button type="button" class="btn btn-small btn-outline" data-action="admin-edit-role" data-role-code="${esc(item.roleCode)}">编辑</button></td>
  </tr>`).join('') : emptyRow(3, '暂无角色目录');
  const usersRows = users.length ? users.slice(0, 40).map(item => `<tr>
    <td><span class="primary">#${esc(item.userId)} · ${esc(item.realName)}</span><span class="sub">${esc(item.username)}</span></td>
    <td><span class="primary">${esc(roleLabel(item.roleCode))}</span><span class="sub">档案 ${esc(item.refId ?? '—')}</span></td>
    <td>${statusBadge('user', String(Boolean(item.enabled)))}</td>
    <td><div class="row-actions">
      <button type="button" class="btn btn-small btn-outline" data-action="admin-edit-user" data-user-id="${item.userId}">编辑</button>
      <button type="button" class="btn btn-small ${item.enabled ? 'btn-danger' : 'btn-primary'}" data-action="admin-toggle-user" data-user-id="${item.userId}" data-enabled="${item.enabled ? 'false' : 'true'}">${item.enabled ? '禁用' : '启用'}</button>
    </div></td>
  </tr>`).join('') : emptyRow(4, '暂无账号');
  const scheduleRows = schedules.length ? schedules.slice(0, 60).map(item => `<tr>
    <td><span class="primary">${esc(dateOnly(item.workDate))}</span><span class="sub">${esc(item.timeSlot)}</span></td>
    <td><span class="primary">${esc(item.doctorName)}</span><span class="sub">${esc(item.deptName)}</span></td>
    <td>${item.remainingQty}<span class="sub">/ ${item.totalQty}</span></td>
    <td class="money">${esc(money(item.registrationFee))}</td>
    <td>${statusBadge('schedule', item.status)}</td>
    <td><div class="row-actions">
      <button type="button" class="btn btn-small btn-outline" data-action="admin-edit-schedule" data-schedule-id="${item.scheduleId}" ${item.status === 'CLOSED' ? 'disabled' : ''}>编辑</button>
      <button type="button" class="btn btn-small btn-danger" data-action="admin-close-schedule" data-schedule-id="${item.scheduleId}" ${item.status === 'CLOSED' ? 'disabled' : ''}>停诊</button>
    </div></td>
  </tr>`).join('') : emptyRow(6, '暂无排班');

  return `
    <section class="panel" id="sec-admin-access" style="margin-top:1rem"><div class="panel-head"><div><h3>角色与登录账号维护</h3><p>编码、档案关联与口令散列由服务端校验，账号不提供物理删除</p></div>
      <button type="button" class="btn btn-small btn-outline" data-action="admin-clear-edits">清空编辑</button></div>
      <div class="panel-body">
        <div class="layout-even">
          <form id="admin-role-form" class="form-grid">
            <input type="hidden" name="editRoleCode" value="${esc(edits.roleCode || '')}">
            <div><label for="admin-role-code">角色编码</label><input id="admin-role-code" name="roleCode" maxlength="20" required value="${esc(role?.roleCode || '')}" ${role ? 'readonly' : ''} placeholder="如 AUDITOR"></div>
            <div><label for="admin-role-name">角色名称</label><input id="admin-role-name" name="roleName" maxlength="30" required value="${esc(role?.roleName || '')}"></div>
            <div class="full"><label for="admin-role-permissions">权限清单</label><textarea id="admin-role-permissions" name="permissions" maxlength="500" required placeholder="逗号分隔，如 log:query">${esc(role?.permissions || '')}</textarea></div>
            <div class="full form-actions"><button type="submit" class="btn btn-primary">${role ? '保存角色' : '新建角色'}</button></div>
          </form>
          <form id="admin-user-form" class="form-grid">
            <input type="hidden" name="editUserId" value="${esc(edits.userId || '')}">
            <div><label for="admin-user-username">登录账号</label><input id="admin-user-username" name="username" maxlength="50" required value="${esc(user?.username || '')}" ${user ? 'readonly' : ''}></div>
            <div><label for="admin-user-real-name">姓名</label><input id="admin-user-real-name" name="realName" maxlength="50" required value="${esc(user?.realName || '')}"></div>
            <div><label for="admin-user-role">角色</label><select id="admin-user-role" name="roleCode" required>${roleOptions || '<option value="">暂无角色</option>'}</select></div>
            <div><label for="admin-user-ref">业务档案编号</label><input id="admin-user-ref" name="refId" type="number" min="1" value="${esc(user?.refId ?? '')}" placeholder="患者/医生必填"></div>
            <div><label for="admin-user-enabled">账号状态</label><select id="admin-user-enabled" name="enabled"><option value="true" ${!user || user.enabled ? 'selected' : ''}>启用</option><option value="false" ${user && !user.enabled ? 'selected' : ''}>禁用</option></select></div>
            <div><label for="admin-user-password">${user ? '重置口令（留空不改）' : '初始口令'}</label><input id="admin-user-password" name="password" type="password" autocomplete="new-password" minlength="6" ${user ? '' : 'required'} placeholder="至少 6 位"></div>
            <div class="full form-actions"><button type="submit" class="btn btn-accent">${user ? '保存账号' : '新建账号'}</button></div>
          </form>
        </div>
        <div class="table-wrap" style="margin-top:1rem"><table><thead><tr><th>角色</th><th>权限清单</th><th>操作</th></tr></thead><tbody>${rolesRows}</tbody></table></div>
        <div class="table-wrap" style="margin-top:1rem"><table><thead><tr><th>登录账号</th><th>角色 / 档案</th><th>状态</th><th>操作</th></tr></thead><tbody>${usersRows}</tbody></table></div>
      </div></section>
    <section class="panel" id="sec-admin-schedules" style="margin-top:1rem"><div class="panel-head"><div><h3>排班维护</h3><p>已有挂号占用时不能更换医生、科室、日期或时段；停诊保留历史挂号</p></div><span class="tag tag-teal">${schedules.length} 条排班</span></div>
      <div class="panel-body">
        <form id="admin-schedule-form" class="form-grid">
          <input type="hidden" name="editScheduleId" value="${esc(edits.scheduleId || '')}">
          <div><label for="admin-schedule-doctor">出诊医生</label><select id="admin-schedule-doctor" name="doctorId" required>${doctorOptions || '<option value="">暂无医生</option>'}</select></div>
          <div><label for="admin-schedule-dept">出诊科室</label><select id="admin-schedule-dept" name="deptId" required>${departmentOptions || '<option value="">暂无科室</option>'}</select></div>
          <div><label for="admin-schedule-date">出诊日期</label><input id="admin-schedule-date" name="workDate" type="date" min="${today()}" required value="${esc(schedule ? dateOnly(schedule.workDate) : futureDate(2))}"></div>
          <div><label for="admin-schedule-slot">出诊时段</label><input id="admin-schedule-slot" name="timeSlot" maxlength="30" required value="${esc(schedule?.timeSlot || '晚间 18:00-20:00')}"></div>
          <div><label for="admin-schedule-qty">号源总量</label><input id="admin-schedule-qty" name="totalQty" type="number" min="1" step="1" required value="${esc(schedule?.totalQty || 10)}"></div>
          <div><label for="admin-schedule-fee">挂号费</label><input id="admin-schedule-fee" name="registrationFee" type="number" min="0" step="0.01" required value="${esc(schedule ? Number(schedule.registrationFee).toFixed(2) : '20.00')}"></div>
          <div class="full form-actions"><button type="submit" class="btn btn-primary">${schedule ? '保存排班' : '新建排班'}</button><span class="muted" style="font-size:.75rem;align-self:center">调整总量时服务端按已占用数同步修正余量</span></div>
        </form>
        <div class="table-wrap" style="margin-top:1rem"><table><thead><tr><th>日期 / 时段</th><th>医生 / 科室</th><th>余量 / 总量</th><th>挂号费</th><th>状态</th><th>操作</th></tr></thead><tbody>${scheduleRows}</tbody></table></div>
      </div></section>`;
}

function refreshAdminForms() {
  const host = $('#admin-maintenance');
  if (host) host.innerHTML = renderAdminMaintenance();
}

function setConnection(text, offline = false) {
  const pill = $('#connection-pill');
  if (!pill) return;
  pill.className = `connection-pill${offline ? ' offline' : ''}`;
  pill.innerHTML = `<i></i>${esc(text)}`;
}

let toastTimer = null;
function toast(message, type = 'info') {
  const box = $('#toast');
  if (!box) return;
  box.textContent = message;
  box.className = `toast ${type}`;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, 3800);
}

async function api(path, options = {}) {
  const { method = 'GET', body, skipAuth = false } = options;
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (!skipAuth && state.session?.token) headers.Authorization = `Bearer ${state.session.token}`;

  let response;
  try {
    response = await fetch(apiUrl(path), {
      method,
      headers,
      body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
    });
  } catch (error) {
    setConnection('服务端未连接', true);
    throw new Error('无法连接服务端，请确认 Spring Boot 应用已启动');
  }

  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload.code !== 'number') {
    throw new Error(`服务端返回异常（HTTP ${response.status}）`);
  }
  if (payload.code === 401 && !skipAuth) {
    handleUnauthorized(payload.message || '登录状态已失效，请重新登录');
    throw new ApiError(401, payload.message, payload.data);
  }
  if (payload.code !== 0) {
    throw new ApiError(payload.code, payload.message || '操作未成功', payload.data);
  }
  setConnection('本地服务正常');
  return payload.data;
}

async function safeApi(path, fallback, options = {}) {
  try {
    return await api(path, options);
  } catch (error) {
    if (error instanceof ApiError && error.code === 401) throw error;
    console.warn('可选请求失败', path, error);
    return fallback;
  }
}

function isAuthError(error) {
  return error instanceof ApiError && error.code === 401;
}

function readSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved?.token || !saved?.role) return null;
    saved.refId = saved.refId === null || saved.refId === '' || saved.refId === undefined
      ? null : Number(saved.refId);
    return saved;
  } catch (error) {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function normalizeSession(data) {
  return {
    token: data.token,
    userId: data.userId,
    username: data.username,
    realName: data.realName,
    role: data.role,
    refId: data.refId === null || data.refId === '' || data.refId === undefined ? null : Number(data.refId),
    permissions: Array.isArray(data.permissions) ? data.permissions : []
  };
}

function renderRolePicker() {
  const host = $('#role-picker');
  host.innerHTML = Object.entries(ROLE_META).map(([key, meta]) => `
    <button type="button" class="role-option${key === state.loginRole ? ' active' : ''}"
            data-action="select-role" data-role="${key}" role="radio" aria-checked="${key === state.loginRole}">
      <span class="role-icon" aria-hidden="true">${meta.icon}</span>
      <strong>${meta.label}</strong>
      <small>${esc(meta.sub)}</small>
    </button>
  `).join('');
  selectRole(state.loginRole, false);
  applyRolePreset(state.loginRole);
}

// 身份卡片默认填充演示账号；用户一旦手动编辑，服务端角色目录回包不再覆盖输入。
function applyRolePreset(role) {
  const meta = ROLE_META[role];
  const username = $('#login-username');
  if (!meta || !username || state.loginTouched) return;
  username.value = meta.user;
  $('#login-password').value = '123456';
  $('#demo-note').innerHTML = `${esc(meta.blurb)}。演示账号 <code>${esc(meta.user)}</code>，密码 <strong>123456</strong>。`;
}

async function renderRoleMetaFromServer() {
  if (state.rolesLoaded) return;
  try {
    const roles = await api('/api/auth/roles', { skipAuth: true });
    syncRoleMeta(roles);
    state.rolesLoaded = true;
    const loginView = $('#login-view');
    if (loginView && !loginView.hidden) renderRolePicker();
  } catch (error) {
    console.warn('角色目录读取失败，使用本地默认目录', error);
  }
}

function syncRoleMeta(roleViews) {
  if (!Array.isArray(roleViews) || !roleViews.length) return;
  roleViews.forEach(view => {
    const base = DEFAULT_ROLE_META[view.role];
    if (!base || !view.demoUsername) return;
    ROLE_META[view.role] = {
      ...base,
      label: view.label || base.label,
      user: view.demoUsername
    };
  });
}

function selectRole(role, updateInput = true) {
  if (!ROLE_META[role]) return;
  state.loginRole = role;
  $$('.role-option').forEach(button => {
    const active = button.dataset.role === role;
    button.classList.toggle('active', active);
    button.setAttribute('aria-checked', String(active));
  });
  if (updateInput) {
    state.loginTouched = false;
    applyRolePreset(role);
    $('#login-message').textContent = '';
    $('#login-message').className = 'form-message';
  }
}

function showLogin(message = '', type = '') {
  state.renderToken += 1;
  state.loginTouched = false;
  clearLive({ silent: true });
  $('#app-view').hidden = true;
  $('#login-view').hidden = false;
  $('#workspace').innerHTML = '';
  renderRolePicker();
  renderRoleMetaFromServer();
  const box = $('#login-message');
  box.textContent = message;
  box.className = `form-message ${type}`;
  const boot = $('#boot-screen');
  if (boot) boot.remove();
}

function showApp() {
  const session = state.session;
  if (!session) return showLogin();
  $('#login-view').hidden = true;
  $('#app-view').hidden = false;
  const meta = ROLE_META[session.role] || { label: session.role, sub: '系统用户', icon: '·' };
  $('#session-role').textContent = meta.label;
  $('#session-name').textContent = `${session.realName || session.username} · ${session.username}`;
  renderNav();
  updateClock();
  // 首屏数据就绪、失败或会话失效时都可靠移除启动遮罩，不依赖固定动画时长。
  loadWorkspace().finally(() => $('#boot-screen')?.remove());
}

function renderNav() {
  const items = NAV[state.session.role] || [];
  $('#workspace-nav').innerHTML = items.map((item, index) => `
    <button type="button" class="nav-item${index === 0 ? ' active' : ''}" data-action="nav" data-target="${item.id}">
      <span class="nav-icon" aria-hidden="true">${item.icon}</span>
      <span><strong>${item.label}</strong><small>${esc(item.sub)}</small></span>
    </button>
  `).join('') + `<div class="nav-foot">统一响应按 <code>code</code> 判定<br>业务接口均携带 Bearer JWT</div>`;
}

function updateClock() {
  const clock = $('#clock');
  if (clock) clock.textContent = dateTime(new Date()).slice(0, 19);
}

function logout(message = '') {
  localStorage.removeItem(STORAGE_KEY);
  state.session = null;
  showLogin(message, message ? 'ok' : '');
}

function handleUnauthorized(message) {
  state.renderToken += 1;
  localStorage.removeItem(STORAGE_KEY);
  state.session = null;
  showLogin(message, 'error');
}

function pageHead(title, subtitle, tag, refresh = true) {
  return `
    <div class="page-head" id="sec-overview">
      <div>
        <p class="eyebrow">${esc(tag || 'WORKSPACE')}</p>
        <h2>${esc(title)}</h2>
        <p>${esc(subtitle)}</p>
      </div>
      <div class="page-actions">
        <span class="tag tag-teal">${esc(dateTime(new Date()).slice(0, 16))}</span>
        ${refresh ? '<button type="button" class="btn btn-outline" data-action="refresh">刷新数据</button>' : ''}
      </div>
    </div>
  `;
}

function statCard(label, value, note, extraClass = '', id = '') {
  return `<article class="stat-card ${extraClass}"><span class="stat-label">${esc(label)}</span>
    <span class="stat-value" ${id ? `id="${id}"` : ''}>${esc(value)}</span>
    <span class="stat-note">${esc(note)}</span></article>`;
}

function loadingHtml() {
  return `<div class="panel"><div class="loading-state">正在读取服务端业务状态…</div></div>`;
}

function errorHtml(message) {
  return `<div class="notice danger"><strong>工作台加载未完成：</strong>${esc(message)}。请确认数据库与 Spring Boot 服务正常，或点击「刷新数据」重试。</div>`;
}

function emptyRow(colspan, text) {
  return `<tr><td colspan="${colspan}"><div class="empty-state"><span class="empty-mark">∅</span>${esc(text)}</div></td></tr>`;
}

function uniqueDoctors(schedules) {
  const map = new Map();
  (schedules || []).forEach(item => {
    if (item.doctorId && !map.has(Number(item.doctorId))) {
      map.set(Number(item.doctorId), {
        doctorId: Number(item.doctorId),
        doctorName: item.doctorName,
        deptName: item.deptName,
        workDate: dateOnly(item.workDate)
      });
    }
  });
  return Array.from(map.values());
}

function uniqueDepartments(schedules) {
  const map = new Map();
  (schedules || []).forEach(item => {
    if (item.deptId && !map.has(Number(item.deptId))) {
      map.set(Number(item.deptId), { deptId: Number(item.deptId), deptName: item.deptName });
    }
  });
  return Array.from(map.values());
}

function renderQueueBoardHtml(rows) {
  const queue = Array.isArray(rows) ? rows : [];
  const calling = queue.find(item => item.status === 'CALLING') || null;
  const waiting = queue.filter(item => item.status === 'TRIAGED').length;
  const missed = queue.reduce((sum, item) => sum + Number(item.missCount || 0), 0);
  const role = state.session?.role;
  const rowsHtml = queue.length ? queue.map((item, index) => {
    const actions = [];
    if (role === 'NURSE') {
      if (item.status === 'REGISTERED') actions.push(`<button type="button" class="btn btn-small btn-outline" data-action="nurse-report" data-reg-id="${item.regId}">报到</button>`);
      if (item.status === 'CALLING' && !item.arrivedAt) actions.push(`<button type="button" class="btn btn-small btn-accent" data-action="nurse-arrive" data-reg-id="${item.regId}">确认到诊</button>`);
    }
    if (role === 'DOCTOR') {
      if (item.status === 'CALLING' && !item.arrivedAt) actions.push(`<button type="button" class="btn btn-small btn-accent" data-action="doctor-arrive" data-reg-id="${item.regId}">确认到诊</button>`);
      if (item.status === 'CALLING' && item.arrivedAt) actions.push(`<button type="button" class="btn btn-small btn-primary" data-action="doctor-start-visit" data-reg-id="${item.regId}">开始接诊</button>`);
    }
    return `
      <div class="queue-row${item.status === 'CALLING' ? ' calling' : ''}${Number(item.missCount) > 0 ? ' missed' : ''}" style="animation-delay:${Math.min(index * 35, 280)}ms">
        <div class="queue-seq">${esc(item.queueNo ?? '—')}</div>
        <div class="queue-main">
          <strong>${esc(item.patientName)} <span class="muted" style="font-weight:400">· ${esc(item.patientNo)}</span></strong>
          <small>顺位 ${esc(item.callOrder ?? '—')} · 状态 ${esc(statusText('registration', item.status))}${item.arrivedAt ? ' · 已到诊' : ''}${Number(item.missCount) > 0 ? ` · 过号 ${esc(item.missCount)} 次` : ''}</small>
        </div>
        <div class="queue-side">${statusBadge('registration', item.status)}${actions.length ? `<div class="row-actions">${actions.join('')}</div>` : ''}</div>
      </div>`;
  }).join('') : `<div class="empty-state"><span class="empty-mark">∅</span>当前医生与日期下暂无候诊患者</div>`;

  return `
    <section class="panel" id="sec-queue">
      <div class="panel-head"><div><h3>叫号看板</h3><p>当前号由服务端队列决定；断线自动回退全量轮询</p></div>
        <span class="tag tag-teal">候诊 ${waiting} · 累计过号 ${missed}</span></div>
      <div class="panel-body">
        <div class="queue-board">
          <div class="current-call">
            <span class="call-pulse" aria-hidden="true"></span>
            <span class="call-label">CURRENT CALL / 当前叫号</span>
            <span class="call-number">${calling ? esc(calling.queueNo) : '—'}</span>
            <span class="call-patient">${calling ? esc(calling.patientName) : '暂无叫号'}</span>
            <span class="call-meta">${calling ? `${esc(calling.patientNo)} · ${esc(statusText('registration', calling.status))}${calling.arrivedAt ? ' · 已到诊' : ''}` : '请选择医生与出诊日期'}</span>
          </div>
          <div class="queue-list">${rowsHtml}</div>
        </div>
      </div>
    </section>`;
}

function refreshQueueLive(rows) {
  const host = $('#queue-board-host');
  if (host) host.innerHTML = renderQueueBoardHtml(rows);
  const queue = Array.isArray(rows) ? rows : [];
  const waiting = $('#queue-stat-waiting');
  const current = $('#queue-stat-current');
  const missed = $('#queue-stat-missed');
  const calling = queue.find(item => item.status === 'CALLING');
  if (waiting) waiting.textContent = String(queue.filter(item => item.status === 'TRIAGED').length);
  if (current) current.textContent = calling ? String(calling.queueNo) : '—';
  if (missed) missed.textContent = String(queue.reduce((sum, item) => sum + Number(item.missCount || 0), 0));
}

function renderPatientBoardHtml(board, registrations) {
  const queue = Array.isArray(board) ? board : [];
  const calling = queue.find(item => item.status === 'CALLING');
  const mine = (registrations || []).find(item => ['REGISTERED', 'TRIAGED', 'CALLING', 'VISITED'].includes(item.status));
  const mineRow = mine ? queue.find(item => Number(item.regId) === Number(mine.regId)) : null;
  const position = mineRow ? queue.findIndex(item => Number(item.regId) === Number(mine.regId)) + 1 : null;
  return `
    <div class="detail-list">
      <div class="detail-item approved">
        <div class="detail-title"><span>当前叫号</span><strong>${calling ? `第 ${esc(calling.queueNo)} 号` : '暂无'}</strong></div>
        <div class="detail-meta"><span>${calling ? (calling.patientId ? esc(calling.patientName) : '其他患者（已脱敏）') : '等待医生叫号'}</span><span>${calling ? esc(statusText('registration', calling.status)) : '—'}</span></div>
      </div>
      <div class="detail-item${mine?.status === 'CALLING' ? ' retry' : ''}">
        <div class="detail-title"><span>我的号序</span><strong>${mine ? `第 ${esc(mine.queueNo)} 号` : '暂无待就诊挂号'}</strong></div>
        <div class="detail-meta"><span>${mine ? esc(mine.doctorName) : '可先在上方预约挂号'}</span><span>${mine ? statusText('registration', mine.status) : '—'}</span>${position ? `<span>队列第 ${position} 位</span>` : ''}</div>
      </div>
    </div>`;
}

function refreshPatientBoard(rows) {
  const host = $('#patient-queue-host');
  if (host) host.innerHTML = renderPatientBoardHtml(rows, state.patient.registrations);
  const stat = $('#patient-stat-called');
  const calling = (Array.isArray(rows) ? rows : []).find(item => item.status === 'CALLING');
  if (stat) stat.textContent = calling ? String(calling.queueNo) : '—';
}

function renderScheduleRows() {
  const tbody = $('#patient-schedule-body');
  if (!tbody) return;
  const filters = state.patient.filters;
  const schedules = state.patient.schedules.filter(item => {
    return (!filters.workDate || dateOnly(item.workDate) === filters.workDate)
      && (!filters.deptId || String(item.deptId) === String(filters.deptId))
      && (!filters.doctorId || String(item.doctorId) === String(filters.doctorId));
  });
  const counter = $('#patient-stat-schedules');
  if (counter) counter.textContent = String(schedules.filter(item => scheduleAvailability(item) === 'OPEN').length);
  if (!schedules.length) {
    tbody.innerHTML = emptyRow(7, '当前筛选条件下没有排班');
    return;
  }
  tbody.innerHTML = schedules.map(item => {
    const availability = scheduleAvailability(item);
    const disabled = availability !== 'OPEN' || !state.session?.refId;
    const label = availability === 'OPEN' ? '立即挂号' : STATUS_MAPS.schedule[availability][0];
    return `<tr>
      <td><span class="primary">${esc(dateOnly(item.workDate))}</span><span class="sub">${esc(item.timeSlot)}</span></td>
      <td><span class="primary">${esc(item.deptName)}</span><span class="sub">${esc(item.location || '')}</span></td>
      <td><span class="primary">${esc(item.doctorName)}</span><span class="sub">${esc(item.title || '')}</span></td>
      <td>${item.remainingQty}<span class="sub">/ ${item.totalQty}</span></td>
      <td class="money">${esc(money(item.registrationFee))}</td>
      <td>${statusBadge('schedule', availability)}</td>
      <td><button type="button" class="btn btn-small ${disabled ? 'btn-outline' : 'btn-primary'}" data-action="patient-book" data-schedule-id="${item.scheduleId}" ${disabled ? 'disabled' : ''}>${label}</button></td>
    </tr>`;
  }).join('');
}

function scheduleAvailability(item) {
  if (item.status !== 'OPEN') return 'CLOSED';
  if (dateOnly(item.workDate) < today()) return 'EXPIRED';
  if (item.full || Number(item.remainingQty) <= 0) return 'FULL';
  return 'OPEN';
}

function renderMedicineLine(index, medicines, selected = '') {
  const options = medicines.length ? medicines.map(item => `
    <option value="${item.medicineId}" ${String(item.medicineId) === String(selected) ? 'selected' : ''}>${esc(item.name)} · ${esc(money(item.price))} · 库存 ${esc(item.stockQty)}</option>
  `).join('') : '<option value="">暂无药品</option>';
  return `<div class="medicine-line" data-medicine-line="${index}">
    <span class="idx">${pad(index + 1)}</span>
    <select data-field="medicineId" aria-label="药品">${options}</select>
    <input data-field="quantity" type="number" min="1" step="1" value="1" aria-label="数量">
    <input data-field="usageText" type="text" placeholder="用法用量" aria-label="用法用量" style="grid-column:2 / 4">
    <button type="button" class="btn btn-small btn-danger btn-remove" data-action="doctor-remove-item" aria-label="删除本行">删除</button>
  </div>`;
}

function stockWarning(item) {
  if (Number(item.stockQty) <= Number(item.lowWarn)) return ['低于下限', 'tag-hot'];
  if (Number(item.stockQty) >= Number(item.highWarn)) return ['高于上限', 'tag'];
  if (item.expiryDate) {
    const expiry = new Date(`${dateOnly(item.expiryDate)}T00:00:00`);
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + 30);
    if (!Number.isNaN(expiry.getTime()) && expiry <= threshold) return ['近效期', 'tag-hot'];
  }
  return ['正常', 'tag-teal'];
}

function renderInvoice(bill) {
  if (!bill) return `<div class="empty-state"><span class="empty-mark">∅</span>请选择一张收费单</div>`;
  const lastSettlement = (bill.settlements || []).at(-1);
  const retry = bill.status === 'RETRY';
  const canPay = bill.status === 'UNPAID' || bill.status === 'RETRY';
  const items = (bill.items || []).map(item => `<div class="invoice-row"><span>${esc(item.itemName)} <span class="muted">#${esc(item.sourceId)}</span></span><span class="money">${esc(money(item.amount))}</span></div>`).join('') || '<div class="invoice-row"><span>暂无明细</span><span>—</span></div>';
  const settlements = (bill.settlements || []).length ? bill.settlements.map(item => `
    <div class="detail-meta"><span>第 ${esc(item.retryCount || 1)} 次 · ${esc(statusText('settlement', item.status))}</span><span>${esc(item.errorMsg || item.tradeNo || '—')}</span><span>${esc(dateTime(item.requestTime))}</span></div>
  `).join('') : '<div class="detail-meta"><span>暂无结算流水</span></div>';
  const itemCount = (bill.items || []).length;
  return `
    <div class="detail-title"><span>收费单 #${esc(bill.billId)} · ${esc(bill.patientName)}</span>${statusBadge('bill', bill.status)}</div>
    ${retry ? `<div class="notice danger" style="margin-top:.7rem"><strong>医保结算未成功，单据保持「待重试」。</strong>${esc(lastSettlement?.errorMsg || '请稍后重新结算')}；处方仍为待收费，不得显示为收费成功。</div>` : ''}
    <div class="invoice invoice-summary">
      <div class="invoice-row total"><span>应收合计</span><span class="money">${esc(money(bill.totalAmount))}</span></div>
      <div class="invoice-row"><span>实收 / 自付 / 统筹</span><span>${esc(money(bill.paidAmount))} / ${esc(money(bill.selfAmount))} / ${esc(money(bill.insuranceAmount))}</span></div>
    </div>
    <form id="cashier-pay-form" class="form-grid" style="margin-top:1rem">
      <input type="hidden" name="billId" value="${bill.billId}">
      <div><label for="cashier-pay-type">支付通道</label><select id="cashier-pay-type" name="payType">
        <option value="SELF" ${retry ? '' : 'selected'}>自费</option>
        <option value="INSURANCE" ${retry ? 'selected' : ''}>医保</option>
      </select></div>
      <div><label for="cashier-paid-amount">实收金额（自费必填）</label><input id="cashier-paid-amount" name="paidAmount" type="number" min="0" step="0.01" value="${Number(bill.totalAmount || 0).toFixed(2)}"></div>
      <div class="full form-actions">
        <button type="submit" class="btn btn-primary" ${canPay ? '' : 'disabled'}>${retry ? '重新结算' : '确认收款'}</button>
        <button type="button" class="btn btn-danger" data-action="cashier-refund" data-bill-id="${bill.billId}" ${bill.status === 'PAID' ? '' : 'disabled'}>办理退费</button>
      </div>
    </form>
    <details class="invoice-details">
      <summary>查看 ${itemCount} 条收费明细</summary>
      <div class="invoice">${items}</div>
    </details>
    <div class="detail-item ${retry ? 'retry' : 'approved'}" style="margin-top:.8rem">
      <div class="detail-title"><span>结算流水</span><span class="tag">${esc(bill.payType ? statusText('payType', bill.payType) : '未选择通道')}</span></div>
      ${settlements}
    </div>`;
}

function renderPrescriptionCards(list) {
  if (!list.length) return `<div class="empty-state"><span class="empty-mark">∅</span>当前没有待处理处方</div>`;
  return `<div class="detail-list">${list.map((item, index) => {
    const psycho = item.category === 'PSYCHO';
    const needsSecondSign = psycho && item.status === 'APPROVED' && !item.secondSigner;
    const actions = [];
    if (item.status === 'PAID') actions.push(`<button type="button" class="btn btn-small btn-primary" data-action="pharmacy-audit" data-prescription-id="${item.prescriptionId}">审核通过</button>`);
    if (needsSecondSign) actions.push(`<button type="button" class="btn btn-small btn-accent" data-action="pharmacy-second-sign" data-prescription-id="${item.prescriptionId}">第二签字</button>`);
    if (item.status === 'APPROVED') actions.push(`<button type="button" class="btn btn-small btn-outline" data-action="pharmacy-dispense" data-prescription-id="${item.prescriptionId}" ${needsSecondSign ? 'disabled' : ''}>配药发药</button>`);
    if (item.status === 'DISPENSED') actions.push(`<button type="button" class="btn btn-small btn-danger" data-action="pharmacy-return" data-prescription-id="${item.prescriptionId}">办理退药</button>`);
    const itemNames = (item.items || []).map(line => `${line.medicineName} × ${line.quantity}`).join('、') || '无明细';
    return `<div class="detail-item${needsSecondSign ? ' retry' : item.status === 'APPROVED' ? ' approved' : ''}" style="animation-delay:${Math.min(index * 35, 280)}ms">
      <div class="detail-title"><span>处方 #${esc(item.prescriptionId)} · ${esc(item.patientName)}</span>${statusBadge('prescription', item.status)}</div>
      <div class="detail-meta">
        <span class="money">${esc(money(item.totalAmount))}</span>
        <span>${esc(item.doctorName || '')}</span>
        <span>${psycho ? '<span class="tag tag-hot">精神类</span>' : '<span class="tag">普通处方</span>'}</span>
        <span>审核：${esc(item.auditPharmacist || '—')}</span>
        <span>第一签字：${esc(item.firstSigner || '—')}</span>
        <span>第二签字：${esc(item.secondSigner || '—')}</span>
      </div>
      <div class="detail-meta"><span>${esc(itemNames)}</span><span>${esc(dateTime(item.createTime))}</span></div>
      ${actions.length ? `<div class="detail-actions">${actions.join('')}</div>` : ''}
    </div>`;
  }).join('')}</div>`;
}

function clearLive({ silent = false } = {}) {
  if (state.live.client) {
    try { state.live.client.close(); } catch (error) { console.warn(error); }
  }
  if (state.live.pollTimer) clearInterval(state.live.pollTimer);
  state.live = { client: null, pollTimer: null };
  if (!silent && state.session) setConnection('本地服务正常');
}

class MiniStompClient {
  constructor({ url, token, destination, onMessage, onConnected, onDisconnected }) {
    Object.assign(this, { url, token, destination, onMessage, onConnected, onDisconnected });
    this.buffer = '';
    this.closed = false;
    this.disconnectedNotified = false;
    this.ws = null;
  }

  connect() {
    if (typeof WebSocket === 'undefined') return this.notifyDisconnected();
    try {
      this.ws = new WebSocket(this.url);
    } catch (error) {
      return this.notifyDisconnected();
    }
    this.ws.onopen = () => this.sendFrame('CONNECT', {
      'accept-version': '1.2', host: location.host, heartbeat: '10000,10000', token: this.token
    });
    this.ws.onmessage = event => {
      if (event.data instanceof Blob) event.data.text().then(text => this.receive(text));
      else this.receive(String(event.data));
    };
    this.ws.onerror = () => this.notifyDisconnected();
    this.ws.onclose = () => this.notifyDisconnected();
  }

  receive(chunk) {
    this.buffer += chunk;
    let index = this.buffer.indexOf('\0');
    while (index >= 0) {
      const frame = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + 1);
      this.handleFrame(frame.replace(/\r\n/g, '\n'));
      index = this.buffer.indexOf('\0');
    }
  }

  handleFrame(frame) {
    if (!frame.trim()) return;
    const split = frame.indexOf('\n\n');
    if (split < 0) return;
    const lines = frame.slice(0, split).split('\n');
    const command = lines.shift();
    const headers = {};
    lines.forEach(line => {
      const colon = line.indexOf(':');
      if (colon > 0) headers[line.slice(0, colon)] = line.slice(colon + 1);
    });
    const body = frame.slice(split + 2);
    if (command === 'CONNECTED') {
      this.sendFrame('SUBSCRIBE', { id: 'queue-board', destination: this.destination, ack: 'auto' });
      this.onConnected?.();
    } else if (command === 'MESSAGE') {
      try {
        const payload = JSON.parse(body);
        this.onMessage?.(Array.isArray(payload) ? payload : payload.data);
      } catch (error) {
        console.warn('无法解析队列事件', error);
      }
    } else if (command === 'ERROR') {
      this.notifyDisconnected();
      this.close();
    }
  }

  sendFrame(command, headers = {}, body = '') {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    let frame = `${command}\n`;
    Object.entries(headers).forEach(([key, value]) => { frame += `${key}:${value}\n`; });
    frame += `\n${body}\0`;
    this.ws.send(frame);
  }

  notifyDisconnected() {
    if (this.closed || this.disconnectedNotified) return;
    this.disconnectedNotified = true;
    this.onDisconnected?.();
  }

  close() {
    this.closed = true;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try { this.sendFrame('DISCONNECT', { receipt: 'bye' }); } catch (error) { console.warn(error); }
      this.ws.close();
    } else if (this.ws) {
      this.ws.close();
    }
  }
}

function startQueueLive(doctorId, workDate, onUpdate, loadToken) {
  if (!doctorId || !workDate || !state.session?.token) return;
  clearLive({ silent: true });
  const path = `/api/queue/board?${qs({ doctorId, workDate })}`;
  const destination = state.session.role === 'PATIENT'
    ? `/topic/queue/${doctorId}/${dateOnly(workDate)}/masked/${state.session.refId}`
    : `/topic/queue/${doctorId}/${dateOnly(workDate)}`;
  const poll = async () => {
    if (loadToken !== state.renderToken) return;
    try {
      const rows = await api(path);
      if (loadToken === state.renderToken) onUpdate(rows);
    } catch (error) {
      if (!isAuthError(error)) setConnection('轮询降级中', true);
    }
  };
  const ensurePolling = () => {
    if (!state.live.pollTimer && loadToken === state.renderToken) {
      state.live.pollTimer = setInterval(poll, 15000);
    }
  };
  ensurePolling();
  if ('WebSocket' in window) {
    const jwt = state.session.token;
    const url = wsUrl(jwt);
    state.live.client = new MiniStompClient({
      url,
      token: jwt,
      destination,
      onMessage: rows => { if (loadToken === state.renderToken && Array.isArray(rows)) onUpdate(rows); },
      onConnected: () => {
        if (state.live.pollTimer) clearInterval(state.live.pollTimer);
        state.live.pollTimer = null;
        setConnection('实时队列已连接');
      },
      onDisconnected: () => {
        ensurePolling();
        setConnection('轮询降级中', true);
      }
    });
    state.live.client.connect();
  } else {
    setConnection('轮询降级中', true);
  }
}

async function loadWorkspace() {
  if (!state.session) return;
  const loadToken = ++state.renderToken;
  clearLive({ silent: true });
  $('#workspace').innerHTML = loadingHtml();
  try {
    switch (state.session.role) {
      case 'PATIENT': await loadPatient(loadToken); break;
      case 'NURSE': await loadNurse(loadToken); break;
      case 'DOCTOR': await loadDoctor(loadToken); break;
      case 'CASHIER': await loadCashier(loadToken); break;
      case 'PHARMACIST': await loadPharmacist(loadToken); break;
      case 'ADMIN': await loadAdmin(loadToken); break;
      default: $('#workspace').innerHTML = errorHtml(`未识别的角色 ${state.session.role}`);
    }
  } catch (error) {
    if (isAuthError(error)) return;
    if (loadToken === state.renderToken) {
      console.error(error);
      $('#workspace').innerHTML = `${pageHead('工作台', '读取业务数据时发生异常', 'ERROR')}${errorHtml(error.message)}`;
    }
  }
}

async function loadPatient(loadToken) {
  const patientId = state.session.refId;
  if (!patientId) {
    $('#workspace').innerHTML = `${pageHead('患者工作台', '当前账号未绑定患者档案', 'PATIENT')}${errorHtml('当前账号未绑定患者档案，请联系管理员')}`;
    return;
  }
  const [schedules, registrations, visits, bills, roleViews] = await Promise.all([
    api('/api/schedules'),
    api(`/api/registrations/mine?${qs({ patientId })}`),
    api('/api/visits/mine'),
    api('/api/bills/mine'),
    safeApi('/api/auth/roles', [])
  ]);
  syncRoleMeta(roleViews);
  if (loadToken !== state.renderToken) return;
  Object.assign(state.patient, { schedules, registrations, visits, bills });

  const active = registrations.find(item => ['REGISTERED', 'TRIAGED', 'CALLING', 'VISITED'].includes(item.status));
  const schedule = active ? schedules.find(item => Number(item.scheduleId) === Number(active.scheduleId)) : null;
  let board = [];
  if (active?.doctorId && schedule?.workDate) {
    board = await safeApi(`/api/queue/board?${qs({ doctorId: active.doctorId, workDate: dateOnly(schedule.workDate) })}`, []);
  }
  if (loadToken !== state.renderToken) return;
  state.patient.board = board;
  const calling = board.find(item => item.status === 'CALLING');
  const departments = uniqueDepartments(schedules);
  const doctors = uniqueDoctors(schedules);
  const filters = state.patient.filters;

  $('#workspace').innerHTML = `
    ${pageHead('患者工作台', '从查号、取号到费用与病历，一条时间线看完本次就诊', 'PATIENT / 个人就诊')}
    <div class="stat-strip">
      ${statCard('可预约号源', '0', '当前筛选结果', '', 'patient-stat-schedules')}
      ${statCard('我的挂号', String(registrations.length), '含已取消与已就诊', 'accent')}
      ${statCard('当前叫号', calling ? String(calling.queueNo) : '—', '来自所选医生队列', '', 'patient-stat-called')}
      ${statCard('就诊记录', String(visits.length), '病历与诊断摘要')}
    </div>
    <div class="layout-two" style="margin-bottom:1rem">
      <section class="panel" id="sec-queue"><div class="panel-head"><div><h3>叫号进度</h3><p>我的号序与医生当前叫号</p></div></div>
        <div class="panel-body" id="patient-queue-host">${renderPatientBoardHtml(board, registrations)}</div></section>
      <section class="panel" id="sec-schedules"><div class="panel-head"><div><h3>预约挂号</h3><p>余量、诊区与挂号费一目了然</p></div><span class="tag">患者档案 #${patientId}</span></div>
        <div class="panel-body">
          <div class="toolbar">
            <div class="field-group"><label for="patient-filter-date">出诊日期</label><input class="field" id="patient-filter-date" type="date" data-patient-filter="workDate" value="${esc(filters.workDate)}"></div>
            <div class="field-group"><label for="patient-filter-dept">科室</label><select id="patient-filter-dept" data-patient-filter="deptId"><option value="">全部科室</option>${departments.map(d => `<option value="${d.deptId}" ${String(d.deptId) === String(filters.deptId) ? 'selected' : ''}>${esc(d.deptName)}</option>`).join('')}</select></div>
            <div class="field-group grow"><label for="patient-filter-doctor">医生</label><select id="patient-filter-doctor" data-patient-filter="doctorId"><option value="">全部医生</option>${doctors.map(d => `<option value="${d.doctorId}" ${String(d.doctorId) === String(filters.doctorId) ? 'selected' : ''}>${esc(d.doctorName)} · ${esc(d.deptName)}</option>`).join('')}</select></div>
          </div>
          <div class="table-wrap"><table><thead><tr><th>日期 / 时段</th><th>科室 / 诊区</th><th>医生</th><th>余量</th><th>挂号费</th><th>号源状态</th><th>操作</th></tr></thead><tbody id="patient-schedule-body"></tbody></table></div>
        </div></section>
    </div>
    <div class="layout-even">
      <section class="panel" id="sec-registrations"><div class="panel-head"><div><h3>我的挂号</h3><p>号序是取号凭证；未报到前可本人取消</p></div></div>
        <div class="panel-body compact"><div class="table-wrap"><table><thead><tr><th>号序</th><th>医生 / 科室</th><th>渠道</th><th>状态</th><th>费用</th><th>时间</th><th>操作</th></tr></thead><tbody>${registrations.length ? registrations.map(item => `<tr><td><span class="primary">第 ${esc(item.queueNo)} 号</span><span class="sub">#${esc(item.regId)}</span></td><td>${esc(item.doctorName)}<span class="sub">${esc(item.deptName)}</span></td><td>${esc(STATUS_MAPS.channel[item.channel] || item.channel)}</td><td>${statusBadge('registration', item.status)}</td><td class="money">${esc(money(item.registrationFee))}</td><td>${esc(dateTime(item.regTime))}</td><td>${item.status === 'REGISTERED' ? `<button type="button" class="btn btn-small btn-outline" data-action="patient-cancel" data-reg-id="${item.regId}">取消挂号</button>` : '—'}</td></tr>`).join('') : emptyRow(7, '暂无挂号记录')}</tbody></table></div></div></section>
      <section class="panel" id="sec-visits"><div class="panel-head"><div><h3>就诊记录</h3><p>主诉、诊断、医嘱与脱敏手机号</p></div></div>
        <div class="panel-body compact"><div class="table-wrap"><table><thead><tr><th>就诊</th><th>医生</th><th>诊断</th><th>状态</th><th>接诊时间</th></tr></thead><tbody>${visits.length ? visits.map(item => `<tr><td><span class="primary">#${esc(item.visitId)}</span><span class="sub">${esc(item.patientNo)} · ${esc(item.phone)}</span></td><td>${esc(item.doctorName)}</td><td>${esc(item.diagnosis || '尚未书写病历')}</td><td>${statusBadge('visit', item.status)}</td><td>${esc(dateTime(item.startTime))}</td></tr>`).join('') : emptyRow(5, '暂无就诊记录')}</tbody></table></div></div></section>
    </div>
    <section class="panel" id="sec-bills" style="margin-top:1rem"><div class="panel-head"><div><h3>我的账单</h3><p>金额固定两位小数；医保失败保留待重试状态</p></div></div>
      <div class="panel-body compact"><div class="table-wrap"><table><thead><tr><th>账单</th><th>就诊</th><th>应收 / 实收</th><th>通道</th><th>状态</th><th>创建时间</th></tr></thead><tbody>${bills.length ? bills.map(item => `<tr><td><span class="primary">#${esc(item.billId)}</span><span class="sub">${(item.items || []).length} 条明细</span></td><td>#${esc(item.visitId)}</td><td><span class="money">${esc(money(item.totalAmount))}</span><span class="sub">实收 ${esc(money(item.paidAmount))}</span></td><td>${esc(item.payType ? statusText('payType', item.payType) : '—')}</td><td>${statusBadge('bill', item.status)}</td><td>${esc(dateTime(item.createTime))}</td></tr>`).join('') : emptyRow(6, '暂无收费单')}</tbody></table></div></div></section>`;
  renderScheduleRows();
  if (active?.doctorId && schedule?.workDate) {
    startQueueLive(active.doctorId, dateOnly(schedule.workDate), refreshPatientBoard, loadToken);
  }
}

async function loadNurse(loadToken) {
  const [schedules, registrations] = await Promise.all([
    api('/api/schedules'),
    api('/api/registrations/workbench?status=ALL')
  ]);
  const doctors = uniqueDoctors(schedules);
  if (!state.nurse.doctorId || !doctors.some(item => Number(item.doctorId) === Number(state.nurse.doctorId))) {
    state.nurse.doctorId = doctors[0]?.doctorId || null;
  }
  if (!state.nurse.workDate) state.nurse.workDate = today();
  const board = state.nurse.doctorId
    ? await api(`/api/queue/board?${qs({ doctorId: state.nurse.doctorId, workDate: state.nurse.workDate })}`)
    : [];
  if (loadToken !== state.renderToken) return;
  Object.assign(state.nurse, { schedules, registrations, board });
  const calling = board.find(item => item.status === 'CALLING');
  const waiting = board.filter(item => item.status === 'TRIAGED').length;
  const pending = registrations.filter(item => item.status === 'REGISTERED').length;
  const missed = board.reduce((sum, item) => sum + Number(item.missCount || 0), 0);

  $('#workspace').innerHTML = `
    ${pageHead('护士 · 分诊叫号台', '报到、队列、到诊应答与过号标记集中在同一画面', 'NURSE / 分诊')}
    <div class="stat-strip">
      ${statCard('待分诊报到', String(pending), '已挂号未报到', 'accent')}
      ${statCard('候诊队列', String(waiting), '已报到等待叫号', '', 'queue-stat-waiting')}
      ${statCard('当前叫号', calling ? String(calling.queueNo) : '—', '服务端队列状态', '', 'queue-stat-current')}
      ${statCard('累计过号', String(missed), '重排后回到候诊', 'warn', 'queue-stat-missed')}
    </div>
    <div class="panel" style="margin-bottom:1rem"><div class="panel-body toolbar" style="margin:0">
      <div class="field-group"><label for="nurse-doctor">出诊医生</label><select id="nurse-doctor">${doctors.length ? doctors.map(item => `<option value="${item.doctorId}" ${Number(item.doctorId) === Number(state.nurse.doctorId) ? 'selected' : ''}>${esc(item.doctorName)} · ${esc(item.deptName)}</option>`).join('') : '<option value="">暂无医生</option>'}</select></div>
      <div class="field-group"><label for="nurse-date">出诊日期</label><input class="field" type="date" id="nurse-date" value="${esc(state.nurse.workDate)}"></div>
      <button type="button" class="btn btn-outline" data-action="nurse-refresh-board">刷新看板</button>
    </div></div>
    <div id="queue-board-host">${renderQueueBoardHtml(board)}</div>
    <div class="layout-even" style="margin-top:1rem">
      <section class="panel" id="sec-report"><div class="panel-head"><div><h3>分诊报到</h3><p>只接受「已挂号」状态的挂号单</p></div></div>
        <div class="panel-body"><form id="nurse-report-form" class="form-grid">
          <div class="full"><label for="nurse-report-id">挂号单 ID</label><input id="nurse-report-id" name="regId" type="number" min="1" required placeholder="例如 4"></div>
          <div class="full form-actions"><button type="submit" class="btn btn-primary">确认报到</button><span class="muted" style="font-size:.75rem;align-self:center">也可在下方列表或队列卡片直接操作</span></div>
        </form></div></section>
      <section class="panel"><div class="panel-head"><div><h3>规则说明</h3><p>服务端唯一判定，前端不自行倒计时</p></div></div>
        <div class="panel-body"><div class="detail-list">
          <div class="detail-item"><div class="detail-title"><span>BR-04 · 3 分钟过号</span><span class="tag tag-teal">定时扫描</span></div><div class="detail-meta"><span>每 20 秒扫描「叫号中」且未到诊记录</span></div></div>
          <div class="detail-item"><div class="detail-title"><span>BR-05 · 后第 3 位</span><span class="tag">事务重排</span></div><div class="detail-meta"><span>过号次数加 1 后回到「已报到」队列</span></div></div>
          <div class="detail-item"><div class="detail-title"><span>实时与降级</span><span class="tag tag-teal">STOMP / REST</span></div><div class="detail-meta"><span>WebSocket 断开时自动回退到 board 轮询</span></div></div>
        </div></div></section>
    </div>
    <section class="panel" id="sec-registrations" style="margin-top:1rem"><div class="panel-head"><div><h3>挂号列表</h3><p>按挂号时间倒序；仅展示服务端允许的操作</p></div></div>
      <div class="panel-body compact"><div class="table-wrap"><table><thead><tr><th>挂号单</th><th>号序</th><th>患者</th><th>医生 / 科室</th><th>状态</th><th>操作</th></tr></thead><tbody>${registrations.length ? registrations.slice(0, 30).map(item => `<tr><td>#${esc(item.regId)}<span class="sub">${esc(dateTime(item.regTime))}</span></td><td><span class="primary">第 ${esc(item.queueNo)} 号</span></td><td>${esc(item.patientName)}</td><td>${esc(item.doctorName)}<span class="sub">${esc(item.deptName)}</span></td><td>${statusBadge('registration', item.status)}</td><td><div class="row-actions">${item.status === 'REGISTERED' ? `<button type="button" class="btn btn-small btn-outline" data-action="nurse-report" data-reg-id="${item.regId}">报到</button>` : ''}</div></td></tr>`).join('') : emptyRow(6, '暂无挂号单')}</tbody></table></div></div></section>`;
  startQueueLive(state.nurse.doctorId, state.nurse.workDate, refreshQueueLive, loadToken);
}

async function loadDoctor(loadToken) {
  const doctorId = state.session.refId;
  if (!doctorId) {
    $('#workspace').innerHTML = `${pageHead('医生工作台', '当前账号未绑定医生档案', 'DOCTOR')}${errorHtml('当前账号未绑定医生档案，无法叫号与接诊')}`;
    return;
  }
  if (!state.doctor.workDate) state.doctor.workDate = today();
  const [board, registrations, visits, medicines, catalog, prescriptions] = await Promise.all([
    api(`/api/queue/board?${qs({ doctorId, workDate: state.doctor.workDate })}`),
    api('/api/registrations/workbench?status=ALL'),
    api('/api/visits/workbench?status=ALL'),
    api('/api/pharmacy/medicines'),
    api('/api/prescriptions/checkup-catalog'),
    api('/api/prescriptions/workbench?status=ALL')
  ]);
  if (loadToken !== state.renderToken) return;
  const myVisits = visits.filter(item => Number(item.doctorId) === Number(doctorId));
  const activeVisits = myVisits.filter(item => item.status === 'IN_TREATMENT');
  const activeVisit = activeVisits.find(item => Number(item.visitId) === Number(state.doctor.visitId)) || activeVisits[0] || null;
  state.doctor = { ...state.doctor, board, registrations, visits: myVisits, medicines, catalog, prescriptions, visitId: activeVisit?.visitId || null };
  const calling = board.find(item => item.status === 'CALLING');
  const waiting = board.filter(item => item.status === 'TRIAGED').length;
  const visitOptions = activeVisits.length ? activeVisits.map(item => `<option value="${item.visitId}" ${Number(item.visitId) === Number(activeVisit?.visitId) ? 'selected' : ''}>#${item.visitId} · ${esc(item.patientName)} · ${esc(item.patientNo)}</option>`).join('') : '<option value="">暂无接诊中的患者</option>';

  $('#workspace').innerHTML = `
    ${pageHead('医生工作台', '按号序接诊，病历、处方与检查单围绕一次就诊展开', 'DOCTOR / 接诊')}
    <div class="stat-strip">
      ${statCard('候诊队列', String(waiting), '已报到等待叫号', 'accent', 'queue-stat-waiting')}
      ${statCard('当前叫号', calling ? String(calling.queueNo) : '—', '未应答不进入接诊', '', 'queue-stat-current')}
      ${statCard('接诊中', String(activeVisits.length), '可继续书写病历', '', 'queue-stat-missed')}
      ${statCard('我的处方', String(prescriptions.length), '含已发药与退药')}
    </div>
    <div class="panel" style="margin-bottom:1rem"><div class="panel-body toolbar" style="margin:0">
      <div class="field-group"><label for="doctor-date">出诊日期</label><input class="field" id="doctor-date" type="date" value="${esc(state.doctor.workDate)}"></div>
      <button type="button" class="btn btn-primary" data-action="doctor-call-next">叫下一号</button>
      <button type="button" class="btn btn-outline" data-action="doctor-refresh-board">刷新队列</button>
      <span class="muted" style="font-size:.75rem;align-self:center">当前医生档案 #${doctorId} · 仅可叫自己接诊的队列</span>
    </div></div>
    <div id="queue-board-host">${renderQueueBoardHtml(board)}</div>
    <div class="layout-two" style="margin-top:1rem">
      <section class="panel" id="sec-visit"><div class="panel-head"><div><h3>电子病历</h3><p>一次就诊一份病历；完成后不可修改</p></div>${activeVisit ? statusBadge('visit', activeVisit.status) : ''}</div>
        <div class="panel-body">
          <div class="toolbar"><div class="field-group grow"><label for="doctor-visit-select">当前接诊</label><select id="doctor-visit-select">${visitOptions}</select></div></div>
          ${activeVisit ? `<div class="notice">患者 <strong>${esc(activeVisit.patientName)}</strong> · ${esc(activeVisit.patientNo)} · ${esc(activeVisit.phone)} · ${esc(activeVisit.deptName)}</div>
          <form id="doctor-record-form" class="form-grid">
            <input type="hidden" name="visitId" value="${activeVisit.visitId}">
            <div class="full"><label for="record-chief">主诉</label><input id="record-chief" name="chiefComplaint" required value="${esc(activeVisit.chiefComplaint || '')}" placeholder="如：间断头晕 2 周"></div>
            <div class="full"><label for="record-diagnosis">诊断</label><input id="record-diagnosis" name="diagnosis" required value="${esc(activeVisit.diagnosis || '')}" placeholder="如：原发性高血压 1 级"></div>
            <div class="full"><label for="record-advice">医嘱</label><textarea id="record-advice" name="advice" placeholder="如：低盐饮食，两周后复诊">${esc(activeVisit.advice || '')}</textarea></div>
            <div class="full form-actions"><button type="submit" class="btn btn-primary">保存病历</button><button type="button" class="btn btn-outline" data-action="doctor-complete" data-visit-id="${activeVisit.visitId}">结束就诊</button></div>
          </form>` : `<div class="empty-state"><span class="empty-mark">∅</span>暂无接诊中的患者，请先叫号并确认到诊</div>`}
        </div></section>
      <section class="panel" id="sec-prescription"><div class="panel-head"><div><h3>开具处方</h3><p>单价快照；含精神类药品自动标记 PSYCHO</p></div><span class="tag">${activeVisit ? `visit #${activeVisit.visitId}` : '未接诊'}</span></div>
        <div class="panel-body"><form id="doctor-prescription-form">
          <input type="hidden" name="visitId" value="${esc(activeVisit?.visitId || '')}">
          <div id="medicine-lines">${renderMedicineLine(0, medicines)}</div>
          <div class="form-actions"><button type="button" class="btn btn-outline btn-small" data-action="doctor-add-item">添加药品</button><button type="submit" class="btn btn-primary" ${activeVisit ? '' : 'disabled'}>保存处方</button></div>
        </form></div></section>
    </div>
    <div class="layout-even" style="margin-top:1rem">
      <section class="panel" id="sec-checkups"><div class="panel-head"><div><h3>开具检查单</h3><p>项目来自启用状态的检查字典</p></div></div>
        <div class="panel-body"><form id="doctor-checkup-form" class="form-grid">
          <input type="hidden" name="visitId" value="${esc(activeVisit?.visitId || '')}">
          <div class="full"><label for="doctor-checkup-item">检查项目</label><select id="doctor-checkup-item" name="itemCode" required>${catalog.length ? catalog.map(item => `<option value="${esc(item.itemCode)}">${esc(item.itemName)} · ${esc(money(item.price))}</option>`).join('') : '<option value="">暂无项目</option>'}</select></div>
          <div class="full form-actions"><button type="submit" class="btn btn-accent" ${activeVisit && catalog.length ? '' : 'disabled'}>开具检查单</button></div>
        </form></div></section>
      <section class="panel" id="sec-visits"><div class="panel-head"><div><h3>我的接诊与处方</h3><p>医生只能维护自己接诊的数据</p></div></div>
        <div class="panel-body compact"><div class="table-wrap"><table><thead><tr><th>就诊</th><th>患者 / 诊断</th><th>状态</th><th>时间</th></tr></thead><tbody>${myVisits.length ? myVisits.slice(0, 12).map(item => `<tr><td><span class="primary">#${esc(item.visitId)}</span><span class="sub">挂号 #${esc(item.regId)}</span></td><td>${esc(item.patientName)}<span class="sub">${esc(item.diagnosis || '尚未书写病历')}</span></td><td>${statusBadge('visit', item.status)}</td><td>${esc(dateTime(item.startTime))}</td></tr>`).join('') : emptyRow(4, '暂无接诊记录')}</tbody></table></div>
        <div class="detail-list" style="margin-top:.8rem">${prescriptions.slice(0, 6).map(item => `<div class="detail-item"><div class="detail-title"><span>处方 #${esc(item.prescriptionId)} · ${esc(item.patientName)}</span>${statusBadge('prescription', item.status)}</div><div class="detail-meta"><span class="money">${esc(money(item.totalAmount))}</span><span>${esc(item.category === 'PSYCHO' ? '精神类' : '普通处方')}</span><span>${(item.items || []).length} 条明细</span></div></div>`).join('') || '<div class="empty-state">暂无处方</div>'}</div></div></section>
    </div>`;
  startQueueLive(doctorId, state.doctor.workDate, refreshQueueLive, loadToken);
}

async function loadCashier(loadToken) {
  const start = `${today()}T00:00:00`;
  const end = `${today()}T23:59:59`;
  const [visits, bills, registrations, revenue] = await Promise.all([
    api('/api/visits/workbench?status=ALL'),
    api('/api/bills/workbench?status=ALL'),
    api('/api/registrations/workbench?status=ALL'),
    safeApi(`/api/stats/revenue?${qs({ start, end })}`, { total: 0, insurance: 0, self: 0, billCount: 0 })
  ]);
  if (loadToken !== state.renderToken) return;
  const selected = bills.find(item => Number(item.billId) === Number(state.cashier.selectedBillId))
    || bills.find(item => item.status === 'RETRY')
    || bills.find(item => item.status === 'UNPAID')
    || bills[0]
    || null;
  Object.assign(state.cashier, { visits, bills, registrations, revenue, selectedBillId: selected?.billId || null });
  const unpaid = bills.filter(item => item.status === 'UNPAID').length;
  const retry = bills.filter(item => item.status === 'RETRY').length;
  const refundable = status => ['REGISTERED', 'TRIAGED', 'CALLING'].includes(status);
  const refundRows = registrations.slice(0, 12).map(item => `<tr><td><span class="primary">#${esc(item.regId)}</span><span class="sub">第 ${esc(item.queueNo)} 号</span></td><td>${esc(item.patientName)}</td><td>${esc(item.doctorName)}<span class="sub">${esc(item.deptName)}</span></td><td>${statusBadge('registration', item.status)}</td><td class="money">${esc(money(item.registrationFee))}</td><td>${refundable(item.status) ? `<button type="button" class="btn btn-small btn-outline" data-action="cashier-registration-refund" data-reg-id="${item.regId}">办理退号</button>` : '—'}</td></tr>`).join('') || emptyRow(6, '暂无挂号单');

  $('#workspace').innerHTML = `
    ${pageHead('收费工作台', '自动划价、医保重试、挂号退号与整单退费', 'CASHIER / 结算')}
    <div class="stat-strip">
      ${statCard('待处理就诊', String(visits.length), '可尝试生成收费单', 'accent')}
      ${statCard('待收费单', String(unpaid), '待收费单据')}
      ${statCard('待重试', String(retry), '医保失败，不得记成功', retry ? 'warn' : '')}
      ${statCard('今日已收', money(revenue?.total || 0), `${revenue?.billCount || 0} 笔已收费单`)}
    </div>
    <div class="layout-two">
      <div class="stack">
        <section class="panel" id="sec-price"><div class="panel-head"><div><h3>自动划价</h3><p>汇总待收费处方 / 检查 / 未付挂号费</p></div></div>
          <div class="panel-body"><form id="cashier-price-form" class="form-grid">
            <div class="full"><label for="cashier-visit">选择就诊</label><select id="cashier-visit" name="visitId" required>${visits.length ? visits.map(item => `<option value="${item.visitId}">#${item.visitId} · ${esc(item.patientName)} · ${esc(item.doctorName)} · ${esc(statusText('visit', item.status))}</option>`).join('') : '<option value="">暂无就诊</option>'}</select></div>
            <div class="full form-actions"><button type="submit" class="btn btn-primary" ${visits.length ? '' : 'disabled'}>生成 / 查看收费单</button></div>
          </form><div class="notice warn" style="margin-top:1rem">同一就诊已有「待收费 / 待重试」收费单时，服务端直接返回原单，不重复生成。</div></div></section>
        <section class="panel" id="sec-revenue"><div class="panel-head"><div><h3>今日收入口径</h3><p>仅统计「已收费」的收费单</p></div></div>
          <div class="panel-body"><div class="invoice"><div class="invoice-row"><span>自费部分</span><span class="money">${esc(money(revenue?.self || 0))}</span></div><div class="invoice-row"><span>医保统筹</span><span class="money">${esc(money(revenue?.insurance || 0))}</span></div><div class="invoice-row total"><span>已收合计</span><span class="money">${esc(money(revenue?.total || 0))}</span></div></div></div></section>
      </div>
      <section class="panel" id="sec-bills"><div class="panel-head"><div><h3>收费单与结算</h3><p>以 data.status 判断是否真正收款成功</p></div><span class="tag tag-teal">${bills.length} 张单据</span></div>
        <div class="panel-body">
          <div class="toolbar"><div class="field-group grow"><label for="cashier-bill">收费单</label><select id="cashier-bill">${bills.length ? bills.map(item => `<option value="${item.billId}" ${Number(item.billId) === Number(selected?.billId) ? 'selected' : ''}>#${item.billId} · ${esc(item.patientName)} · ${esc(statusText('bill', item.status))} · ${esc(money(item.totalAmount))}</option>`).join('') : '<option value="">暂无收费单</option>'}</select></div></div>
          <div id="cashier-invoice">${renderInvoice(selected)}</div>
          <div class="detail-list" style="margin-top:1rem">${bills.filter(item => ['UNPAID', 'RETRY', 'PAID'].includes(item.status)).slice(0, 8).map(item => `<div class="detail-item${item.status === 'RETRY' ? ' retry' : ''}"><div class="detail-title"><span>#${esc(item.billId)} · ${esc(item.patientName)}</span>${statusBadge('bill', item.status)}</div><div class="detail-meta"><span class="money">${esc(money(item.totalAmount))}</span><span>${(item.items || []).length} 条明细</span><span>${esc(dateTime(item.createTime))}</span></div><div class="detail-actions"><button type="button" class="btn btn-small btn-outline" data-action="cashier-select-bill" data-bill-id="${item.billId}">查看明细</button></div></div>`).join('') || '<div class="empty-state">暂无收费单</div>'}</div>
        </div></section>
    </div>
    <section class="panel" id="sec-registration-refund" style="margin-top:1rem"><div class="panel-head"><div><h3>挂号退号</h3><p>就诊前办理挂号费退费、号源回补与审计留痕</p></div><span class="tag tag-teal">独立前端 / 纯 API</span></div>
      <div class="panel-body compact"><div class="table-wrap"><table><thead><tr><th>挂号单</th><th>患者</th><th>医生 / 科室</th><th>状态</th><th>挂号费</th><th>操作</th></tr></thead><tbody>${refundRows}</tbody></table></div>
        <div class="notice warn" style="margin-top:1rem">已就诊、已过号与终态挂号单不显示退号按钮；最终权限由后端 JWT 角色与状态校验决定。挂号费并入已收费单时须先办理整单退费。</div></div></section>`;
}

async function loadPharmacist(loadToken, keyword = state.pharmacist.keyword) {
  const [prescriptions, medicines] = await Promise.all([
    api('/api/prescriptions/workbench?status=ALL'),
    api(`/api/pharmacy/medicines?${qs({ keyword })}`)
  ]);
  if (loadToken !== state.renderToken) return;
  Object.assign(state.pharmacist, { prescriptions, medicines, keyword });
  const paid = prescriptions.filter(item => item.status === 'PAID').length;
  const approved = prescriptions.filter(item => item.status === 'APPROVED').length;
  const psychoPending = prescriptions.filter(item => item.category === 'PSYCHO' && item.status === 'APPROVED' && !item.secondSigner).length;
  const warnings = medicines.filter(item => stockWarning(item)[0] !== '正常').length;

  $('#workspace').innerHTML = `
    ${pageHead('药房工作台', '未审核不发药；精神类处方显示双签状态；库存不足整体回滚', 'PHARMACIST / 发药')}
    <div class="stat-strip">
      ${statCard('待审核', String(paid), '已收费处方', 'accent')}
      ${statCard('待发药', String(approved), '已审核处方')}
      ${statCard('待第二签字', String(psychoPending), '须不同账号签字', psychoPending ? 'warn' : '')}
      ${statCard('库存预警', String(warnings), '低限 / 高限 / 近效期')}
    </div>
    <div class="notice warn">精神类处方第二签字请使用另一个药房账号，例如 <code>pharma02</code>；同一账号两次签字会被服务端拒绝。</div>
    <div class="layout-two">
      <section class="panel" id="sec-prescriptions"><div class="panel-head"><div><h3>处方处理</h3><p>按创建时间倒序，动作由状态机决定</p></div><span class="tag tag-teal">${prescriptions.length} 张处方</span></div>
        <div class="panel-body">${renderPrescriptionCards(prescriptions.slice(0, 40))}</div></section>
      <section class="panel" id="sec-inventory"><div class="panel-head"><div><h3>库存与预警</h3><p>名称或编码检索；发药使用药品行锁</p></div></div>
        <div class="panel-body">
          <div class="toolbar"><div class="field-group grow"><label for="pharmacy-keyword">药品检索</label><input class="field" id="pharmacy-keyword" value="${esc(keyword)}" placeholder="输入名称或编码"></div><button type="button" class="btn btn-outline" data-action="pharmacy-search">查询</button></div>
          <div class="table-wrap"><table><thead><tr><th>编码 / 药品</th><th>类别</th><th>库存</th><th>低 / 高限</th><th>单价</th><th>效期</th><th>预警</th></tr></thead><tbody>${medicines.length ? medicines.map(item => { const warning = stockWarning(item); return `<tr><td><span class="primary">${esc(item.name)}</span><span class="sub">${esc(item.code)} · ${esc(item.spec)}</span></td><td>${item.category === 'PSYCHO' ? '<span class="tag tag-hot">精神类</span>' : '<span class="tag">普通</span>'}</td><td>${esc(item.stockQty)} ${esc(item.unit)}</td><td>${esc(item.lowWarn)} / ${esc(item.highWarn)}</td><td class="money">${esc(money(item.price))}</td><td>${esc(dateOnly(item.expiryDate) || '—')}</td><td><span class="tag ${warning[1] === 'tag-hot' ? 'tag-hot' : warning[1]}">${warning[0]}</span></td></tr>`; }).join('') : emptyRow(7, '没有匹配药品')}</tbody></table></div>
        </div></section>
    </div>`;
}

async function loadAdmin(loadToken) {
  if (!state.admin.start || !state.admin.end) {
    state.admin.start = `${today()}T00:00`;
    state.admin.end = `${today()}T23:59`;
  }
  const start = apiDateTime(state.admin.start, `${today()}T00:00:00`);
  const end = apiDateTime(state.admin.end, `${today()}T23:59:59`);
  const [workload, revenue, logs, registrations, roles, users, schedules, catalog] = await Promise.all([
    api(`/api/stats/workload?${qs({ start, end })}`),
    api(`/api/stats/revenue?${qs({ start, end })}`),
    api(`/api/audit?${qs({ start, end })}`),
    api('/api/registrations/workbench?status=ALL'),
    api('/api/admin/roles'),
    api('/api/admin/users'),
    api('/api/admin/schedules'),
    api('/api/admin/catalog')
  ]);
  if (loadToken !== state.renderToken) return;
  Object.assign(state.admin, {
    workload, revenue, logs, registrations, roles, users, schedules,
    doctors: catalog.doctors || [], departments: catalog.departments || []
  });
  const visitCount = workload.reduce((sum, item) => sum + Number(item.visitCount || 0), 0);
  const max = Math.max(1, ...workload.map(item => Number(item.visitCount || 0)));

  $('#workspace').innerHTML = `
    ${pageHead('管理后台', '工作量、收入、过号扫描与关键操作审计集中核对', 'ADMIN / 运营')}
    <div class="stat-strip">
      ${statCard('接诊人次', String(visitCount), '所选时间区间', 'accent')}
      ${statCard('已收总额', money(revenue?.total || 0), `${revenue?.billCount || 0} 笔收费单`)}
      ${statCard('医保统筹', money(revenue?.insurance || 0), '按已收费单聚合')}
      ${statCard('审计记录', String(logs.length), '独立事务只插入/查询')}
    </div>
    <div class="panel" style="margin-bottom:1rem"><div class="panel-body toolbar" style="margin:0">
      <div class="field-group"><label for="admin-start">开始时间</label><input class="field" id="admin-start" type="datetime-local" value="${esc(state.admin.start)}"></div>
      <div class="field-group"><label for="admin-end">结束时间</label><input class="field" id="admin-end" type="datetime-local" value="${esc(state.admin.end)}"></div>
      <button type="button" class="btn btn-primary" data-action="admin-apply-range">应用区间</button>
    </div></div>
    <div class="layout-even">
      <section class="panel" id="sec-stats"><div class="panel-head"><div><h3>医生工作量</h3><p>按接诊记录聚合，横条为相对工作量</p></div></div>
        <div class="panel-body">${workload.length ? workload.map(item => `<div class="detail-item"><div class="detail-title"><span>医生 #${esc(item.doctorId)}</span><strong>${esc(item.visitCount)} 人次</strong></div><div style="height:.55rem;margin-top:.5rem;background:var(--surface-alt);border-radius:999px;overflow:hidden"><div style="height:100%;width:${Math.max(4, Number(item.visitCount || 0) / max * 100)}%;background:linear-gradient(90deg,var(--teal),var(--mint));border-radius:999px"></div></div></div>`).join('') : '<div class="empty-state">该区间暂无接诊记录</div>'}</div></section>
      <section class="panel" id="sec-queue"><div class="panel-head"><div><h3>过号扫描与规则</h3><p>定时器每 20 秒运行，也可手动触发演示</p></div></div>
        <div class="panel-body"><div class="detail-list">
          <div class="detail-item approved"><div class="detail-title"><span>自动扫描</span><span class="tag tag-teal">QueueSweeper</span></div><div class="detail-meta"><span>3 分钟未应答 · 当前号后第 3 位</span></div></div>
          <div class="detail-item"><div class="detail-title"><span>手动触发</span><button type="button" class="btn btn-small btn-primary" data-action="admin-sweep">立即扫描</button></div><div class="detail-meta"><span>仅 ADMIN 可调用 POST /api/queue/sweep</span></div></div>
          <div class="detail-item"><div class="detail-title"><span>版本边界</span><span class="tag">V1.7</span></div><div class="detail-meta"><span>V1.7：用户 / 角色 / 排班维护、WebSocket 主题授权、关键审计、设计图集、连通性与 50 并发 P95 已交付；批次库存锁、幂等键列为扩展设计</span></div></div>
        </div></div></section>
    </div>
    <div id="admin-maintenance">${renderAdminMaintenance()}</div>
    <section class="panel" id="sec-audit" style="margin-top:1rem"><div class="panel-head"><div><h3>审计日志</h3><p>操作人、角色、动作、对象、时间与结果</p></div><span class="tag">${logs.length} 条</span></div>
      <div class="panel-body">${logs.length ? logs.slice(0, 120).map(item => `<div class="log-line"><time>${esc(dateTime(item.operateTime))}</time><span class="action">${esc(item.action)}</span><span class="detail">${esc(item.operatorName || '系统')} · ${esc(item.operatorRole || '—')} · ${esc(item.targetType || '')} #${esc(item.targetId || '')} · ${esc(item.detail || '')}</span></div>`).join('') : '<div class="empty-state">该区间暂无审计日志</div>'}</div></section>`;
}

function renderCashierInvoice() {
  const host = $('#cashier-invoice');
  if (!host) return;
  const bill = state.cashier.bills.find(item => Number(item.billId) === Number(state.cashier.selectedBillId));
  host.innerHTML = renderInvoice(bill);
}

async function runForm(form, handler) {
  const buttons = $$('button', form);
  buttons.forEach(button => { button.disabled = true; });
  try {
    await handler();
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
}

async function handleAction(action, element) {
  switch (action) {
    case 'refresh': await loadWorkspace(); break;
    case 'patient-book': {
      const scheduleId = Number(element.dataset.scheduleId);
      const data = await api('/api/registrations', {
        method: 'POST',
        body: { patientId: state.session.refId, scheduleId, channel: 'ONLINE' }
      });
      toast(`挂号成功：第 ${data.queueNo} 号，${data.doctorName} · ${data.deptName}`, 'success');
      await loadWorkspace();
      break;
    }
    case 'patient-cancel': {
      const data = await api(`/api/registrations/${element.dataset.regId}/cancel`, { method: 'POST' });
      toast(`挂号已取消，号源余量回补至 ${data.remainingQty}`, 'success');
      await loadWorkspace();
      break;
    }
    case 'nurse-report': {
      const regId = Number(element.dataset.regId || $('#nurse-report-id')?.value);
      const data = await api('/api/queue/report', { method: 'POST', body: { regId } });
      toast(`分诊报到成功：顺位 ${data.callOrder || '—'}`, 'success');
      await loadWorkspace();
      break;
    }
    case 'nurse-arrive': {
      await api('/api/queue/arrive', { method: 'POST', body: { regId: Number(element.dataset.regId) } });
      toast('已确认患者到诊', 'success');
      await loadWorkspace();
      break;
    }
    case 'nurse-refresh-board': await loadWorkspace(); break;
    case 'doctor-call-next': {
      const data = await api('/api/queue/call-next', {
        method: 'POST',
        body: { doctorId: state.session.refId, workDate: state.doctor.workDate || today() }
      });
      toast(`已叫第 ${data.queueNo} 号：${data.patientName}`, 'success');
      await loadWorkspace();
      break;
    }
    case 'doctor-arrive': {
      await api('/api/queue/arrive', { method: 'POST', body: { regId: Number(element.dataset.regId) } });
      toast('已确认患者到诊，可以开始接诊', 'success');
      await loadWorkspace();
      break;
    }
    case 'doctor-start-visit': {
      const data = await api('/api/visits/start', { method: 'POST', body: { regId: Number(element.dataset.regId) } });
      state.doctor.visitId = data.visitId;
      toast(`已创建就诊 #${data.visitId}`, 'success');
      await loadWorkspace();
      break;
    }
    case 'doctor-add-item': {
      const host = $('#medicine-lines');
      if (!host) break;
      const index = $$('.medicine-line', host).length;
      host.insertAdjacentHTML('beforeend', renderMedicineLine(index, state.doctor.medicines));
      break;
    }
    case 'doctor-remove-item': {
      const line = element.closest('.medicine-line');
      const host = $('#medicine-lines');
      if (line && host && $$('.medicine-line', host).length > 1) line.remove();
      else toast('至少保留一条处方明细', 'error');
      break;
    }
    case 'doctor-complete': {
      await api(`/api/visits/${element.dataset.visitId}/complete`, { method: 'POST' });
      state.doctor.visitId = null;
      toast('就诊已结束，病历与单据只读', 'success');
      await loadWorkspace();
      break;
    }
    case 'cashier-select-bill': {
      state.cashier.selectedBillId = Number(element.dataset.billId);
      const select = $('#cashier-bill');
      if (select) select.value = String(state.cashier.selectedBillId);
      renderCashierInvoice();
      break;
    }
    case 'cashier-refund': {
      const data = await api('/api/bills/refund', {
        method: 'POST',
        body: { billId: Number(element.dataset.billId), reason: '收费台办理整单退费' }
      });
      toast(`退费已登记，收费单 #${data.billId} 状态为${statusText('bill', data.status)}`, 'success');
      await loadWorkspace();
      break;
    }
    case 'cashier-registration-refund': {
      const data = await api(`/api/registrations/${element.dataset.regId}/refund`, {
        method: 'POST',
        body: { reason: '收费台办理退号退费' }
      });
      toast(`退号成功：挂号费 ${money(data.refundAmount)}，号源余量回补至 ${data.remainingQty}`, 'success');
      await loadWorkspace();
      break;
    }
    case 'pharmacy-audit': {
      await api('/api/pharmacy/audit', { method: 'POST', body: { prescriptionId: Number(element.dataset.prescriptionId) } });
      toast('处方审核通过', 'success');
      await loadWorkspace();
      break;
    }
    case 'pharmacy-second-sign': {
      await api('/api/pharmacy/second-sign', { method: 'POST', body: { prescriptionId: Number(element.dataset.prescriptionId) } });
      toast('第二签字已登记', 'success');
      await loadWorkspace();
      break;
    }
    case 'pharmacy-dispense': {
      await api(`/api/pharmacy/${element.dataset.prescriptionId}/dispense`, { method: 'POST' });
      toast('发药成功，库存已扣减', 'success');
      await loadWorkspace();
      break;
    }
    case 'pharmacy-return': {
      await api(`/api/pharmacy/${element.dataset.prescriptionId}/return`, { method: 'POST' });
      toast('退药成功，库存已回补', 'success');
      await loadWorkspace();
      break;
    }
    case 'pharmacy-search': {
      const keyword = $('#pharmacy-keyword')?.value || '';
      state.pharmacist.keyword = keyword;
      const medicines = await api(`/api/pharmacy/medicines?${qs({ keyword })}`);
      state.pharmacist.medicines = medicines;
      const rows = medicines.map(item => { const warning = stockWarning(item); return `<tr><td><span class="primary">${esc(item.name)}</span><span class="sub">${esc(item.code)} · ${esc(item.spec)}</span></td><td>${item.category === 'PSYCHO' ? '<span class="tag tag-hot">精神类</span>' : '<span class="tag">普通</span>'}</td><td>${esc(item.stockQty)} ${esc(item.unit)}</td><td>${esc(item.lowWarn)} / ${esc(item.highWarn)}</td><td class="money">${esc(money(item.price))}</td><td>${esc(dateOnly(item.expiryDate) || '—')}</td><td><span class="tag ${warning[1] === 'tag-hot' ? 'tag-hot' : warning[1]}">${warning[0]}</span></td></tr>`; }).join('');
      const tbody = $('#sec-inventory tbody');
      if (tbody) tbody.innerHTML = medicines.length ? rows : emptyRow(7, '没有匹配药品');
      break;
    }
    case 'admin-sweep': {
      const count = await api('/api/queue/sweep', { method: 'POST' });
      toast(count > 0 ? `本轮重排 ${count} 条过号挂号单` : '本轮没有需要重排的过号记录', 'success');
      await loadWorkspace();
      break;
    }
    case 'admin-apply-range': {
      state.admin.start = $('#admin-start')?.value || state.admin.start;
      state.admin.end = $('#admin-end')?.value || state.admin.end;
      await loadWorkspace();
      break;
    }
    case 'admin-clear-edits': {
      state.admin.edits = { roleCode: null, userId: null, scheduleId: null };
      refreshAdminForms();
      break;
    }
    case 'admin-edit-role': {
      state.admin.edits.roleCode = element.dataset.roleCode;
      refreshAdminForms();
      $('#admin-role-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      break;
    }
    case 'admin-edit-user': {
      state.admin.edits.userId = Number(element.dataset.userId);
      refreshAdminForms();
      $('#admin-user-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      break;
    }
    case 'admin-toggle-user': {
      await api(`/api/admin/users/${element.dataset.userId}/status?enabled=${element.dataset.enabled}`, { method: 'POST' });
      toast(`账号已${element.dataset.enabled === 'true' ? '启用' : '禁用'}`, 'success');
      await loadWorkspace();
      break;
    }
    case 'admin-edit-schedule': {
      state.admin.edits.scheduleId = Number(element.dataset.scheduleId);
      refreshAdminForms();
      $('#admin-schedule-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      break;
    }
    case 'admin-close-schedule': {
      await api(`/api/admin/schedules/${element.dataset.scheduleId}/close`, { method: 'POST' });
      toast('排班已停诊，历史挂号记录保留', 'success');
      await loadWorkspace();
      break;
    }
    default: break;
  }
}

document.addEventListener('click', async event => {
  const actionElement = event.target.closest('[data-action]');
  if (actionElement) {
    const action = actionElement.dataset.action;
    if (action === 'toggle-password') {
      const input = $('#login-password');
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      actionElement.textContent = showing ? '显示' : '隐藏';
      return;
    }
    if (action === 'select-role') {
      selectRole(actionElement.dataset.role);
      return;
    }
    if (action === 'nav') {
      $$('.nav-item').forEach(button => button.classList.toggle('active', button === actionElement));
      document.getElementById(actionElement.dataset.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (action === 'logout') {
      logout('已退出登录');
      return;
    }
    try {
      await handleAction(action, actionElement);
    } catch (error) {
      if (!isAuthError(error)) {
        console.error(error);
        toast(error.message || '操作失败', 'error');
      }
    }
    return;
  }

  const nav = event.target.closest('.nav-item');
  if (nav) {
    $$('.nav-item').forEach(button => button.classList.toggle('active', button === nav));
    document.getElementById(nav.dataset.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

document.addEventListener('change', async event => {
  const target = event.target;
  if (target.dataset.patientFilter) {
    state.patient.filters[target.dataset.patientFilter] = target.value;
    renderScheduleRows();
    return;
  }
  if (target.id === 'nurse-doctor' || target.id === 'nurse-date') {
    state.nurse.doctorId = Number($('#nurse-doctor')?.value) || null;
    state.nurse.workDate = $('#nurse-date')?.value || today();
    await loadWorkspace();
    return;
  }
  if (target.id === 'doctor-date') {
    state.doctor.workDate = target.value || today();
    await loadWorkspace();
    return;
  }
  if (target.id === 'doctor-visit-select') {
    state.doctor.visitId = Number(target.value) || null;
    await loadWorkspace();
    return;
  }
  if (target.id === 'cashier-bill') {
    state.cashier.selectedBillId = Number(target.value) || null;
    renderCashierInvoice();
  }
  if (target.id === 'admin-schedule-doctor') {
    const selected = target.selectedOptions[0];
    const dept = $('#admin-schedule-dept');
    if (selected?.dataset.deptId && dept) dept.value = selected.dataset.deptId;
  }
});

document.addEventListener('submit', async event => {
  const form = event.target;
  const known = ['login-form', 'nurse-report-form', 'doctor-record-form', 'doctor-prescription-form',
    'doctor-checkup-form', 'cashier-price-form', 'cashier-pay-form',
    'admin-role-form', 'admin-user-form', 'admin-schedule-form'];
  if (!known.includes(form.id)) return;
  event.preventDefault();
  await runForm(form, async () => {
    try {
      if (form.id === 'login-form') {
        const username = $('#login-username').value.trim();
        const password = $('#login-password').value;
        const data = await api('/api/auth/login', { method: 'POST', skipAuth: true, body: { username, password } });
        state.session = normalizeSession(data);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.session));
        if (state.loginRole !== state.session.role) {
          toast(`账号实际角色为「${ROLE_META[state.session.role]?.label || state.session.role}」，已按服务端角色进入工作台`, 'info');
        }
        showApp();
        return;
      }
      if (form.id === 'nurse-report-form') {
        await handleAction('nurse-report', form);
        return;
      }
      if (form.id === 'doctor-record-form') {
        const body = Object.fromEntries(new FormData(form).entries());
        body.visitId = Number(body.visitId);
        await api('/api/visits/records', { method: 'POST', body });
        toast('病历已保存', 'success');
        await loadWorkspace();
        return;
      }
      if (form.id === 'doctor-prescription-form') {
        const visitId = Number($('#doctor-prescription-form input[name="visitId"]')?.value);
        const items = $$('#medicine-lines .medicine-line').map(line => ({
          medicineId: Number($('[data-field="medicineId"]', line).value),
          quantity: Number($('[data-field="quantity"]', line).value),
          usageText: $('[data-field="usageText"]', line).value.trim()
        }));
        if (!visitId || !items.length || items.some(item => !item.medicineId || !Number.isInteger(item.quantity) || item.quantity <= 0)) {
          throw new Error('请完整填写就诊、药品与大于 0 的整数数量');
        }
        const data = await api('/api/prescriptions', { method: 'POST', body: { visitId, items } });
        toast(`处方 #${data.prescriptionId} 已保存，金额 ${money(data.totalAmount)}`, 'success');
        await loadWorkspace();
        return;
      }
      if (form.id === 'doctor-checkup-form') {
        const body = Object.fromEntries(new FormData(form).entries());
        body.visitId = Number(body.visitId);
        const data = await api('/api/prescriptions/checkups', { method: 'POST', body });
        toast(`检查单 #${data.checkupId} 已开具：${data.itemName}`, 'success');
        await loadWorkspace();
        return;
      }
      if (form.id === 'cashier-price-form') {
        const visitId = Number(new FormData(form).get('visitId'));
        const data = await api('/api/bills/price', { method: 'POST', body: { visitId } });
        state.cashier.selectedBillId = data.billId;
        toast(`收费单 #${data.billId} 应收 ${money(data.totalAmount)}`, 'success');
        await loadWorkspace();
        return;
      }
      if (form.id === 'cashier-pay-form') {
        const raw = Object.fromEntries(new FormData(form).entries());
        const body = {
          billId: Number(raw.billId),
          payType: raw.payType,
          paidAmount: raw.paidAmount === '' ? undefined : Number(raw.paidAmount)
        };
        const data = await api('/api/bills/pay', { method: 'POST', body });
        state.cashier.selectedBillId = data.billId;
        if (data.status === 'RETRY') {
          const last = (data.settlements || []).at(-1);
          toast(`医保结算未成功，已保留待重试：${last?.errorMsg || '请稍后重新结算'}`, 'error');
        } else {
          toast(`收款成功：${money(data.totalAmount)} · ${statusText('payType', data.payType)}`, 'success');
        }
        await loadWorkspace();
      }
      if (form.id === 'admin-role-form') {
        const raw = Object.fromEntries(new FormData(form).entries());
        const editRoleCode = raw.editRoleCode;
        const body = { roleCode: String(raw.roleCode || '').trim(), roleName: String(raw.roleName || '').trim(), permissions: String(raw.permissions || '').trim() };
        await api(editRoleCode ? `/api/admin/roles/${encodeURIComponent(editRoleCode)}` : '/api/admin/roles', {
          method: editRoleCode ? 'PUT' : 'POST', body
        });
        state.admin.edits.roleCode = null;
        toast(editRoleCode ? '角色已更新' : '角色已创建', 'success');
        await loadWorkspace();
        return;
      }
      if (form.id === 'admin-user-form') {
        const raw = Object.fromEntries(new FormData(form).entries());
        const editUserId = raw.editUserId;
        const body = {
          username: String(raw.username || '').trim(),
          realName: String(raw.realName || '').trim(),
          roleCode: raw.roleCode,
          refId: raw.refId === '' ? null : Number(raw.refId),
          enabled: raw.enabled === 'true'
        };
        if (raw.password) body.password = raw.password;
        await api(editUserId ? `/api/admin/users/${editUserId}` : '/api/admin/users', {
          method: editUserId ? 'PUT' : 'POST', body
        });
        state.admin.edits.userId = null;
        toast(editUserId ? '账号已更新' : '账号已创建', 'success');
        await loadWorkspace();
        return;
      }
      if (form.id === 'admin-schedule-form') {
        const raw = Object.fromEntries(new FormData(form).entries());
        const editScheduleId = raw.editScheduleId;
        const body = {
          doctorId: Number(raw.doctorId),
          deptId: Number(raw.deptId),
          workDate: raw.workDate,
          timeSlot: String(raw.timeSlot || '').trim(),
          totalQty: Number(raw.totalQty),
          registrationFee: Number(raw.registrationFee)
        };
        if (!Number.isInteger(body.totalQty) || body.totalQty <= 0) throw new Error('号源总量必须为正整数');
        await api(editScheduleId ? `/api/admin/schedules/${editScheduleId}` : '/api/admin/schedules', {
          method: editScheduleId ? 'PUT' : 'POST', body
        });
        state.admin.edits.scheduleId = null;
        toast(editScheduleId ? '排班已更新' : '排班已创建', 'success');
        await loadWorkspace();
      }
    } catch (error) {
      if (!isAuthError(error)) {
        console.error(error);
        toast(error.message || '提交失败', 'error');
      }
    }
  });
});

window.addEventListener('beforeunload', () => clearLive({ silent: true }));

function bootstrap() {
  ['#login-username', '#login-password'].forEach(selector => {
    $(selector)?.addEventListener('input', () => { state.loginTouched = true; });
  });
  renderRolePicker();
  renderRoleMetaFromServer();
  const session = readSession();
  if (session) {
    state.session = session;
    showApp();
  } else {
    showLogin();
  }
  updateClock();
  setInterval(updateClock, 30000);
}

bootstrap();
