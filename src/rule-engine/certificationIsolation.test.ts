import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelPendingCertification, FINAL_PHYSICS_VALIDATION_ERROR_EVENT, readFinalPhysicsValidation, requestExactCertification, requestNextPalletCertification } from '../autoCertification';
import { runInertiaAnimation } from '../engine/inertiaSimulation';
import { clearManualOverride, readManualOverride, writeManualOverride } from '../engine/manualOverride';
import { runPhysicsValidationSuite } from '../engine/physicsValidation';
import type { CargoItem, ContainerSpec, LoadingResult } from '../engine/types';
import { clearLatestInertiaCertification, createPhysicsTargetSignature, readLatestInertiaCertification, requestCertifiedResults, REQUEST_CERTIFIED_RESULTS_EVENT, runInertiaCertification, type InertiaCertification } from '../inertiaCertification';
import { clearPhysicsTarget, publishPhysicsTarget, type PhysicsTarget } from '../physicsTarget';
import { certificationMatchesTarget as certifiedExportMatches, boxResultMatchesWorkOrderCertification } from '../certifiedExport';
import { readCertificationState } from '../certificationStore';
import { INERTIA_CERTIFICATION_EVENT } from '../inertiaCertification';
import { completeCertificationForWorkOrder } from '../inertiaWorkOrderPolicy';
import { buildLoadingReportHtml, openLoadingReport } from '../report';
import { certificationMatchesTarget as modalMatches, openResultsModal, OPEN_RESULTS_MODAL_EVENT } from '../resultsModalEvents';

vi.mock('../engine/inertiaSimulation', () => ({ runInertiaAnimation: vi.fn() }));
vi.mock('../engine/physicsValidation', () => ({ runPhysicsValidationSuite: vi.fn() }));

function target(): PhysicsTarget {
  return {
    mode: 'boxes',
    container: { length: 2, width: 2, height: 2, maxPayloadKg: 1000 },
    cargo: [{ id: 'A', name: 'A', length: .4, width: .4, height: .4, weightKg: 10, quantity: 1 }],
    result: {
      placements: [{ cargoId: 'A', x: .8, y: .8, z: 0, length: .4, width: .4, height: .4, weightKg: 10 }],
      remaining: [], loadedWeightKg: 10, usedVolumeM3: .064, validationIssues: [], ruleEngine: 'load-sim',
    },
  };
}

beforeEach(() => {
  cancelPendingCertification(); clearPhysicsTarget(); clearManualOverride(); clearLatestInertiaCertification();
  vi.clearAllMocks();
});
afterEach(() => {
  cancelPendingCertification(); clearPhysicsTarget(); clearManualOverride(); clearLatestInertiaCertification();
});

const blockedResults: Partial<LoadingResult>[] = [
  { validationIssues: [{ type: 'COLLISION', message: 'Collision', placementIndexes: [0] }] },
  { operationalFindings: [{ code: 'OVERLAP', severity: 'error', message: 'Collision', placementIndexes: [0] }] },
];

describe('hard loading-rule certification boundary', () => {
  it.each(blockedResults)('rejects direct inertia runs before any simulation: %j', async patch => {
    const current = target(); Object.assign(current.result, patch);
    await expect(runInertiaCertification(current)).rejects.toThrow('LOADING_RULE_ERROR');
    expect(runInertiaAnimation).not.toHaveBeenCalled();
  });

  it.each(blockedResults)('blocks certificate request dispatch and existing-pass reads: %j', patch => {
    const current = target(); Object.assign(current.result, patch); publishPhysicsTarget(current);
    const cached = { status: 'passed', targetSignature: createPhysicsTargetSignature(current) } as InertiaCertification;
    Object.assign(window, { __containerLoadingLatestCertification: cached });
    const request = vi.fn(); window.addEventListener(REQUEST_CERTIFIED_RESULTS_EVENT, request);
    try {
      expect(readLatestInertiaCertification()).toBeUndefined();
      requestCertifiedResults(current);
      expect(request).not.toHaveBeenCalled();
      expect(readLatestInertiaCertification()).toBeUndefined();
    } finally { window.removeEventListener(REQUEST_CERTIFIED_RESULTS_EVENT, request); }
  });

  it.each(['boxes', 'pallets'] as const)('blocks automatic %s certification and clears cached physics', async mode => {
    const current = target(); current.mode = mode; Object.assign(current.result, blockedResults[0]);
    Object.assign(window, { __containerLoadingFinalPhysicsSignature: 'stale', __containerLoadingFinalPhysicsResult: {}, __containerLoadingLatestPhysics: {} });
    const failure = vi.fn(); window.addEventListener(FINAL_PHYSICS_VALIDATION_ERROR_EVENT, failure);
    try {
      if (mode === 'boxes') requestExactCertification(current);
      else { requestNextPalletCertification(); publishPhysicsTarget(current); }
      await Promise.resolve();
      expect(runPhysicsValidationSuite).not.toHaveBeenCalled();
      expect(failure).toHaveBeenCalledOnce();
      expect((failure.mock.calls[0][0] as CustomEvent).detail.error).toContain('LOADING_RULE_ERROR');
      expect(readFinalPhysicsValidation()).toBeUndefined();
    } finally { window.removeEventListener(FINAL_PHYSICS_VALIDATION_ERROR_EVENT, failure); }
  });

  it('keeps valid A optional certificate requests enabled', () => {
    const request = vi.fn(); window.addEventListener(REQUEST_CERTIFIED_RESULTS_EVENT, request);
    try { requestCertifiedResults(target()); expect(request).toHaveBeenCalledOnce(); }
    finally { window.removeEventListener(REQUEST_CERTIFIED_RESULTS_EVENT, request); }
  });

  it.each(blockedResults)('rejects cached and explicitly supplied PASS results at output boundaries: %j', async patch => {
    const current = target(); Object.assign(current.result, patch); publishPhysicsTarget(current);
    const cached = { status: 'passed', mode: 'boxes', payloadWithinLimit: true, targetSignature: createPhysicsTargetSignature(current) } as InertiaCertification;
    window.dispatchEvent(new CustomEvent(INERTIA_CERTIFICATION_EVENT, { detail: cached }));
    expect(readCertificationState()).toBeUndefined();
    expect(certifiedExportMatches(current, cached)).toBe(false);
    expect(boxResultMatchesWorkOrderCertification(current, current, cached)).toBe(false);
    expect(modalMatches(cached, current)).toBe(false);
    await expect(completeCertificationForWorkOrder(current, cached)).rejects.toThrow('LOADING_RULE_ERROR');
    expect(runInertiaAnimation).not.toHaveBeenCalled();
    const opened = vi.fn(); window.addEventListener(OPEN_RESULTS_MODAL_EVENT, opened);
    const originalAlert = window.alert, originalOpen = window.open;
    const alert = vi.fn(), popup = vi.fn();
    window.alert = alert; window.open = popup;
    try {
      openResultsModal({ ...current, certification: cached });
      expect(opened).not.toHaveBeenCalled();
      expect(() => buildLoadingReportHtml(current.container, current.cargo, current.result)).toThrow('LOADING_RULE_ERROR');
      expect(openLoadingReport(current.container, current.cargo, current.result)).toBe(false);
      expect(popup).not.toHaveBeenCalled();
      expect(alert).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener(OPEN_RESULTS_MODAL_EVENT, opened); window.alert = originalAlert; window.open = originalOpen;
    }
  });
});

const cargoChanges: Partial<CargoItem>[] = [
  { allowedOrientations: ['LWH'] },
  { loadSimType: 'machine' }, { thisSideUp: true }, { maxTopPressureKgPerM2: 200 },
  { canBePlacedOnTop: false }, { groupId: 'group' }, { segregationClass: 'class' },
  { tempZone: 'cold' }, { cgOffsetM: { l: .1, w: .2, h: .3 } }, { friction: .6 },
  { forklift: true }, { floorOnly: true }, { unitKind: 'pallet' }, { demandUnits: 2 },
  { sourcePalletIndex: 1 },
];
const containerChanges: Partial<ContainerSpec>[] = [
  { transportKind: 'truck' }, { doorWidth: 1.8 }, { doorHeight: 1.8 },
  { access: ['left'] }, { tareKg: 100 }, { floorLineLoadKgPerM: 100 }, { heightLimitM: 1.8 },
  { axles: { frontX: -.5, rearX: 1.5, emptyFront: 100, emptyRear: 100, maxFront: 500, maxRear: 500, rearAxleCount: 1, maxGross: 1000 } },
];

describe('safety metadata fingerprints', () => {
  it.each(cargoChanges)('invalidates certification and restoration for cargo metadata %j', patch => {
    const current = target(); const signature = createPhysicsTargetSignature(current);
    writeManualOverride(current.container, current.cargo, current.result);
    current.cargo = [{ ...current.cargo[0], ...patch }];
    expect(createPhysicsTargetSignature(current)).not.toBe(signature);
    expect(readManualOverride(current.container, current.cargo)).toBeNull();
  });

  it.each(containerChanges)('invalidates certification and restoration for equipment metadata %j', patch => {
    const current = target(); const signature = createPhysicsTargetSignature(current);
    writeManualOverride(current.container, current.cargo, current.result);
    current.container = { ...current.container, ...patch };
    expect(createPhysicsTargetSignature(current)).not.toBe(signature);
    expect(readManualOverride(current.container, current.cargo)).toBeNull();
  });

  it('distinguishes exact orientation even for a cube and rejects changed stored orientation', () => {
    const current = target(); const signature = createPhysicsTargetSignature(current);
    writeManualOverride(current.container, current.cargo, current.result);
    current.result.placements[0].loadSimOrientation = 'HLW';
    expect(createPhysicsTargetSignature(current)).not.toBe(signature);
    const stored = JSON.parse(sessionStorage.getItem('container-loading-manual-override-v1')!);
    stored.result.placements[0].loadSimOrientation = 'HLW';
    sessionStorage.setItem('container-loading-manual-override-v1', JSON.stringify(stored));
    expect(readManualOverride(current.container, current.cargo)).toBeNull();
  });

  it('restores unchanged A inputs and rejects old engine records', () => {
    const current = target(); writeManualOverride(current.container, current.cargo, current.result);
    expect(readManualOverride(current.container, current.cargo)).toEqual(current.result);
    const stored = JSON.parse(sessionStorage.getItem('container-loading-manual-override-v1')!);
    stored.result.ruleEngine = 'legacy';
    sessionStorage.setItem('container-loading-manual-override-v1', JSON.stringify(stored));
    expect(readManualOverride(current.container, current.cargo)).toBeNull();
  });
});
