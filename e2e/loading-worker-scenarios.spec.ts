import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { cgCompliantAlternativeForResult } from '../src/engine/cgCompliantPlan';
import type { LoadingStrategy } from '../src/engine/loadingEngine';
import type { CargoItem, ContainerSpec, LimitReviewMetric, LoadingResult } from '../src/engine/types';
import type { SecuringMaterialSettings } from '../src/securingMaterialSettings';
import { withWorkerParityPage } from './helpers/workerParityHarness';
import {
  afterStopCargo, approvedFortyFootScenarios, fortyFootContainer, largeFortyFootCargo,
  policyCargo, policyContainer, reviewBox, reviewContainer,
} from './fixtures/loading-worker-scenarios';

type ParityInput = {
  container: ContainerSpec;
  cargo: CargoItem[];
  materials?: SecuringMaterialSettings;
  strategy?: LoadingStrategy;
  includeCgAlternative?: boolean;
};
type CgAlternative = ReturnType<typeof cgCompliantAlternativeForResult>;
type ParityResult = {
  inputUnchanged: boolean;
  workerResult: LoadingResult;
  fallbackResult: LoadingResult;
  syncResult: LoadingResult;
  requests: Array<ParityInput & { securingOptions: { securingMaterials: SecuringMaterialSettings } }>;
  responses: Array<{ result?: LoadingResult; error?: string }>;
  errors: string[];
  timing: { workerMs: number; fallbackMs: number; syncMs: number };
  cgAlternatives?: { worker: CgAlternative; fallback: CgAlternative; sync: CgAlternative };
};
type ParityWindow = Window & { runLoadingWorkerParity(input: ParityInput): Promise<ParityResult> };

const strategies: LoadingStrategy[] = ['capacity', 'stability', 'unloading'];
const waitingCount = (result: LoadingResult) => result.remaining.reduce((sum, row) => sum + row.quantity, 0);
const errorFindings = (result: LoadingResult) => (result.operationalFindings ?? []).filter(finding => finding.severity === 'error');
const cgErrors = (result: LoadingResult) => errorFindings(result).filter(finding => finding.code === 'CG_LONGITUDINAL');
const unloadFindings = (result: LoadingResult) => (result.operationalFindings ?? []).filter(finding => finding.code.startsWith('UNLOAD_BLOCKED') || finding.code.startsWith('AFTER_STOP_'));

/** Always compare the complete serialized result, not a projection of placements or totals. */
async function runParity(page: Page, input: ParityInput, testInfo: TestInfo, label: string): Promise<ParityResult> {
  const before = structuredClone(input);
  const output = await page.evaluate(value => (window as unknown as ParityWindow).runLoadingWorkerParity(value), input);
  await testInfo.attach(label, {
    body: JSON.stringify({
      input, timing: output.timing, workerResult: output.workerResult,
      cgAlternatives: output.cgAlternatives, requests: output.requests,
      responseCount: output.responses.length, errors: output.errors,
    }, null, 2),
    contentType: 'application/json',
  });
  expect(input).toEqual(before);
  expect(output.inputUnchanged).toBe(true);
  expect(output.errors).toEqual([]);
  expect(output.requests).toHaveLength(1);
  expect(output.responses).toHaveLength(1);
  expect(output.requests[0]).toMatchObject({ container: input.container, cargo: input.cargo, strategy: input.strategy ?? 'capacity' });
  expect(output.responses[0].error).toBeUndefined();
  expect(output.responses[0].result).toEqual(output.workerResult);
  expect(output.workerResult).toEqual(output.syncResult);
  expect(output.fallbackResult).toEqual(output.syncResult);
  if (output.cgAlternatives) {
    expect(output.cgAlternatives.worker).toEqual(output.cgAlternatives.sync);
    expect(output.cgAlternatives.fallback).toEqual(output.cgAlternatives.sync);
  }
  for (const key of ['workerMs', 'fallbackMs', 'syncMs'] as const) {
    expect(Number.isFinite(output.timing[key]), key).toBe(true);
    expect(output.timing[key], key).toBeGreaterThanOrEqual(0);
  }
  const result = output.workerResult;
  expect(result.placements.length + waitingCount(result)).toBe(input.cargo.reduce((sum, row) => sum + row.quantity, 0));
  expect(result.loadedWeightKg).toBeCloseTo(result.placements.reduce((sum, placement) => sum + placement.weightKg, 0), 6);
  if (result.securingBudget) {
    expect(result.securingBudget.totalTransportWeightKg).toBeCloseTo(result.loadedWeightKg + result.securingBudget.requiredWeightKg, 6);
    expect(result.securingBudget.totalTransportWeightKg).toBeLessThanOrEqual((input.container.limitReview?.maxPayloadKg ?? input.container.maxPayloadKg) + 1e-6);
  }
  for (const placement of result.placements) {
    expect(placement.x).toBeGreaterThanOrEqual(-1e-6);
    expect(placement.y).toBeGreaterThanOrEqual(-1e-6);
    expect(placement.z).toBeGreaterThanOrEqual(-1e-6);
    expect(placement.x + placement.length).toBeLessThanOrEqual(input.container.length + 1e-6);
    expect(placement.y + placement.width).toBeLessThanOrEqual(input.container.width + 1e-6);
    expect(placement.z + placement.height).toBeLessThanOrEqual(input.container.height + 1e-6);
  }
  return output;
}

for (const strategy of strategies) for (const unloadingPolicy of ['strict', 'soft'] as const) {
  test(`stage 8-3: ${strategy} preserves ${unloadingPolicy} unloading policy through the real worker`, async ({ browser }, testInfo) => {
    await withWorkerParityPage(browser, async page => {
      const { workerResult: result } = await runParity(page, {
        container: { ...policyContainer, unloadingPolicy }, cargo: policyCargo, strategy,
      }, testInfo, `${strategy}-${unloadingPolicy}`);
      expect(result.placements).toHaveLength(8);
      expect(result.remaining).toEqual([]);
      expect(result.validationIssues).toEqual([]);
      expect(errorFindings(result)).toEqual([]);
      if (unloadingPolicy === 'strict') {
        expect(result.placements[0].cargoId).toBe('late-light');
        expect(unloadFindings(result)).toEqual([]);
        expect(result.operationalFindings).toContainEqual(expect.objectContaining({ code: 'HEAVY_INNER_UNLOAD_CONFLICT', severity: 'warning' }));
      } else {
        expect(result.placements[0].cargoId).toBe('early-heavy');
        const blocked = unloadFindings(result);
        expect(blocked).toHaveLength(4);
        for (const finding of blocked) expect(finding).toMatchObject({ code: 'UNLOAD_BLOCKED', severity: 'warning' });
        expect(result.operationalFindings?.some(finding => finding.code === 'HEAVY_INNER_UNLOAD_CONFLICT')).toBe(false);
      }
    });
  });
}

for (const scenario of approvedFortyFootScenarios) {
  test(`stage 8-4: 40FT ${scenario.name}`, async ({ browser }, testInfo) => {
    test.setTimeout(180_000);
    await withWorkerParityPage(browser, async page => {
      const output = await runParity(page, {
        container: scenario.container, cargo: scenario.cargo,
        strategy: 'capacity', includeCgAlternative: scenario.includeCgAlternative,
      }, testInfo, 'approved-40ft-result');
      const result = output.workerResult;
      expect(result.placements).toHaveLength(scenario.loaded);
      expect(waitingCount(result)).toBe(scenario.waiting);
      expect(result.validationIssues).toEqual([]);
      expect(cgErrors(result)).toHaveLength(scenario.cgErrors);
      expect(errorFindings(result).filter(finding => finding.code !== 'CG_LONGITUDINAL')).toEqual([]);
      if (scenario.container.unloadingPolicy === 'strict') expect(unloadFindings(result)).toEqual([]);
      if (scenario.includeCgAlternative) {
        const alternative = output.cgAlternatives?.worker;
        expect(alternative).not.toBeNull();
        expect(alternative).toBeDefined();
        if (!alternative) throw new Error('The 630-carton CG-error plan must expose its compliant alternative');
        expect(alternative.result.placements).toHaveLength(545);
        expect(alternative.removed).toEqual([expect.objectContaining({ cargoId: 'H', quantity: 85, reasonCode: 'CG_LIMIT' })]);
        expect(alternative.result.remaining).toEqual(alternative.removed);
        expect(alternative.result.placements.length + waitingCount(alternative.result)).toBe(630);
        expect(alternative.result.validationIssues).toEqual([]);
        expect(errorFindings(alternative.result)).toEqual([]);
        expect(unloadFindings(alternative.result)).toEqual([]);
        // Generating an alternative must never mutate or silently replace the full result.
        expect(result.placements).toHaveLength(630);
        expect(result.remaining).toEqual([]);
        expect(cgErrors(result)).toHaveLength(1);
      }
    });
  });
}

type ReviewScenario = {
  name: string;
  original: ContainerSpec;
  reviewed: ContainerSpec;
  cargo: CargoItem[];
  issueTypes: LoadingResult['validationIssues'][number]['type'][];
  findingCodes: string[];
  metrics: Array<Partial<LimitReviewMetric> & Pick<LimitReviewMetric, 'key'>>;
};
const reviewScenarios: ReviewScenario[] = [
  {
    name: 'payload includes securing and retains original overload',
    original: { ...reviewContainer, maxPayloadKg: 100 },
    reviewed: { ...reviewContainer, maxPayloadKg: 100, limitReview: { mode: 'what-if', maxPayloadKg: 130 } },
    cargo: [reviewBox], issueTypes: ['PAYLOAD'], findingCodes: ['PAYLOAD_EXCEEDED'],
    metrics: [{ key: 'payload', originalLimit: 100, scenarioLimit: 130, provenance: 'configured' }],
  },
  {
    name: 'floor-load review retains the true peak and excess',
    original: { ...reviewContainer, floorLoadLimitKgPerM2: 100 },
    reviewed: { ...reviewContainer, floorLoadLimitKgPerM2: 100, limitReview: { mode: 'what-if', floorLoadLimitKgPerM2: 150 } },
    cargo: [reviewBox], issueTypes: [], findingCodes: [],
    metrics: [{ key: 'floor-load', originalLimit: 100, scenarioLimit: 150, actual: 120, excess: 20, excessPercent: 20 }],
  },
  {
    name: 'stack and cumulative top-load reviews retain both original errors',
    original: reviewContainer,
    reviewed: { ...reviewContainer, limitReview: { mode: 'what-if', cargoLimits: { box: { maxStackLayers: 2, maxTopLoadKg: 70 } } } },
    cargo: [{ ...reviewBox, maxStackLayers: 1, maxTopLoadKg: 50 }],
    issueTypes: ['STACK_LIMIT', 'TOP_LOAD'], findingCodes: ['STACK_LIMIT', 'TOP_LOAD_EXCEEDED'],
    metrics: [
      { key: 'stack-layers', originalLimit: 1, scenarioLimit: 2, actual: 2, excess: 1, excessPercent: 100 },
      { key: 'top-load', originalLimit: 50, scenarioLimit: 70, actual: 60, excess: 10, excessPercent: 20 },
    ],
  },
  {
    name: 'partial-support review retains original support failures',
    original: reviewContainer,
    reviewed: { ...reviewContainer, limitReview: { mode: 'what-if', minimumSupportRatio: .75 } },
    cargo: [{ ...reviewBox, id: 'base', length: .9, width: .85, quantity: 1 }, { ...reviewBox, id: 'top', weightKg: 59, quantity: 1 }],
    issueTypes: ['UNSUPPORTED'], findingCodes: ['INSUFFICIENT_SUPPORT'],
    metrics: [{ key: 'support', originalLimit: .8, scenarioLimit: .75, provenance: 'app-default', direction: 'minimum' }],
  },
];

for (const scenario of reviewScenarios) {
  test(`stage 8-5: WHAT-IF ${scenario.name}`, async ({ browser }, testInfo) => {
    await withWorkerParityPage(browser, async page => {
      const { workerResult: strict } = await runParity(page, { container: scenario.original, cargo: scenario.cargo }, testInfo, 'original-limits');
      const { workerResult: review } = await runParity(page, { container: scenario.reviewed, cargo: scenario.cargo }, testInfo, 'what-if-limits');
      expect(strict.placements).toHaveLength(1);
      expect(strict.limitReview).toBeUndefined();
      expect(strict.validationIssues).toEqual([]);
      expect(review.placements).toHaveLength(2);
      expect(review.remaining).toEqual([]);
      expect(review.limitReview).toMatchObject({ mode: 'what-if', label: 'WHAT-IF REVIEW', status: 'active', config: scenario.reviewed.limitReview, errors: [] });
      for (const type of scenario.issueTypes) expect(review.validationIssues.map(issue => issue.type)).toContain(type);
      for (const code of scenario.findingCodes) expect(review.operationalFindings).toContainEqual(expect.objectContaining({ code, severity: 'error' }));
      for (const expected of scenario.metrics) expect(review.limitReview?.metrics).toContainEqual(expect.objectContaining(expected));
      if (scenario.reviewed.limitReview?.maxPayloadKg) {
        const payload = review.limitReview?.metrics.find(metric => metric.key === 'payload');
        expect(payload?.actual).toBeCloseTo(review.securingBudget!.totalTransportWeightKg, 8);
        expect(payload?.excess).toBeCloseTo(review.securingBudget!.totalTransportWeightKg - 100, 8);
        expect(review.securingBudget!.totalTransportWeightKg).toBeGreaterThan(120);
      }
      if (scenario.reviewed.limitReview?.floorLoadLimitKgPerM2) {
        expect(review.validationIssues.some(issue => issue.message.includes('FLOOR_LOAD_LIMIT'))).toBe(true);
      }
      if (scenario.reviewed.limitReview?.minimumSupportRatio) {
        const support = review.limitReview?.metrics.find(metric => metric.key === 'support');
        expect(support?.actual).toBeCloseTo(.765, 8);
        expect(support?.excess).toBeCloseTo(.035, 8);
      }
    });
  });
}

for (const strategy of strategies) for (const unloadingPolicy of ['strict', 'soft'] as const) {
  test(`stage 8-5: ${strategy} preserves ${unloadingPolicy} AFTER_STOP findings`, async ({ browser }, testInfo) => {
    await withWorkerParityPage(browser, async page => {
      const { workerResult: result } = await runParity(page, {
        container: { ...reviewContainer, unloadingPolicy }, cargo: afterStopCargo, strategy,
      }, testInfo, `after-stop-${strategy}-${unloadingPolicy}`);
      expect(result.validationIssues).toEqual([]);
      expect(errorFindings(result)).toEqual([]);
      if (unloadingPolicy === 'soft') {
        expect(result.placements).toHaveLength(2);
        expect(result.remaining).toEqual([]);
        expect(unloadFindings(result)).toEqual([
          expect.objectContaining({ code: 'UNLOAD_BLOCKED_ABOVE', severity: 'warning', placementIndexes: [0, 1] }),
          expect.objectContaining({ code: 'AFTER_STOP_FLOATING', severity: 'warning', placementIndexes: [1], value: 0, limit: .8 }),
        ]);
        expect(result.placements.find(placement => placement.cargoId === 'LATE')?.z).toBe(.5);
      } else {
        expect(result.placements).toHaveLength(1);
        expect(result.placements[0]).toMatchObject({ cargoId: 'LATE', z: 0 });
        expect(result.remaining).toEqual([expect.objectContaining({ cargoId: 'EARLY', quantity: 1, reasonCode: 'NO_FEASIBLE_EMS' })]);
        expect(unloadFindings(result)).toEqual([]);
      }
    });
  });
}

/** This guard covers the solver/search path; UI cancellation timeouts are deliberately separate. */
async function coreClockReferences() {
  const files = [
    'loading.worker.ts', 'loadingEngine.ts', 'hybridLoadingOptimizer.ts', 'heavyInnerBlockPacker.ts',
    'levelBlockPacker.ts', 'blockSpaceBeamPacker.ts', 'blockSpaceBeamPackerV2.ts', 'strictWallPacker.ts',
    'residualPacking.ts', 'cgCompliantPlan.ts', 'operationalValidator.ts', 'limitReview.ts',
  ];
  const violations: string[] = [];
  for (const file of files) {
    const source = await readFile(new URL(`../src/engine/${file}`, import.meta.url), 'utf8');
    // Ban direct clock/timer dependencies in these deterministic solver modules.
    // A source guard complements the repeated real-worker outputs; it is not a timing SLA.
    const clockApi = /\b(?:(?:Date|performance)\s*(?:\.\s*now|\[\s*['"]now['"]\s*\])|(?:setTimeout|setInterval)\s*\(|new\s+Date\s*\(\s*\))/g;
    for (const match of source.matchAll(clockApi)) {
      const line = source.slice(0, match.index).split('\n').length;
      violations.push(`${file}:${line}:${match[0]}`);
    }
  }
  return { files, violations };
}

test('stage 8-7: large 40FT stays deterministic with complete timed worker results and no solver clock cutoff', async ({ browser }, testInfo) => {
  // A test-runner timeout detects a hung test; elapsed time never selects an engine layout.
  test.setTimeout(240_000);
  const clockGuard = await coreClockReferences();
  await testInfo.attach('solver-clock-guard', { body: JSON.stringify(clockGuard, null, 2), contentType: 'application/json' });
  expect(clockGuard.violations).toEqual([]);
  await withWorkerParityPage(browser, async page => {
    const input: ParityInput = { container: { ...fortyFootContainer, unloadingPolicy: 'strict' }, cargo: largeFortyFootCargo, strategy: 'capacity' };
    const first = await runParity(page, input, testInfo, 'large-40ft-first-run');
    const repeated = await runParity(page, input, testInfo, 'large-40ft-repeated-run');
    expect(repeated.workerResult).toEqual(first.workerResult);
    const result = first.workerResult;
    expect(input.cargo.reduce((sum, item) => sum + item.quantity, 0)).toBe(1736);
    expect(result.placements).toHaveLength(1646);
    expect(waitingCount(result)).toBe(90);
    expect(result.validationIssues).toEqual([]);
    expect(result.loadedWeightKg).toBeCloseTo(28546, 6);
    expect(result.securingBudget).toMatchObject({ requiredWeightKg: 50.75 });
    expect(result.securingBudget!.totalTransportWeightKg).toBeCloseTo(28596.75, 6);
    expect(Object.fromEntries(input.cargo.map(item => [item.id, result.placements.filter(placement => placement.cargoId === item.id).length]))).toEqual({
      PRD001: 937, PRD004: 571, PRD005: 14, PRD006: 71, 'PRD001-PARTIAL': 1,
      PRD030: 52, 'PRD030-PARTIAL': 0, 'PRD004-PARTIAL': 0, 'PRD006-PARTIAL': 0, 'PRD005-PARTIAL': 0,
    });
    expect(result.remaining.map(({ cargoId, quantity, reasonCode }) => ({ cargoId, quantity, reasonCode }))).toEqual([
      { cargoId: 'PRD030', quantity: 86, reasonCode: 'PAYLOAD_LIMIT' },
      { cargoId: 'PRD030-PARTIAL', quantity: 1, reasonCode: 'PAYLOAD_LIMIT' },
      { cargoId: 'PRD004-PARTIAL', quantity: 1, reasonCode: 'PAYLOAD_LIMIT' },
      { cargoId: 'PRD006-PARTIAL', quantity: 1, reasonCode: 'PAYLOAD_LIMIT' },
      { cargoId: 'PRD005-PARTIAL', quantity: 1, reasonCode: 'PAYLOAD_LIMIT' },
    ]);
    expect(result.placements.filter(placement => placement.cargoId.startsWith('PRD030')).every(placement => placement.z === 0)).toBe(true);
    // The large full load intentionally keeps its CG error visible, rather than dropping cargo.
    expect(errorFindings(result)).toEqual([expect.objectContaining({ code: 'CG_LONGITUDINAL', severity: 'error' })]);
    expect(unloadFindings(result)).toEqual([]);
    expect(result.operationalFindings).toContainEqual(expect.objectContaining({ code: 'VOID_FILL_REQUIRED', severity: 'warning' }));
    // Timing is evidence only. There is intentionally no device-speed-dependent upper bound.
  });
});
