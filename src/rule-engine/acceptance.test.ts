import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearPhysicsTarget, publishPhysicsTarget, readPhysicsTarget, type PhysicsTarget } from '../physicsTarget';
import { clearLatestInertiaCertification, readLatestInertiaCertification } from '../inertiaCertification';
import { buildLoadingReportHtml, openLoadingReport } from '../report';
import { openResultsModal, OPEN_RESULTS_MODAL_EVENT } from '../resultsModalEvents';
import { clearLoadSimAcceptance, createLoadSimTargetSignature, isLoadSimAcceptedTarget, publishLoadSimAcceptance, readLoadSimAcceptance } from './acceptance';
import { buildAcceptedLoadSimWorkbook } from '../ExcelExportActions';
import { createPalletRuleEngineProvenance } from './palletProvenance';
import { pendingLoadingResult, publishLoadingResult } from '../engine/loadingEngine';

function validTarget(): PhysicsTarget {
  return {
    mode: 'boxes', container: { length: 2, width: 2, height: 2, maxPayloadKg: 1000 },
    cargo: [{ id: 'A', name: 'A', length: .4, width: .4, height: .4, weightKg: 10, quantity: 1 }],
    result: { ruleEngine: 'load-sim', placements: [{ cargoId: 'A', x: .8, y: .8, z: 0, length: .4, width: .4, height: .4, weightKg: 10, loadSimOrientation: 'LWH' }], remaining: [], loadedWeightKg: 10, usedVolumeM3: .064, validationIssues: [] },
  };
}

afterEach(() => { clearLoadSimAcceptance(); clearPhysicsTarget(); clearLatestInertiaCertification(); delete (window as Window & { __containerLoadingLatestResult?: unknown }).__containerLoadingLatestResult; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('independent A-rule acceptance', () => {
  it('accepts final A validation without inventing an inertia PASS', () => {
    const target = validTarget();
    const acceptance = publishLoadSimAcceptance(target);
    expect(acceptance.status).toBe('accepted');
    expect(readLoadSimAcceptance()).toEqual(acceptance);
    expect(isLoadSimAcceptedTarget(target)).toBe(true);
    expect(readLatestInertiaCertification()).toBeUndefined();
  });

  it('revalidates actual geometry rather than trusting an empty issues array', () => {
    const target = validTarget(); target.result.placements[0].x = 3;
    const acceptance = publishLoadSimAcceptance(target);
    expect(acceptance.status).toBe('rejected');
    expect(acceptance.validationIssues.length).toBeGreaterThan(0);
    expect(isLoadSimAcceptedTarget(target)).toBe(false);
  });

  it('keeps warnings visible without turning optional cautions into hard rejection', () => {
    const target = validTarget();
    target.result.operationalFindings = [{ code: 'OPTIONAL_INSPECTION', severity: 'warning', message: 'Check separately', placementIndexes: [] }];
    expect(publishLoadSimAcceptance(target).status).toBe('accepted');
    expect(readLoadSimAcceptance()?.operationalFindings.some(finding => finding.code === 'OPTIONAL_INSPECTION')).toBe(true);
  });

  it('invalidates proof for altered orientation or safety metadata', () => {
    const target = validTarget(); publishLoadSimAcceptance(target);
    const signature = createLoadSimTargetSignature(target);
    target.cargo[0].friction = .1;
    expect(createLoadSimTargetSignature(target)).not.toBe(signature);
    expect(isLoadSimAcceptedTarget(target)).toBe(false);
    publishPhysicsTarget(target);
    expect(readLoadSimAcceptance()).toBeUndefined();
  });

  it('opens results and builds the A work order with optional physics still untested', () => {
    const target = validTarget(); publishLoadSimAcceptance(target);
    const opened = vi.fn(); window.addEventListener(OPEN_RESULTS_MODAL_EVENT, opened);
    try {
      openResultsModal(target);
      expect(opened).toHaveBeenCalledOnce();
      const detail = (opened.mock.calls[0][0] as CustomEvent).detail;
      expect(detail.staticAcceptance.status).toBe('accepted');
      expect(detail.certification).toBeUndefined();
      const html = buildLoadingReportHtml(target.container, target.cargo, target.result);
      expect(html).toContain('A 정적 규칙 검증 통과');
      expect(html).toContain('관성검사(선택): 미실시');
      expect(readLatestInertiaCertification()).toBeUndefined();
    } finally { window.removeEventListener(OPEN_RESULTS_MODAL_EVENT, opened); }
  });

  it('does not replace the latest accepted target when a stale result is opened', () => {
    const target = validTarget(); publishLoadSimAcceptance(target);
    const stale = validTarget(); stale.cargo[0].name = 'OLD';
    const opened = vi.fn(); window.addEventListener(OPEN_RESULTS_MODAL_EVENT, opened);
    try { openResultsModal(stale); expect(opened).not.toHaveBeenCalled(); expect(isLoadSimAcceptedTarget(target)).toBe(true); }
    finally { window.removeEventListener(OPEN_RESULTS_MODAL_EVENT, opened); }
  });

  it('exports A static proof and exact orientations without requiring an inertia certificate', () => {
    const target = validTarget(); publishLoadSimAcceptance(target);
    const workbook = buildAcceptedLoadSimWorkbook(target);
    expect(workbook.SheetNames).toContain('A 적재 판정');
    expect(workbook.Sheets['A 적재 판정'].B2.v).toBe('A 정적 규칙 검증 통과');
    expect(workbook.Sheets['A 적재 판정'].B3.v).toContain('별도 선택 검사');
    expect(readLatestInertiaCertification()).toBeUndefined();
  });

  it('checks rigid-pallet display mapping and gross weight before issuing proof', () => {
    const target = validTarget(); target.mode = 'pallets';
    target.result.placements[0].z = .15; target.result.loadedWeightKg = 35;
    target.result.ruleEngineInput = {
      cargo: [{ id: 'R1', name: 'Rigid pallet', length: .4, width: .4, height: .55, weightKg: 35, quantity: 1, loadSimType: 'pallet' }],
      placements: [{ cargoId: 'R1', x: .8, y: .8, z: 0, length: .4, width: .4, height: .55, weightKg: 35 }],
      palletUnits: [{ cargoId: 'R1', sourcePalletIndex: 1, displayPlacementIndexes: [0] }],
    };
    target.result.ruleEngineInput.provenance = createPalletRuleEngineProvenance(target.cargo, target.result.placements, target.result.ruleEngineInput, []);
    expect(publishLoadSimAcceptance(target).status).toBe('accepted');
    target.result.ruleEngineInput.palletUnits[0].displayPlacementIndexes = [0, 0];
    expect(publishLoadSimAcceptance(target).status).toBe('rejected');
    target.result.ruleEngineInput.palletUnits[0].displayPlacementIndexes = [];
    expect(publishLoadSimAcceptance(target).status).toBe('rejected');
    target.result.ruleEngineInput.palletUnits[0].displayPlacementIndexes = [0];
    target.result.loadedWeightKg = 10;
    expect(publishLoadSimAcceptance(target).status).toBe('rejected');
    target.result.loadedWeightKg = 35; target.result.placements[0].x = 1.2;
    expect(publishLoadSimAcceptance(target).status).toBe('rejected');
  });
});

it('rebuilds exact A static proof after a cleared target without an inertia record', () => {
  const target = validTarget();
  publishLoadingResult(target.container, target.cargo, target.result);
  publishLoadSimAcceptance(target);
  clearPhysicsTarget();
  const opened = vi.fn(); window.addEventListener(OPEN_RESULTS_MODAL_EVENT, opened);
  try {
    openResultsModal(target);
    expect(opened).toHaveBeenCalledOnce();
    expect(isLoadSimAcceptedTarget(target)).toBe(true);
    expect(readLatestInertiaCertification()).toBeUndefined();
  } finally { window.removeEventListener(OPEN_RESULTS_MODAL_EVENT, opened); }
});

it.each(['acceptance', 'physics target', 'results', 'work order', 'workbook'] as const)('rejects stale %s after a newer input clears the live target', action => {
  const old = validTarget();
  publishLoadingResult(old.container, old.cargo, old.result);
  expect(publishLoadSimAcceptance(old).status).toBe('accepted');
  clearPhysicsTarget();
  const newCargo = [{ ...old.cargo[0], quantity: 9 }];
  const pending = pendingLoadingResult(old.container, newCargo);
  const opened = vi.fn(); window.addEventListener(OPEN_RESULTS_MODAL_EVENT, opened);
  const popup = vi.spyOn(window, 'open').mockReturnValue(null);
  vi.stubGlobal('alert', vi.fn());
  try {
    if (action === 'acceptance') expect(publishLoadSimAcceptance(old).status).toBe('rejected');
    if (action === 'physics target') expect(publishPhysicsTarget(old)).toBe(false);
    if (action === 'results') openResultsModal(old);
    if (action === 'work order') expect(openLoadingReport(old.container, old.cargo, old.result)).toBe(false);
    if (action === 'workbook') expect(() => buildAcceptedLoadSimWorkbook(old)).toThrow();
    expect(opened).not.toHaveBeenCalled(); expect(popup).not.toHaveBeenCalled();
    expect(readPhysicsTarget()).toBeUndefined();
    expect(isLoadSimAcceptedTarget(old)).toBe(false);
    expect((window as Window & { __containerLoadingLatestResult?: { cargo: typeof newCargo; result: typeof pending } }).__containerLoadingLatestResult).toMatchObject({ cargo: newCargo, result: pending });
  } finally { window.removeEventListener(OPEN_RESULTS_MODAL_EVENT, opened); }
});

it('invalidates an existing proof when the published source changes without a viewer clear', () => {
  const old = validTarget(); publishLoadingResult(old.container, old.cargo, old.result);
  expect(publishLoadSimAcceptance(old).status).toBe('accepted');
  pendingLoadingResult(old.container, [{ ...old.cargo[0], cgOffsetM: { l: 100, w: 0, h: 0 } }]);
  expect(isLoadSimAcceptedTarget(old)).toBe(false);
  expect(readLoadSimAcceptance()).toBeUndefined();
  expect(() => buildLoadingReportHtml(old.container, old.cargo, old.result)).toThrow();
});
