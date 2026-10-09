import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredState } from '../storage';
import type { PhysicsTarget } from '../physicsTarget';
import type { Snapshot } from './types';

const hooks = vi.hoisted(() => ({ state: null as StoredState | null, target: undefined as PhysicsTarget | undefined,
  unit: 'boxes' as 'boxes' | 'pallets' | 'mixed' | null, certification: undefined as unknown,
  verified: false, write: vi.fn(), clearPhysics: vi.fn(), clearCert: vi.fn(), clearOverride: vi.fn(), clearPallet: vi.fn(), select: vi.fn(), publishUnit: vi.fn() }));
vi.mock('../storage', () => ({ readStoredState: () => hooks.state, writeStoredState: hooks.write }));
vi.mock('../physicsTarget', () => ({ readPhysicsTarget: () => hooks.target, clearPhysicsTarget: hooks.clearPhysics }));
vi.mock('../inertiaCertification', () => ({ readLatestInertiaCertification: () => hooks.certification, clearLatestInertiaCertification: hooks.clearCert }));
vi.mock('../inertiaWorkOrderPolicy', () => ({ isPhysicsTargetVerified: () => hooks.verified }));
vi.mock('../engine/manualOverride', () => ({ clearManualOverride: hooks.clearOverride }));
vi.mock('../palletSnapshotStore', () => ({ clearPalletSnapshot: hooks.clearPallet }));
vi.mock('../palletTargetRestore', () => ({ buildPalletPhysicsTarget: () => hooks.target }));
vi.mock('../guidedLoadingUnitState', () => ({ readGuidedLoadingUnit: () => hooks.unit, publishGuidedLoadingUnit: hooks.publishUnit }));
vi.mock('../transportEquipment', () => ({ readTransportEquipment: () => ({ id: 'truck-5t', shortName: '5톤' }),
  getTransportEquipment: () => ({ id: 'truck-5t', category: 'truck' }), selectTransportEquipment: hooks.select,
  createCustomEquipment: (_: string, dimensions: unknown) => dimensions }));
import { captureCompanySnapshot, loadCompanySnapshot } from './simulationSnapshot';

const fresh = () => ({ container: { length: 6, width: 2, height: 2, maxPayloadKg: 5000, floorLoadLimitKgPerM2: 1000 },
  cargo: [{ id: 'A', name: '합성', length: 1, width: 1, height: 1, weightKg: 10, quantity: 1, maxTopLoadKg: 0, maxStackLayers: 1 }],
  result: { placements: [{ cargoId: 'A', unitId: 'A-1', x: 0, y: 0, z: 0, length: 1, width: 1, height: 1, weightKg: 10 }], remaining: [], validationIssues: [], loadedWeightKg: 10, usedVolumeM3: 1 } });
describe('explicit sharing and input-only restore', () => {
  beforeEach(() => { vi.clearAllMocks(); hooks.state = fresh(); hooks.target = { ...fresh(), mode: 'boxes' }; hooks.unit = 'boxes'; hooks.verified = true; hooks.certification = { status: 'passed', testedAt: '2026-10-09T00:00:00Z' }; });
  it('captures only current plan, freezes it, and retains declared strength limits', () => {
    Object.assign(hooks.state!, { personalBoxes: ['private'], token: 'do-not-share' });
    const saved = captureCompanySnapshot();
    expect(JSON.stringify(saved)).not.toMatch(/private|do-not-share/);
    expect(saved.cargo[0].maxTopLoadKg).toBe(0);
    expect(saved.recordedVerification?.status).toBe('passed');
    hooks.state!.cargo[0].quantity = 99;
    expect(saved.cargo[0].quantity).toBe(1);
  });
  it('never attributes stale evidence to edited input or a failed current certification', () => {
    hooks.state!.container.length = 7;
    expect(captureCompanySnapshot().recordedVerification).toBeUndefined();
    hooks.state = fresh(); hooks.verified = false;
    expect(captureCompanySnapshot().recordedVerification).toBeUndefined();
  });
  it('restores inputs and invalidates all current derived results and evidence', () => {
    const saved = captureCompanySnapshot(); loadCompanySnapshot(saved);
    for (const reset of [hooks.clearCert, hooks.clearPhysics, hooks.clearOverride, hooks.clearPallet]) expect(reset).toHaveBeenCalledOnce();
    expect(hooks.write).toHaveBeenCalledWith({ container: saved.container, cargo: saved.cargo }, true);
    expect(hooks.write.mock.calls[0][0]).not.toHaveProperty('result');
    expect(hooks.publishUnit).toHaveBeenCalledWith('boxes');
    expect(hooks.select.mock.calls[0][0]).toMatchObject({ category: 'truck', maxPayloadKg: 5000, floorLoadLimitKgPerM2: 1000 });
  });
  it('does not capture a previous loading mode after switching with identical inputs', () => {
    hooks.unit = 'pallets';
    const palletDraft = captureCompanySnapshot();
    expect(palletDraft.mode).toBe('pallets'); expect(palletDraft.result).toBeUndefined(); expect(palletDraft.recordedVerification).toBeUndefined();
    hooks.unit = 'boxes'; hooks.target!.mode = 'pallets';
    expect(captureCompanySnapshot().mode).toBe('boxes'); expect(captureCompanySnapshot().recordedVerification).toBeUndefined();
  });
  it('rejects invalid imports before any current plan is changed; discloses unsupported mixed mode', () => {
    expect(() => loadCompanySnapshot({ schemaVersion: 99 } as unknown as Snapshot)).toThrow(); expect(hooks.write).not.toHaveBeenCalled();
    expect(hooks.clearCert).not.toHaveBeenCalled();
    hooks.unit = 'mixed'; expect(() => captureCompanySnapshot()).toThrow('혼합');
  });
});
