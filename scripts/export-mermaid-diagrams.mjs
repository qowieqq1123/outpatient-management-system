import fs from 'node:fs';
import path from 'node:path';
import { collectDiagrams, resolveCdpPort, resolveImagesDir } from './mermaid-diagrams.mjs';
import { withMermaidPage, defineDiagramRenderer } from './mermaid-browser.mjs';

const debugPort = resolveCdpPort(process.argv[2]);
const imagesDir = resolveImagesDir();
const diagramsDir = path.join(imagesDir, 'diagrams');
const reportFile = path.join(imagesDir, 'mermaid-export-report.json');
const indexPath = path.join(diagramsDir, '图集索引.md');
const generatedAt = new Date().toISOString();
const report = {
  scenario: 'AC-25 / 全量 Mermaid 图集导出',
  baseline: 'V1.7',
  generatedAt,
  cdpPort: debugPort,
  mermaidVersion: null,
  sourceDocumentCount: 0,
  total: 0,
  svgCount: 0,
  pngCount: 0,
  diagrams: [],
  errors: [],
  cleanup: [],
  passed: false
};

const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const expect = (ok, message) => { if (!ok) report.errors.push(message); };
const escapeCell = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
const relative = absolutePath => path.relative(imagesDir, absolutePath).replaceAll(path.sep, '/');

/** SVG 须有根标签与显式尺寸，PNG 只接受真实二进制而非错误页文本。 */
function validateFiles(diagram) {
  const svgPath = path.join(diagramsDir, diagram.svgName);
  const pngPath = path.join(diagramsDir, diagram.pngName);
  const svg = fs.readFileSync(svgPath);
  const png = fs.readFileSync(pngPath);
  const svgText = svg.toString('utf8');
  const validSvg = svg.length > 200 && svgText.includes('<svg') && svgText.includes('</svg>') && svgText.includes(`width="${diagram.width}"`);
  const validPng = png.length > 100 && png.subarray(0, 8).equals(pngMagic);
  expect(validSvg, `${diagram.id} 的 SVG 为空、不完整或缺少显式尺寸`);
  expect(validPng, `${diagram.id} 的 PNG 为空或文件头不正确`);
  return {
    svg: { file: `docs/images/diagrams/${diagram.svgName}`, bytes: svg.length },
    png: { file: `docs/images/diagrams/${diagram.pngName}`, bytes: png.length }
  };
}

function writeIndex(rows) {
  const lines = [
    '# 设计图集导出索引',
    '',
    `生成时间：${generatedAt}  `,
    `图源基线：PRD V1.7；共 ${rows.length} 张图，每张包含 SVG 与 PNG 两种格式。`,
    '',
    '图源以 `docs/*.md` 的 Mermaid 代码块为准；导出文件为派生证据，不替代源文档。',
    '',
    '| 序号 | 图号 | 标题 | 类型 | 源文档与行号 | SVG | PNG | 尺寸 |',
    '| ---: | --- | --- | --- | --- | --- | --- | --- |'
  ];
  for (const row of rows) {
    lines.push(`| ${row.sequence} | \`${escapeCell(row.id)}\` | ${escapeCell(row.title)} | \`${row.type}\` | \`${row.source}\`:${row.sourceLine} | \`${row.svg.file}\` | \`${row.png.file}\` | ${row.width} × ${row.height} |`);
  }
  lines.push('', 'Word 报告优先插入 PNG；需要无损缩放时使用 SVG。若修改图意，先改源文档再运行 `npm run check:diagrams`。', '');
  fs.writeFileSync(indexPath, `${lines.join('\n')}\n`, 'utf8');
}

function loadReusableExports(diagrams) {
  const previousPath = reportFile;
  if (!fs.existsSync(previousPath)) return { reusable: [], pending: diagrams };
  try {
    const previous = JSON.parse(fs.readFileSync(previousPath, 'utf8'));
    const previousRows = new Map((previous.diagrams || []).map(row => [row.id, row]));
    const reusable = [];
    const pending = [];
    for (const diagram of diagrams) {
      const row = previousRows.get(diagram.id);
      const svgPath = path.join(diagramsDir, diagram.svgName);
      const pngPath = path.join(diagramsDir, diagram.pngName);
      if (!row || row.sourceSha256 !== diagram.sourceSha256
          || !fs.existsSync(svgPath) || !fs.existsSync(pngPath)) {
        pending.push(diagram);
        continue;
      }
      const files = validateFiles({ ...diagram, width: row.width, height: row.height });
      reusable.push({
        sequence: diagram.sequence,
        id: diagram.id,
        title: diagram.title,
        type: diagram.type,
        source: diagram.sourceRelative,
        sourceLine: diagram.sourceLine,
        sourceSha256: diagram.sourceSha256,
        width: row.width,
        height: row.height,
        ...files
      });
    }
    return { reusable, pending };
  } catch {
    return { reusable: [], pending: diagrams };
  }
}

async function exportOne(diagram, context) {
  const { evaluate, send } = context;
  const rendered = await evaluate(`window.__renderOne(${JSON.stringify(diagram.code)}, ${JSON.stringify(diagram.sequence)})`, true);
  if (!rendered?.svgText || !rendered.width || !rendered.height) throw new Error('未返回 SVG 或尺寸');
  const svgPath = path.join(diagramsDir, diagram.svgName);
  const pngPath = path.join(diagramsDir, diagram.pngName);
  fs.writeFileSync(svgPath, rendered.svgText, 'utf8');

  await send('Emulation.setDeviceMetricsOverride', {
    width: Math.ceil(rendered.width),
    height: Math.ceil(rendered.height),
    deviceScaleFactor: 1,
    mobile: false
  });
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  if (!shot?.data) throw new Error('浏览器未返回截图数据');
  fs.writeFileSync(pngPath, Buffer.from(shot.data, 'base64'));

  const row = { ...diagram, width: Math.ceil(rendered.width), height: Math.ceil(rendered.height) };
  const files = validateFiles(row);
  report.svgCount++;
  report.pngCount++;
  report.diagrams.push({
    sequence: row.sequence,
    id: row.id,
    title: row.title,
    type: row.type,
    source: row.sourceRelative,
    sourceLine: row.sourceLine,
    sourceSha256: row.sourceSha256,
    width: row.width,
    height: row.height,
    ...files
  });
  console.log(`EXPORT ${String(row.sequence).padStart(2, '0')}/${report.total} ${row.id} ${row.width}x${row.height}`);
}

async function cleanupStaleFiles(expectedNames) {
  const allowed = new Set(expectedNames);
  const removed = [];
  for (const name of fs.readdirSync(diagramsDir)) {
    if (!/\.(svg|png)$/i.test(name) || allowed.has(name)) continue;
    fs.rmSync(path.join(diagramsDir, name));
    removed.push(name);
  }
  report.cleanup.push({ status: 'PASS', removedStaleExports: removed });
}

async function main() {
  fs.mkdirSync(diagramsDir, { recursive: true });
  let diagrams = [];
  try {
    diagrams = collectDiagrams();
    report.total = diagrams.length;
    report.sourceDocumentCount = new Set(diagrams.map(item => item.doc)).size;
    expect(report.total === 33, `全量图源应为 33 张，实际 ${report.total} 张`);

    const cached = loadReusableExports(diagrams);
    report.diagrams.push(...cached.reusable);
    report.svgCount += cached.reusable.length;
    report.pngCount += cached.reusable.length;
    if (cached.pending.length) {
      await withMermaidPage(debugPort, async context => {
        report.mermaidVersion = context.mermaidVersion;
        await defineDiagramRenderer(context.evaluate);
        for (const diagram of cached.pending) {
          try {
            await exportOne(diagram, context);
          } catch (error) {
            report.errors.push(`${diagram.id} 导出失败：${error.message}`);
          }
        }
      });
    }
    report.diagrams.sort((a, b) => a.sequence - b.sequence);

    expect(report.svgCount === report.total, `SVG 应为 ${report.total} 份，实际 ${report.svgCount} 份`);
    expect(report.pngCount === report.total, `PNG 应为 ${report.total} 份，实际 ${report.pngCount} 份`);
    writeIndex(report.diagrams);
    expect(fs.statSync(indexPath).size > 100, '图集索引未正确生成');
    await cleanupStaleFiles(report.diagrams.flatMap(item => [
      path.basename(item.svg.file),
      path.basename(item.png.file)
    ]));
  } catch (error) {
    report.fatal = error.stack || error.message;
    report.errors.push(`图集导出中断：${error.message}`);
  } finally {
    report.passed = report.errors.length === 0;
    fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log('MERMAID_EXPORT', report.passed ? 'PASS' : 'FAIL', JSON.stringify(report.errors));
    if (!report.passed) process.exitCode = 1;
  }
}

main();
