import { collectDiagrams, resolveCdpPort } from './mermaid-diagrams.mjs';
import { withMermaidPage } from './mermaid-browser.mjs';

const debugPort = resolveCdpPort(process.argv[2]);
const diagrams = collectDiagrams();
const result = { baseline: 'V1.7', total: diagrams.length, failed: 0, failures: [], mermaidVersion: null };

try {
  await withMermaidPage(debugPort, async ({ evaluate, mermaidVersion }) => {
    result.mermaidVersion = mermaidVersion;
    const blocks = diagrams.map(({ doc, id, sourceLine, code }) => ({ doc, id, sourceLine, code }));
    const expression = `(async () => {
      const blocks = ${JSON.stringify(blocks)};
      const failures = [];
      for (const block of blocks) {
        try { await window.mermaid.parse(block.code); }
        catch (error) {
          failures.push({ doc: block.doc, id: block.id, sourceLine: block.sourceLine, error: String(error.message || error).slice(0, 300) });
        }
      }
      return failures;
    })()`;
    result.failures = await evaluate(expression, true);
    result.failed = result.failures.length;
  });
} catch (error) {
  result.failed = diagrams.length;
  result.failures.push({ doc: 'CDP', id: 'Mermaid', sourceLine: 0, error: error.message });
}

console.log(JSON.stringify(result, null, 2));
if (result.failed) process.exit(1);
