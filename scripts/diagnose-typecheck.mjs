import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const run = spawnSync('npx', ['tsc', '--noEmit', '-p', 'tsconfig.app.json', '--pretty', 'false'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
});
const output = `${run.stdout ?? ''}${run.stderr ?? ''}`.trim() || 'TypeScript completed without diagnostics.';
const escapeHtml = (value) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');
mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', `<!doctype html><html><head><meta charset="utf-8"><title>Typecheck diagnostics</title><style>body{font-family:ui-monospace,monospace;margin:24px;white-space:pre-wrap}h1{font-family:system-ui,sans-serif}</style></head><body><h1>Typecheck diagnostics · exit ${run.status ?? 'unknown'}</h1><pre>${escapeHtml(output)}</pre></body></html>`);
console.log(output);
// Diagnostic preview intentionally exits 0 so the generated page can be inspected.
process.exit(0);
