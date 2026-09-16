import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const fail = (message) => {
  console.error(`ARCHITECTURE CHECK FAILED: ${message}`);
  process.exitCode = 1;
};

const removedFiles = [
  'src/engine/rowOptimizer.ts',
  'src/engine/zoneHeightOptimizer.ts',
  'src/engine/shapeOptimizer.ts',
  'src/LocationSelectionBridge.tsx',
  'src/PalletFooterSummaryBridge.tsx',
  'src/CertificationResultSummaryBridge.tsx',
  'src/AutoCertificationBridge.tsx',
  'src/CertifiedExportConsistencyBridge.tsx',
  'src/DashboardRuntimeEnhancer.tsx',
  'src/dashboard-runtime.css',
  'src/transport-equipment-scroll-fix.css',
  'src/ux-review-improvements.css',
  'src/ux-review-phase2.css',
];

for (const path of removedFiles) {
  if (existsSync(path)) fail(`${path} must not be restored. Keep behavior in the owning feature stylesheet, React component, or domain store instead.`);
}

if (!existsSync('src/tokens.css')) fail('src/tokens.css is required for the shared typography scale.');
if (!existsSync('src/store/externalStore.ts')) fail('src/store/externalStore.ts is required for domain state migration.');
if (!existsSync('src/palletSnapshotStore.ts')) fail('src/palletSnapshotStore.ts is required for pallet domain state.');

const bridgeFiles = readdirSync('src')
  .filter((name) => name.endsWith('Bridge.tsx'))
  .map((name) => join('src', name));
const forbiddenBridgePatterns = [
  ['MutationObserver', /\bMutationObserver\b/],
  ['querySelector', /\bquerySelector(?:All)?\s*\(/],
  ['createElement', /\bdocument\.createElement\s*\(/],
  ['replaceChildren', /\.replaceChildren\s*\(/],
  ['insertAdjacentElement', /\.insertAdjacentElement\s*\(/],
];

for (const path of bridgeFiles) {
  const source = readFileSync(path, 'utf8');
  for (const [label, pattern] of forbiddenBridgePatterns) {
    if (pattern.test(source)) fail(`${path} uses ${label}; Bridge components must not discover or mutate React DOM.`);
  }
}

const tokenizedCss = [
  'src/styles.css',
  'src/dashboard-mockup.css',
  'src/workspace-tools.css',
  'src/reference-viewer.css',
  'src/transport-equipment.css',
  'src/transport-equipment-selection-ux.css',
  'src/guided-workflow-v2.css',
  'src/guided-loading-strategy.css',
  'src/guided-loading-unit.css',
  'src/guided-result-tabs-enhancer.css',
  'src/minimap.css',
  'src/pallet-footer-summary.css',
];
for (const path of tokenizedCss) {
  const source = readFileSync(path, 'utf8');
  if (/font-size\s*:\s*(?:8|9|10)px\b/.test(source)) {
    fail(`${path} reintroduced 8-10px typography after token migration.`);
  }
}

const mainSource = readFileSync('src/main.tsx', 'utf8');
if (mainSource.includes("import './transport-equipment-scroll-fix.css';")) {
  fail('main.tsx must not restore transport-equipment-scroll-fix.css; scrolling belongs to transport-equipment.css.');
}
if (/import ['"]\.\/ux-review.*\.css['"]/.test(mainSource)) {
  fail('main.tsx must not import temporary ux-review stylesheets after ownership migration.');
}

const reviewCssNames = readdirSync('src').filter((name) => /^ux-review.*\.css$/.test(name));
if (reviewCssNames.length > 0) {
  fail(`Temporary UX review stylesheets must stay removed (${reviewCssNames.join(', ')}). Put rules in the owning feature stylesheet.`);
}

const tsxFiles = readdirSync('src').filter((name) => name.endsWith('.tsx')).map((name) => join('src', name));
const legacyWorkspaceClasses = [
  ['workspace', /className\s*=\s*["'][^"']*\bworkspace\b/],
  ['panel', /className\s*=\s*["'][^"']*\bpanel\b/],
  ['left-panel', /className\s*=\s*["'][^"']*\bleft-panel\b/],
  ['right-panel', /className\s*=\s*["'][^"']*\bright-panel\b/],
];
for (const path of tsxFiles) {
  const source = readFileSync(path, 'utf8');
  for (const [className, pattern] of legacyWorkspaceClasses) {
    if (pattern.test(source)) fail(`${path} restored legacy .${className}; use dashboard/workspace-tools layout classes instead.`);
  }
}

const stylesSource = readFileSync('src/styles.css', 'utf8');
for (const [className] of legacyWorkspaceClasses) {
  const selectorPattern = new RegExp(`\\.${className}\\b`);
  if (selectorPattern.test(stylesSource)) {
    fail(`src/styles.css restored legacy .${className} layout rules; keep the dashboard/workspace-tools layout as the only owner.`);
  }
}

const guidedWorkflowV2 = readFileSync('src/guided-workflow-v2.css', 'utf8');
if (!/grid-template-columns\s*:\s*repeat\(6,\s*minmax\(118px,\s*1fr\)\)/.test(guidedWorkflowV2)) {
  fail('src/guided-workflow-v2.css must own the mobile six-step guided rail.');
}
if (!/max-height\s*:\s*clamp\(320px,\s*42vh,\s*560px\)/.test(guidedWorkflowV2)) {
  fail('src/guided-workflow-v2.css must keep product results inside a bounded scrolling region.');
}
if (!/grid-template-columns\s*:\s*280px\s+minmax\(720px,\s*1fr\)\s+360px/.test(guidedWorkflowV2)) {
  fail('src/guided-workflow-v2.css must own the reviewed desktop guided-shell proportions.');
}
if (!/\.guided-primary-cta\s*\{[^}]*min-height\s*:\s*var\(--control-height-lg,\s*44px\)/s.test(guidedWorkflowV2)) {
  fail('src/guided-workflow-v2.css must keep the primary CTA at the accessible control height.');
}

const guidedResults = readFileSync('src/guided-result-tabs-enhancer.css', 'utf8');
if (!/\.guided-unloaded-list\s*\{[^}]*max-height\s*:\s*min\(360px,\s*36vh\)/s.test(guidedResults)) {
  fail('src/guided-result-tabs-enhancer.css must own bounded scrolling for unloaded results.');
}
if (!/\.guided-result-grid>div:nth-child\(-n \+ 3\)\s*\{[^}]*min-height\s*:\s*96px/s.test(guidedResults)) {
  fail('src/guided-result-tabs-enhancer.css must keep the three primary result metrics visually prioritized.');
}

if (!process.exitCode) console.log(`Architecture check passed · ${bridgeFiles.length} remaining Bridge component(s) inspected · temporary UX review styles removed.`);