import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = path.join(projectRoot, 'docs');
const imagesDir = path.join(docsDir, 'images');
const outDir = process.env.UI_OUT_DIR || imagesDir;
const reportFile = path.join(outDir, 'docs-baseline-report.json');
const report = {
  scenario: 'AC-30 / 文档、报告与脚本基线一致性',
  baseline: 'V1.7',
  generatedAt: new Date().toISOString(),
  files: [], checks: {}, errors: [], passed: false
};
const expect = (ok, message) => { if (!ok) report.errors.push(message); };
const read = file => fs.readFileSync(file, 'utf8');
const relative = file => path.relative(projectRoot, file).replaceAll(path.sep, '/');
const perLineRules = [
  { name: '50 并发未完成表述', pattern: /50\s*并发\s*P95\s*压测\s*(待补|未完成|尚未执行)|压测待补/ },
  { name: '旧患者共享主题', pattern: /患者订阅\s*`?\/topic\/queue\/\{doctorId\}\/\{workDate\}\/masked`?(?!\/\{patientId\})/ },
  { name: '待实际执行', pattern: /待实际执行|须执行|尚未执行/ }
];

const versions = {
  'docs/00-文档索引与编写规范.md': ['PRD/RTM V1.7', 'SC/SD V1.7', 'DBD V1.3', 'REF V1.8', 'DEP V1.7'],
  'docs/01-产品需求文档PRD.md': ['V1.7'],
  'docs/02-概要设计说明书-SC结构图.md': ['V1.7'],
  'docs/03-详细设计说明书-SD时序图与状态图.md': ['V1.7'],
  'docs/04-数据库设计说明书.md': ['V1.3'],
  'docs/05-需求追溯矩阵.md': ['V1.7'],
  'docs/06-GitHub借鉴与选型说明.md': ['V1.8'],
  'docs/07-前后端分离架构与部署说明.md': ['V1.7'],
  'docs/08-用户手册.md': ['V1.5'],
  'docs/09-图集导出与演示记录.md': ['V1.2'],
  'docs/10-50并发性能压测说明.md': ['V1.2'],
  'docs/11-业务连通性与真实功能审计.md': ['V1.2']
};

const staleRules = [
  { name: 'PRD 1.5.2 段旧值', pattern: /PRD V1\.5\.2/ },
  { name: '30 张图口径', pattern: /共\s*30\s*张图|只（有）?30张|仍写\s*30\s*张/ },
  { name: '图源基线 1.5.3 段旧值', pattern: /图源基线：PRD V1\.5\.3/ },
  { name: 'DM8 已交付脚本', pattern: /已提供\s*DM8.*脚本|DM8.*脚本已交付/ },
  { name: '用户角色维护未实现', pattern: /用户\s*\/\s*角色维护.*未实现|用户与角色维护.*尚未实现/ },
  { name: '排班维护未实现', pattern: /排班维护.*未实现|排班维护.*尚未实现/ },
  { name: '取消退号待补', pattern: /取消挂号与退号(?:事务)?\s*(待补|未实现|尚未)/ },
  { name: '旧管理台版本边界', pattern: /版本边界<\/span><span class="tag">V1\.6/ },
  { name: '旧报告基线', pattern: /"baseline"\s*:\s*"(?![^"]*V1\.7)[^"]*"/ },
  { name: '旧脚本基线', pattern: /baseline\s*:\s*'(?!V1\.7)[^']*'/ }
];

function addFile(relativePath) {
  const absolute = path.join(projectRoot, relativePath);
  if (!fs.existsSync(absolute)) {
    expect(false, `缺少交付文件：${relativePath}`);
    return;
  }
  const text = read(absolute);
  report.files.push({ file: relativePath, bytes: Buffer.byteLength(text, 'utf8') });
  for (const rule of staleRules) {
    expect(!rule.pattern.test(text), `${relativePath} 存在陈旧口径：${rule.name}`);
  }
  for (const rule of perLineRules) {
    const hit = text.split(/\r?\n/).find(line => rule.pattern.test(line));
    expect(!hit, `${relativePath} 存在陈旧口径：${rule.name}`);
  }
  const required = versions[relativePath] || [];
  for (const version of required) {
    expect(text.includes(version), `${relativePath} 缺少版本基线 ${version}`);
  }
}

function main() {
  for (const relativePath of Object.keys(versions)) addFile(relativePath);
  addFile('README.md');
  addFile('docs/images/diagrams/图集索引.md');
  addFile('frontend/package.json');
  addFile('frontend/src/main.js');

  const readme = read(path.join(projectRoot, 'README.md'));
  for (const command of ['npm run check:ws', 'npm run check:audit', 'npm run check:docs']) {
    expect(readme.includes(command), `README 缺少验收命令 ${command}`);
  }
  const packageJson = JSON.parse(read(path.join(projectRoot, 'frontend/package.json')));
  const commands = {
    'check:ws': '../scripts/ws-authorization-check.mjs',
    'check:audit': '../scripts/audit-integrity-check.mjs',
    'check:docs': '../scripts/docs-baseline-check.mjs'
  };
  for (const [name, script] of Object.entries(commands)) {
    expect(packageJson.scripts?.[name] === `node ${script}`, `frontend/package.json 中 ${name} 命令不正确`);
    const scriptFile = path.join(projectRoot, script.replace(/^\.\.\//, ''));
    expect(fs.existsSync(scriptFile), `缺少验收脚本：${script}`);
  }

  const frontend = read(path.join(projectRoot, 'frontend/src/main.js'));
  expect(frontend.includes('masked/${state.session.refId}'), '前端未订阅患者专属 WebSocket 主题');
  expect(frontend.includes('loadWorkspace().finally'), '前端启动遮罩仍依赖固定时延而非首屏加载完成条件');
  expect(frontend.includes('<span class="tag">V1.7</span>'), '管理台版本边界未更新到 V1.7');

  const publisher = read(path.join(projectRoot,
    'src/main/java/com/hospital/outpatient/queue/QueueEventPublisher.java'));
  expect(publisher.includes('prefix + "/masked/" + patientId'), '后端未广播患者专属 WebSocket 主题');
  expect(!publisher.includes('prefix + "/masked"'), '后端仍广播旧的患者共享 masked 主题');

  const interceptor = read(path.join(projectRoot,
    'src/main/java/com/hospital/outpatient/queue/WebSocketAuthInterceptor.java'));
  expect(interceptor.includes('"PATIENT".equals(role)') && interceptor.includes('患者无权订阅员工完整叫号队列'),
    'WebSocket 拦截器缺少患者完整主题拒绝规则');

  const auditService = read(path.join(projectRoot,
    'src/main/java/com/hospital/outpatient/audit/AuditService.java'));
  expect(auditService.includes('AuthUser.system()'), '审计服务缺少 SYSTEM 身份降级');
  expect(auditService.includes('pendingEntries') && auditService.includes('Propagation.REQUIRES_NEW')
    && !auditService.includes('afterCommit'), '审计服务不是「业务事务登记 + 外层切面释放连接后独立事务」语义');
  const auditAspect = read(path.join(projectRoot,
    'src/main/java/com/hospital/outpatient/audit/AuditFlushAspect.java'));
  expect(auditAspect.includes('@Around') && auditAspect.includes('drainPendingEntries')
    && auditAspect.includes('Scheduled'),
  '审计外层切面缺少 Controller/定时任务事务释放后的刷出逻辑');

  const diagramIndex = read(path.join(imagesDir, 'diagrams/图集索引.md'));
  expect(diagramIndex.includes('图源基线：PRD V1.7'), '图集索引未同步 PRD V1.7');
  const svgCount = fs.readdirSync(path.join(imagesDir, 'diagrams')).filter(name => name.endsWith('.svg')).length;
  const pngCount = fs.readdirSync(path.join(imagesDir, 'diagrams')).filter(name => name.endsWith('.png')).length;
  report.checks.diagramAssets = { svgCount, pngCount };
  expect(svgCount === 33 && pngCount === 33, `图集资产不是 33 份 SVG + 33 份 PNG：${svgCount}/${pngCount}`);

  const expectedReports = [
    'ui-acceptance-report.json', 'ui-dynamic-acceptance-report.json',
    'frontend-split-acceptance-report.json', 'registration-cancel-refund-report.json',
    'admin-maintenance-report.json', 'read-only-connectivity-report.json',
    'concurrency-acceptance-report.json', 'perf-50-concurrency-report.json',
    'mermaid-export-report.json', 'ws-authorization-report.json',
    'audit-integrity-report.json'
  ];
  const reports = {};
  for (const name of expectedReports) {
    const file = path.join(imagesDir, name);
    if (!fs.existsSync(file)) continue;
    let json;
    try { json = JSON.parse(read(file)); } catch (error) {
      expect(false, `${name} 不是有效 JSON：${error.message}`);
      continue;
    }
    reports[name] = {
      passed: json.passed === true,
      baseline: json.baseline ?? null
    };
    expect(json.passed === true, `${name} 的 passed 不为 true`);
    if (json.baseline != null) {
      expect(String(json.baseline).includes('V1.7'), `${name} 的 baseline 未同步 V1.7`);
    }
  }
  // 自身报告由本次运行生成，不要求运行前已存在，避免出现首次执行必然失败的自阻断言。
  const selfReport = { passed: report.errors.length === 0, baseline: report.baseline };
  report.checks.reports = reports;
  for (const name of expectedReports) {
    expect(!!reports[name], `缺少正式机器报告：${name}`);
  }

  report.checks.reports[path.basename(reportFile)] = selfReport;
  report.passed = report.errors.length === 0;
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log('DOCS_BASELINE_ACCEPTANCE', report.passed ? 'PASS' : 'FAIL', JSON.stringify(report.errors));
  if (!report.passed) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  report.fatal = error.stack || error.message;
  report.errors.push(`验收中断：${error.message}`);
  report.passed = false;
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log('DOCS_BASELINE_ACCEPTANCE FAIL', JSON.stringify(report.errors));
  process.exitCode = 1;
}
