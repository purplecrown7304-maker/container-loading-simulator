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
  'src/DashboardRuntimeEnhancer.tsx',
  'src/dashboard-runtime.css',
];

for (const path of removedFiles) {
  if (existsSync(path)) fail(`${path} must not be restored. Use block-first generation, React state/components, or the domain store instead.`);
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
  'src/dashboard-mockup.css',
  'src/workspace-tools.css',
  'src/minimap.css',
  'src/pallet-footer-summary.css',
];
for (const path of tokenizedCss) {
  const source = readFileSync(path, 'utf8');
  if (/font-size\s*:\s*(?:8|9|10)px\b/.test(source)) {
    fail(`${path} reintroduced 8-10px typography after token migration.`);
  }
}

if (!process.exitCode) console.log(`Architecture check passed · ${bridgeFiles.length} remaining Bridge component(s) inspected.`);
