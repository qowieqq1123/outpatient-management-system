import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(scriptDir, '..');
export const docsDir = path.join(projectRoot, 'docs');
export const defaultImagesDir = path.join(docsDir, 'images');
export const mermaidUmdPath = path.join(scriptDir, 'mermaid.min.js');

// 固定图号与文件名，避免文档顺序变化时导出文件漂移；新增图必须同步追加元数据。
const DIAGRAM_META = [
  { doc: '01-产品需求文档PRD.md', id: 'PRD-01', slug: 'role-usecase', title: '角色—用例总图（20 个用例与 include/extend）' },
  { doc: '01-产品需求文档PRD.md', id: 'PRD-02', slug: 'user-journeys', title: '三条主用户旅程（自费 / 医保失败重试 / 过号）' },
  { doc: '01-产品需求文档PRD.md', id: 'PRD-03', slug: 'functional-map', title: '功能域与界面验收热区' },
  { doc: '01-产品需求文档PRD.md', id: 'PRD-04', slug: 'scope-boundary', title: '范围边界与可替换外部接口' },
  { doc: '02-概要设计说明书-SC结构图.md', id: 'SC-LAYER-01', slug: 'layered-architecture', title: '分层架构图' },
  { doc: '02-概要设计说明书-SC结构图.md', id: 'SC-RUN-01', slug: 'runtime-view', title: '当前运行视图（前后端分离）' },
  { doc: '02-概要设计说明书-SC结构图.md', id: 'SC-DEP-01', slug: 'deployment-view', title: '运行时部署图' },
  { doc: '02-概要设计说明书-SC结构图.md', id: 'SC-MOD-TOP', slug: 'top-level-structure', title: '顶层 SC 结构图' },
  { doc: '02-概要设计说明书-SC结构图.md', id: 'SC-MOD-01', slug: 'package-module-map', title: '当前代码包与模块映射' },
  { doc: '02-概要设计说明书-SC结构图.md', id: 'SC-API-01', slug: 'workspace-api-map', title: '六个工作台的主要 API 调用' },
  { doc: '03-详细设计说明书-SD时序图与状态图.md', id: 'SD-01', slug: 'online-registration', title: '在线挂号（含号源并发占用）' },
  { doc: '03-详细设计说明书-SD时序图与状态图.md', id: 'SD-02', slug: 'triage-call', title: '分诊报到与叫号' },
  { doc: '03-详细设计说明书-SD时序图与状态图.md', id: 'SD-03', slug: 'missed-call-reorder', title: '过号判定与重排' },
  { doc: '03-详细设计说明书-SD时序图与状态图.md', id: 'SD-04', slug: 'doctor-visit', title: '医生接诊：病历、多张处方与检查单' },
  { doc: '03-详细设计说明书-SD时序图与状态图.md', id: 'SD-05', slug: 'billing-insurance', title: '划价收费与医保结算（含失败重试）' },
  { doc: '03-详细设计说明书-SD时序图与状态图.md', id: 'SD-06', slug: 'prescription-dispense', title: '处方审核、双人签字与发药退药' },
  { doc: '03-详细设计说明书-SD时序图与状态图.md', id: 'SD-07', slug: 'registration-refund', title: '退号退费' },
  { doc: '03-详细设计说明书-SD时序图与状态图.md', id: 'SD-07A', slug: 'patient-cancel', title: '患者取消挂号' },
  { doc: '03-详细设计说明书-SD时序图与状态图.md', id: 'STD-01', slug: 'registration-state', title: '挂号单状态机' },
  { doc: '03-详细设计说明书-SD时序图与状态图.md', id: 'STD-02', slug: 'prescription-state', title: '处方状态机' },
  { doc: '03-详细设计说明书-SD时序图与状态图.md', id: 'STD-03', slug: 'fee-bill-state', title: '收费单状态机' },
  { doc: '03-详细设计说明书-SD时序图与状态图.md', id: 'STD-04', slug: 'visit-state', title: '就诊状态机' },
  { doc: '03-详细设计说明书-SD时序图与状态图.md', id: 'SD-08', slug: 'jwt-authentication', title: 'JWT 登录与鉴权' },
  { doc: '03-详细设计说明书-SD时序图与状态图.md', id: 'SD-09', slug: 'websocket-queue', title: 'WebSocket 实时叫号' },
  { doc: '03-详细设计说明书-SD时序图与状态图.md', id: 'SD-10', slug: 'stock-lock-extension', title: '库存锁定与发药 [扩展设计]' },
  { doc: '03-详细设计说明书-SD时序图与状态图.md', id: 'SD-11', slug: 'idempotent-registration-extension', title: '幂等挂号 [扩展设计]' },
  { doc: '03-详细设计说明书-SD时序图与状态图.md', id: 'SD-12', slug: 'insurance-retry', title: '医保失败与原单重试' },
  { doc: '03-详细设计说明书-SD时序图与状态图.md', id: 'SD-13', slug: 'independent-audit', title: '审计日志独立事务' },
  { doc: '03-详细设计说明书-SD时序图与状态图.md', id: 'SD-14', slug: 'frontend-fallback', title: '前端首屏、JWT 失效与看板降级' },
  { doc: '03-详细设计说明书-SD时序图与状态图.md', id: 'SD-15', slug: 'admin-maintenance', title: '管理员维护用户、角色与排班' },
  { doc: '04-数据库设计说明书.md', id: 'ER-全局', slug: 'global-er', title: 'ER 全局图' },
  { doc: '07-前后端分离架构与部署说明.md', id: 'DEP-01', slug: 'dev-runtime', title: '开发运行时拓扑' },
  { doc: '07-前后端分离架构与部署说明.md', id: 'DEP-02', slug: 'production-runtime', title: '生产/演示运行时拓扑' }
];

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

/** 扫描全部设计文档，按文档顺序把 Mermaid 块与固定元数据一一对应。 */
export function collectDiagrams() {
  const docNames = fs.readdirSync(docsDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => entry.name)
    .sort();
  const blocks = [];
  for (const docName of docNames) {
    const sourcePath = path.join(docsDir, docName);
    const text = fs.readFileSync(sourcePath, 'utf8');
    for (const match of text.matchAll(/```mermaid[ \t]*\r?\n([\s\S]*?)\r?\n```/g)) {
      const prefix = text.slice(0, match.index);
      blocks.push({
        doc: docName,
        sourcePath,
        sourceLine: prefix.split(/\r?\n/).length,
        code: `${match[1]}\n`,
        type: match[1].trimStart().split(/\s+/)[0] || 'unknown'
      });
    }
  }
  if (blocks.length !== DIAGRAM_META.length) {
    throw new Error(`Mermaid 图源数量应为 ${DIAGRAM_META.length}，实际 ${blocks.length}；请检查文档与 mermaid-diagrams.mjs 元数据`);
  }
  const diagrams = blocks.map((block, index) => {
    const meta = DIAGRAM_META[index];
    if (meta.doc !== block.doc) {
      throw new Error(`第 ${index + 1} 张图的源文档应为 ${meta.doc}，实际 ${block.doc}`);
    }
    const sequence = String(index + 1).padStart(2, '0');
    const baseName = `${sequence}-${meta.id}-${meta.slug}`;
    return {
      ...block,
      ...meta,
      sequence: index + 1,
      baseName,
      svgName: `${baseName}.svg`,
      pngName: `${baseName}.png`,
      sourceSha256: sha256(block.code),
      sourceRelative: `docs/${block.doc}`
    };
  });
  const ids = new Set(diagrams.map(item => item.id));
  const names = new Set(diagrams.flatMap(item => [item.svgName, item.pngName]));
  if (ids.size !== diagrams.length || names.size !== diagrams.length * 2) {
    throw new Error('图号或导出文件名存在重复');
  }
  return diagrams;
}

export function resolveImagesDir() {
  return path.resolve(process.env.UI_OUT_DIR || defaultImagesDir);
}

export function resolveCdpPort(argvPort) {
  const value = process.env.MERMAID_CDP_PORT || argvPort || 9225;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`CDP 端口无效：${value}`);
  return port;
}
