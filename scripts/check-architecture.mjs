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
if (!existsSync('src/palletTargetRestore.ts')) fail('src/palletTargetRestore.ts is required so guided pallet results/reports survive viewer unmount.');
if (!existsSync('src/guidedWorkflowState.ts')) fail('src/guidedWorkflowState.ts is required for React-owned guided workflow state.');
if (!existsSync('src/guidedLoadingUnitState.ts')) fail('src/guidedLoadingUnitState.ts is required for guided loading-unit state.');
if (!existsSync('src/loading-progress.css')) fail('src/loading-progress.css is required for automatic-loading progress feedback.');

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

const guidedWorkflowState = readFileSync('src/guidedWorkflowState.ts', 'utf8');
if (/\bMutationObserver\b/.test(guidedWorkflowState)) {
  fail('guidedWorkflowState.ts must be React/store-owned and must not reconstruct state by observing DOM attributes.');
}
if (!guidedWorkflowState.includes('createExternalStore')) {
  fail('guidedWorkflowState.ts must use the shared external store as the source of truth.');
}

const loadingUnitState = readFileSync('src/guidedLoadingUnitState.ts', 'utf8');
if (!loadingUnitState.includes('createExternalStore')) {
  fail('guidedLoadingUnitState.ts must use the shared external store.');
}
if (!loadingUnitState.includes('normalizeGuidedLoadingUnit')) {
  fail('guidedLoadingUnitState.ts must normalize persisted loading-unit values before use.');
}

const loadingUnitEnhancer = readFileSync('src/GuidedLoadingUnitEnhancer.tsx', 'utf8');
if (!loadingUnitEnhancer.includes('useGuidedWorkflowState')) {
  fail('GuidedLoadingUnitEnhancer must consume the centralized guided workflow state.');
}
if (!loadingUnitEnhancer.includes('useGuidedLoadingUnit')) {
  fail('GuidedLoadingUnitEnhancer must consume the centralized loading-unit state.');
}
if (/getBoundingClientRect|ResizeObserver|addEventListener\(['"]scroll/.test(loadingUnitEnhancer)) {
  fail('GuidedLoadingUnitEnhancer must not continuously measure viewport geometry; keep the selector in normal document flow.');
}
if (/\.mode-tabs|clickUnderlyingMode/.test(loadingUnitEnhancer)) {
  fail('GuidedLoadingUnitEnhancer must not proxy loading-unit selection through hidden .mode-tabs DOM clicks.');
}

const guidedShellSource = readFileSync('src/GuidedWorkflowShell.tsx', 'utf8');
if (!guidedShellSource.includes('publishGuidedWorkflowState')) {
  fail('GuidedWorkflowShell must publish active/step state through guidedWorkflowState.ts.');
}
if (/document\.documentElement\.dataset\.guided(?:Workflow|Step)\s*=/.test(guidedShellSource)) {
  fail('GuidedWorkflowShell must not write guided DOM dataset attributes directly; publish through guidedWorkflowState.ts instead.');
}
if (!/publishGuidedWorkflowState\(\{\s*active:\s*true,\s*step\s*\}\)/.test(guidedShellSource)) {
  fail('GuidedWorkflowShell must publish each React step transition to the centralized guided workflow state.');
}
if (!/publishGuidedWorkflowState\(\{\s*active:\s*false,\s*step:\s*1\s*\}\)/.test(guidedShellSource)) {
  fail('GuidedWorkflowShell must clear the centralized guided workflow state when it unmounts.');
}
if (!guidedShellSource.includes('useGuidedLoadingUnit') || !guidedShellSource.includes('usePalletSnapshot')) {
  fail('GuidedWorkflowShell must consume loading-unit and pallet snapshot stores instead of reading hidden mode/result DOM state.');
}
if (/currentMode\s*\(|clickMode\s*\(|\.mode-tabs|inspection-status-table|workOrderRow/.test(guidedShellSource)) {
  fail('GuidedWorkflowShell restored DOM-derived mode or inspection status scraping; use domain stores/events instead.');
}
if (!guidedShellSource.includes('INERTIA_CERTIFICATION_EVENT') || !guidedShellSource.includes('FINAL_PHYSICS_VALIDATION_PROGRESS_EVENT')) {
  fail('GuidedWorkflowShell must use explicit validation/certification events for step-5 running/ready state.');
}

const guidedResultEnhancer = readFileSync('src/GuidedResultTabsEnhancer.tsx', 'utf8');
if (!guidedResultEnhancer.includes('useGuidedLoadingUnit') || !guidedResultEnhancer.includes('usePalletSnapshot')) {
  fail('GuidedResultTabsEnhancer must render the active box/pallet result from domain state.');
}
if (/__containerLoadingPalletSnapshot/.test(guidedResultEnhancer)) {
  fail('GuidedResultTabsEnhancer must not read the legacy pallet window mirror; use palletSnapshotStore instead.');
}
if (!guidedResultEnhancer.includes('buildPalletDetail')) {
  fail('GuidedResultTabsEnhancer must rebuild the displayed pallet LoadingResult after the viewer unmounts.');
}

const palletTargetRestore = readFileSync('src/palletTargetRestore.ts', 'utf8');
if (!palletTargetRestore.includes('readPalletSnapshot') || !palletTargetRestore.includes('publishPhysicsTarget')) {
  fail('palletTargetRestore.ts must rebuild and publish the exact pallet physics target from palletSnapshotStore.');
}
const palletWorkerReport = readFileSync('src/palletWorkerReport.ts', 'utf8');
if (!palletWorkerReport.includes('restorePalletPhysicsTarget')) {
  fail('palletWorkerReport.ts must restore a pallet target before result/report certification checks.');
}
const resultsModalEvents = readFileSync('src/resultsModalEvents.ts', 'utf8');
if (!resultsModalEvents.includes('restorePalletPhysicsTarget')) {
  fail('resultsModalEvents.ts must restore a cleared pallet target before opening guided pallet results.');
}

const tokenizedCss = [
  'src/styles.css',
  'src/dashboard-mockup.css',
  'src/workspace-tools.css',
  'src/reference-viewer.css',
  'src/transport-equipment.css',
  'src/transport-equipment-selection-ux.css',
  'src/guided-workflow.css',
  'src/guided-workflow-v2.css',
  'src/guided-loading-strategy.css',
  'src/guided-loading-unit.css',
  'src/guided-result-tabs-enhancer.css',
  'src/loading-progress.css',
  'src/minimap.css',
  'src/pallet-footer-summary.css',
];
for (const path of tokenizedCss) {
  const source = readFileSync(path, 'utf8');
  if (/font-size\s*:\s*(?:8|9|10)px\b/.test(source)) {
    fail(`${path} reintroduced 8-10px typography after token migration.`);
  }
}

const loadingUnitCss = readFileSync('src/guided-loading-unit.css', 'utf8');
if (/guided-loading-unit-floating|guided-loading-unit-running-badge/.test(loadingUnitCss)) {
  fail('guided-loading-unit.css restored the old viewport-positioned loading-unit overlays.');
}
if (!loadingUnitCss.includes('.guided-loading-unit-inline')) {
  fail('guided-loading-unit.css must keep the step-4 loading-unit selector in normal document flow.');
}
if (!loadingUnitCss.includes('.guided-loading-run-confirmation')) {
  fail('guided-loading-unit.css must keep the step-5 execution confirmation visible above the CTA.');
}

const loadingProgressCss = readFileSync('src/loading-progress.css', 'utf8');
if (!loadingProgressCss.includes('.calculation-progress-ring')) {
  fail('loading-progress.css must keep the circular automatic-loading progress gauge.');
}
if (!loadingProgressCss.includes('.calculation-progress-copy')) {
  fail('loading-progress.css must keep progress details and remaining-time feedback readable.');
}

const mainSource = readFileSync('src/main.tsx', 'utf8');
if (mainSource.includes("import './transport-equipment-scroll-fix.css';")) {
  fail('main.tsx must not restore transport-equipment-scroll-fix.css; scrolling belongs to transport-equipment.css.');
}
if (/import ['"]\.\/ux-review.*\.css['"]/.test(mainSource)) {
  fail('main.tsx must not import temporary ux-review stylesheets after ownership migration.');
}
if (!mainSource.includes("import './loading-progress.css';")) {
  fail('main.tsx must load the automatic-loading progress UI stylesheet.');
}

const reviewCssNames = readdirSync('src').filter((name) => /^ux-review.*\.css$/.test(name));
if (reviewCssNames.length > 0) {
  fail(`Temporary UX review stylesheets must stay removed (${reviewCssNames.join(', ')}). Put rules in the owning feature stylesheet.`);
}

const tsxFiles = readdirSync('src').filter((name) => name.endsWith('.tsx')).map((name) => join('src', name));
const legacyWorkspaceClassNames = ['workspace', 'panel', 'left-panel', 'right-panel'];

function staticClassNameTokens(source) {
  const tokens = [];
  const direct = /className\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  const template = /className\s*=\s*\{\s*`([^`]*)`\s*\}/g;
  for (const match of source.matchAll(direct)) {
    const value = match[1] ?? match[2] ?? '';
    tokens.push(...value.trim().split(/\s+/).filter(Boolean));
  }
  for (const match of source.matchAll(template)) {
    const value = (match[1] ?? '').replace(/\$\{[^}]*\}/g, ' ');
    tokens.push(...value.trim().split(/\s+/).filter(Boolean));
  }
  return tokens;
}

for (const path of tsxFiles) {
  const source = readFileSync(path, 'utf8');
  const tokens = new Set(staticClassNameTokens(source));
  for (const className of legacyWorkspaceClassNames) {
    if (tokens.has(className)) fail(`${path} restored legacy .${className}; use dashboard/workspace-tools layout classes instead.`);
  }
}

const stylesSource = readFileSync('src/styles.css', 'utf8');
for (const className of legacyWorkspaceClassNames) {
  const selectorPattern = new RegExp(`\\.${className}(?![A-Za-z0-9_-])`);
  if (selectorPattern.test(stylesSource)) {
    fail(`src/styles.css restored legacy .${className} layout rules; keep the dashboard/workspace-tools layout as the only owner.`);
  }
}

const appSource = readFileSync('src/App.tsx', 'utf8');
if (!appSource.includes('useGuidedWorkflowState')) {
  fail('App.tsx must subscribe to guided workflow state so the 3D viewer is owned by React rendering.');
}
if (!appSource.includes('shouldRenderGuidedViewer(guidedWorkflowState)')) {
  fail('App.tsx must use the guided viewer render policy instead of relying on CSS to hide/show the viewer.');
}
if (!appSource.includes('useGuidedLoadingUnit')) {
  fail('App.tsx must apply the guided loading-unit store directly instead of relying on hidden DOM mode clicks.');
}
if (!appSource.includes('optimizationEtaSeconds') || !appSource.includes('calculation-progress-ring')) {
  fail('App.tsx must expose automatic-loading progress and ETA feedback while the optimizer is running.');
}

const uiEventsSource = readFileSync('src/uiEvents.ts', 'utf8');
if (!uiEventsSource.includes('getGuidedWorkflowSnapshot')) {
  fail('uiEvents.ts must use centralized guided workflow state for the run-loading synchronization boundary.');
}
if (/dataset\.guidedStep/.test(uiEventsSource)) {
  fail('uiEvents.ts must not infer workflow state from DOM data-guided-step attributes.');
}

const guidedWorkflowCss = readFileSync('src/guided-workflow.css', 'utf8');
const guidedWorkflowV2 = readFileSync('src/guided-workflow-v2.css', 'utf8');
const guidedStrategyCss = readFileSync('src/guided-loading-strategy.css', 'utf8');
const cssDrivenCenterSwitch = /data-guided-step[^\n{]*[\s\S]{0,180}(?:\.viewer-card|\.guided-stage-panel)[^{]*\{[^}]*display\s*:/;
for (const [path, source] of [
  ['src/guided-workflow.css', guidedWorkflowCss],
  ['src/guided-workflow-v2.css', guidedWorkflowV2],
  ['src/guided-loading-strategy.css', guidedStrategyCss],
]) {
  if (cssDrivenCenterSwitch.test(source)) {
    fail(`${path} restored data-guided-step CSS display switching; App/StagePanel React rendering must own center content visibility.`);
  }
}
if (!/\.guided-loading-placeholder\s*\{[^}]*display\s*:\s*none/.test(guidedWorkflowCss)) {
  fail('src/guided-workflow.css must keep only the generic step-5 placeholder hidden; step visibility belongs to React.');
}

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

if (!process.exitCode) console.log(`Architecture check passed · ${bridgeFiles.length} remaining Bridge component(s) inspected · guided workflow state React-owned · shell status scraping removed · loading-unit DOM proxy removed · pallet result/target restoration locked · progress/ETA feedback locked.`);
