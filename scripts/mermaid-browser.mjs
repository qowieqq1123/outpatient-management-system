import fs from 'node:fs';
import { mermaidUmdPath } from './mermaid-diagrams.mjs';

/** 创建独立的 about:blank CDP 标签，注入本地 Mermaid UMD，结束后关闭标签。 */
export async function withMermaidPage(debugPort, callback) {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' });
  if (!response.ok) throw new Error(`无法创建 CDP 标签：HTTP ${response.status}`);
  const target = await response.json();
  if (!target.webSocketDebuggerUrl) throw new Error('CDP 标签未返回 webSocketDebuggerUrl');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let nextId = 0;
  const pending = new Map();
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
  };
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('CDP WebSocket 连接失败'));
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression, awaitPromise = false) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails;
      const description = detail.exception?.description || detail.text;
      throw new Error(`浏览器执行失败：${description}`);
    }
    return result.result?.value;
  };

  try {
    await send('Runtime.enable');
    await send('Page.enable');
    const umd = fs.readFileSync(mermaidUmdPath, 'utf8');
    const version = await evaluate(`(() => {
      const script = document.createElement('script');
      script.textContent = ${JSON.stringify(umd)};
      document.head.appendChild(script);
      if (!window.mermaid) throw new Error('Mermaid UMD 未加载');
      window.mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        theme: 'default',
        maxTextSize: 200000,
        themeVariables: { fontFamily: '"Microsoft YaHei", "Noto Sans CJK SC", sans-serif' },
        flowchart: { htmlLabels: true, useMaxWidth: false },
        sequence: { useMaxWidth: false },
        state: { useMaxWidth: false },
        er: { useMaxWidth: false }
      });
      document.documentElement.style.cssText = 'margin:0;padding:0;background:#fff;overflow:hidden';
      document.body.style.cssText = 'margin:0;padding:0;background:#fff;overflow:hidden';
      return window.mermaid.version || 'unknown';
    })()`);
    return await callback({ send, evaluate, mermaidVersion: version, targetId: target.id });
  } finally {
    try { ws.close(); } catch { /* 标签已关闭时忽略 */ }
    try { await fetch(`http://127.0.0.1:${debugPort}/json/close/${target.id}`); } catch { /* CDP 已退出时忽略 */ }
  }
}

/** 一次性定义渲染函数：把 Mermaid SVG 显式定宽、白底，供后续截图。 */
export async function defineDiagramRenderer(evaluate) {
  await evaluate(`(() => {
    window.__renderOne = async (code, id) => {
      const result = await window.mermaid.render('mmd-' + id, code);
      const holder = document.createElement('div');
      holder.innerHTML = result.svg || String(result);
      const svg = holder.querySelector('svg');
      if (!svg) throw new Error('Mermaid 未返回 SVG');
      const viewBox = (svg.getAttribute('viewBox') || '').trim().split(/[\\s,]+/).map(Number);
      const inlineStyle = svg.getAttribute('style') || '';
      const maxWidth = Number((/max-width:\\s*([0-9.]+)px/.exec(inlineStyle) || [])[1] || 0);
      let width = Number.parseFloat(svg.getAttribute('width'));
      let height = Number.parseFloat(svg.getAttribute('height'));
      if (!Number.isFinite(width) || width < 100) width = maxWidth || viewBox[2] || 1200;
      if (!Number.isFinite(height) || height < 100) height = viewBox[3] || 800;
      width = Math.ceil(width);
      height = Math.ceil(height);
      if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
      svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      svg.setAttribute('width', String(width));
      svg.setAttribute('height', String(height));
      svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');
      svg.style.width = width + 'px';
      svg.style.height = height + 'px';
      svg.style.maxWidth = 'none';
      svg.style.backgroundColor = '#ffffff';
      svg.style.display = 'block';
      const svgText = '<?xml version="1.0" encoding="UTF-8"?>\\n' + new XMLSerializer().serializeToString(svg);
      document.body.replaceChildren();
      const box = document.createElement('div');
      box.id = 'render-target';
      box.style.cssText = 'display:inline-block;background:#fff;overflow:hidden;width:' + width + 'px;height:' + height + 'px';
      box.appendChild(svg);
      document.body.appendChild(box);
      await document.fonts.ready;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { svgText, width, height };
    };
    return true;
  })()`);
}
