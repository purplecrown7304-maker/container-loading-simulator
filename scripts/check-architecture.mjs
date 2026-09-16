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
  'src/reference-viewer.css',
  'src/transport-equipment.css',
  'src/transport-equipment-selection-ux.css',
  'src/minimap.css',
  'src/pallet-footer-summary.css',
];
for (const path of tokenizedCss) {
  const source = readFileSync(path, 'utf8');
  if (/font-size\s*:\s*(?:8|9|10)px\b/.test(source)) {
    fail(`${path} reintroduced 8-10px typography after token migration.`);
  }
}

const uxReviewCss = [
  'src/ux-review-improvements.css',
  'src/ux-review-phase2.css',
];
for (const path of uxReviewCss) {
  if (!existsSync(path)) fail(`${path} is required while the UX review migration is active.`);
  const source = existsSync(path) ? readFileSync(path, 'utf8') : '';
  if (/font-size\s*:\s*(?:[0-9](?:\.\d+)?)px\b/.test(source)) {
    fail(`${path} must not introduce typography below 10px. Use shared font tokens instead.`);
  }
}

if (existsSync('src/ux-review-phase2.css')) {
  const phase2 = readFileSync('src/ux-review-phase2.css', 'utf8');
  if (/!important\b/.test(phase2)) {
    fail('src/ux-review-phase2.css must not add new !important declarations. Resolve specificity in the owning feature stylesheet instead.');
  }
}

const migratedOwnerRules = [
  ['.reference-selected', 'src/reference-viewer.css'],
  ['.preview-view-controls', 'src/reference-viewer.css'],
  ['.workspace-modal', 'src/workspace-tools.css'],
  ['.catalog-wrap', 'src/workspace-tools.css'],
  ['.guided-equipment-type-label', 'src/transport-equipment-selection-ux.css'],
  ['.transport-selector-modal', 'src/transport-equipment.css'],
];
for (const reviewPath of uxReviewCss) {
  const source = existsSync(reviewPath) ? readFileSync(reviewPath, 'utf8') : '';
  for (const [selector, owner] of migratedOwnerRules) {
    if (source.includes(selector)) {
      fail(`${reviewPath} reintroduced ${selector}; keep that rule in ${owner}.`);
    }
  }
}

const mainSource = readFileSync('src/main.tsx', 'utf8');
if (mainSource.includes("import './transport-equipment-scroll-fix.css';")) {
  fail('main.tsx must not restore transport-equipment-scroll-fix.css; scrolling belongs to transport-equipment.css.');
}

const review1Import = "import './ux-review-improvements.css';";
const review2Import = "import './ux-review-phase2.css';";
const review1Index = mainSource.indexOf(review1Import);
const review2Index = mainSource.indexOf(review2Import);
if (review1Index < 0 || review2Index < 0) {
  fail('main.tsx must load both UX review stylesheets while the staged migration is active.');
} else if (review2Index < review1Index) {
  fail('ux-review-phase2.css must load after ux-review-improvements.css.');
}

const reviewCssNames = readdirSync('src').filter((name) => /^ux-review.*\.css$/.test(name));
if (reviewCssNames.length > 2) {
  fail(`Do not add another UX override layer (${reviewCssNames.join(', ')}). Move new rules into an existing review file or the owning feature stylesheet.`);
}

const reviewCssCombined = uxReviewCss
  .filter((path) => existsSync(path))
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n');
if (!/grid-template-columns\s*:\s*repeat\(6,\s*minmax\(118px,\s*1fr\)\)/.test(reviewCssCombined)) {
  fail('The mobile guided step rail must remain a six-step layout.');
}

if (!process.exitCode) console.log(`Architecture check passed · ${bridgeFiles.length} remaining Bridge component(s) inspected · ${reviewCssNames.length} UX review stylesheet(s) guarded.`);
