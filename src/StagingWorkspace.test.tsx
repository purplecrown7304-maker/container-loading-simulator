import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StagingWorkspace, { emptyStagingPalletSnapshot, stagingDragPosition } from './StagingWorkspace';
import { useStagingScene, type StagingSceneBridge } from './stagingSceneContext';
import type { StagingWorkspaceProps, StagingApplication } from './stagingWorkspaceTypes';
import type { StagingYardPanelProps } from './StagingYardPanel';
import type { LoadingResult } from './engine/types';
import { defaultPalletSpec } from './engine/palletOptimization';
import { readStoredState, STORAGE_KEY, STORAGE_RESET_EVENT, STORAGE_UPDATED_EVENT, writeStoredState } from './storage';
import { stagingInputSignature } from './stagingInventory';
import { clearPalletSnapshot, publishPalletSnapshot, readPalletSnapshot } from './palletSnapshotStore';
import { choosePalletType } from './palletTypeSelection';
import { recordPalletJobSpec } from './palletJobSpecs';
import { STAGING_PALLET_PLAN_EVENT, type StagingPalletPlanDetail } from './stagingPalletBridge';
import { INERTIA_CERTIFICATION_EVENT, buildSecuringUsage, createPhysicsTargetSignature, readLatestInertiaCertification, type InertiaCertification } from './inertiaCertification';
import { physicsTargetFromPalletSnapshot } from './certifiedExport';

let panel: StagingYardPanelProps;
vi.mock('./StagingYardPanel', () => ({ default: (props: StagingYardPanelProps) => { panel = props; return <div data-controller-panel />; } }));
let bridge: StagingSceneBridge;
function Probe() { bridge = useStagingScene()!; return <div data-staging-summary-slot />; }
const container = { length: 4, width: 2, height: 2, maxPayloadKg: 1000, floorLoadLimitKgPerM2: 10000 };
const cargo = [{ id: 'A', name: 'real box', length: 1, width: 1, height: .5, weightKg: 20, quantity: 3, maxStackLayers: 1, maxTopLoadKg: 0 }];
const empty = (): LoadingResult => ({ placements: [], remaining: [], loadedWeightKg: 0, usedVolumeM3: 0, validationIssues: [] });
let root: Root, host: HTMLDivElement, props: StagingWorkspaceProps, applications: StagingApplication[];
let accept = true;
async function render(change: Partial<StagingWorkspaceProps> = {}) {
  props = { ...props, ...change };
  await act(async () => root.render(<StagingWorkspace {...props} />));
}
async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 8)); }); }
async function loadFirst() {
  await act(async () => bridge.selectUnit(bridge.inventory.yardUnits[0].id));
  await act(async () => panel.onLoad()); await settle();
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); localStorage.clear(); sessionStorage.clear(); clearPalletSnapshot();
  choosePalletType('company-default'); recordPalletJobSpec('company-default', defaultPalletSpec);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host); applications = []; accept = true;
  props = { container, cargo, mode: 'boxes', inputKey: 'input-1', result: empty(), isPreview: true, calculating: false,
    children: <Probe />, onApply: application => {
      applications.push(application); if (!accept) return false;
      if (application.adoptPallet && !application.adoptPallet()) return false;
      if (application.palletSnapshot) publishPalletSnapshot(application.palletSnapshot);
      void render({ result: application.result, isPreview: false }); return true;
    } };
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals(); });

describe('staging workspace controller', () => {
  it('uses the guided summary slot, derives real demand and persists only an accepted transfer', async () => {
    await render(); await settle(); expect(bridge.inventory.summary.total.boxes).toBe(3);
    expect(host.querySelector('[data-staging-summary-slot] [data-controller-panel]')).not.toBeNull();
    expect(readStoredState()).toBeNull(); await loadFirst();
    expect(applications).toHaveLength(1); expect(bridge.inventory.summary.vehicle.boxes).toBe(1);
    expect(bridge.inventory.summary.yard.boxes).toBe(2); expect(panel.canUndo).toBe(true);
    expect(readStoredState()?.result?.placements).toHaveLength(1);
    expect(readStoredState()?.staging?.selectedUnitId).toBe(bridge.selectedUnitId);
    expect(readStoredState()?.result?.placements[0].unitId).toBeDefined();
  });
  it('rejects a parent freshness refusal without changing stock, history or storage', async () => {
    accept = false; await render(); await settle(); await loadFirst();
    expect(applications).toHaveLength(1); expect(bridge.inventory.summary.yard.boxes).toBe(3);
    expect(panel.canUndo).toBe(false); expect(readStoredState()).toBeNull();
  });
  it('withdraws and undoes atomically while preserving each box identity', async () => {
    await render(); await settle(); await loadFirst(); const id = bridge.selectedUnitId;
    await act(async () => panel.onWithdraw()); await settle();
    expect(bridge.inventory.summary.vehicle.boxes).toBe(0); expect(bridge.inventory.summary.yard.boxes).toBe(3);
    expect(bridge.selectedUnitId).toBe(id); expect(props.result.remaining.some(row => row.reasonCode === 'STAGING_WITHDRAWN')).toBe(true);
    await act(async () => panel.onUndo()); await settle();
    expect(bridge.inventory.summary.vehicle.boxes).toBe(1); expect(bridge.selectedUnitId).toBe(id);
    expect(props.result.placements[0].unitId).toBe(applications[0].result.placements[0].unitId);
    expect(props.result).not.toHaveProperty('inertiaCertification');
  });
  it('rechecks a drag at drop time, rejects outside drops and clears a late drag after input changes', async () => {
    await render(); await settle(); const unit = bridge.inventory.yardUnits[0];
    await act(async () => bridge.onDragStart({ unitId: unit.id, point: [20, 0, 0] }));
    expect(bridge.preview?.valid).toBe(false);
    await act(async () => bridge.onDragEnd({ unitId: unit.id, point: [20, 0, 0] }));
    expect(applications).toHaveLength(0); expect(bridge.inventory.summary.yard.boxes).toBe(3);
    await act(async () => bridge.onDragStart({ unitId: unit.id, point: [0, 0, 0] })); expect(bridge.preview?.valid).toBe(true);
    await render({ inputKey: 'input-2', cargo: [{ ...cargo[0], quantity: 4 }] });
    expect(bridge.selectedUnitId).toBeNull(); expect(bridge.preview).toBeNull();
    await act(async () => bridge.onDragEnd({ unitId: unit.id, point: [0, 0, 0] }));
    expect(applications).toHaveLength(0); expect(bridge.inventory.summary.yard.boxes).toBe(4);
  });
  it('keeps view actions separate from accepted result and advances each explicit view request once', async () => {
    await render(); await settle(); await loadFirst(); const result = props.result, saved = localStorage.getItem(STORAGE_KEY), count = applications.length;
    const request = bridge.viewRequest; await act(async () => bridge.setView('yard'));
    expect(bridge.viewRequest).toBe(request + 1); await act(async () => panel.onArrange());
    expect(bridge.viewRequest).toBe(request + 2); expect(props.result).toBe(result); expect(applications).toHaveLength(count);
    await settle(); expect(localStorage.getItem(STORAGE_KEY)).toBe(saved);
  });
  it('shows all small shipments, pages large yards and never invents boxes from unconfirmed EA', async () => {
    await render({ cargo: [{ ...cargo[0], quantity: 20 }] }); await settle();
    expect(bridge.visibleZoneIds).toHaveLength(bridge.layout.zones.length); expect(panel.zonePageCount).toBe(1);
    await render({ inputKey: 'large', cargo: [{ ...cargo[0], quantity: 100 }] }); await settle();
    expect(bridge.visibleZoneIds).toHaveLength(4); const first = [...bridge.visibleZoneIds];
    await act(async () => panel.onZonePage(1)); expect(bridge.visibleZoneIds.some(id => first.includes(id))).toBe(false);
    expect(bridge.inventory.summary.total.boxes).toBe(100);
    const result = props.result, request = bridge.viewRequest, applicationCount = applications.length;
    await act(async () => bridge.setView('all'));
    expect(bridge.view).toBe('all'); expect(bridge.viewRequest).toBe(request + 1);
    expect(panel.zonePage).toBe(0); expect(bridge.visibleZoneIds).toEqual(first);
    expect(bridge.inventory.summary.total.boxes).toBe(100); expect(props.result).toBe(result); expect(applications).toHaveLength(applicationCount);
    await act(async () => panel.onZonePage(1));
    await act(async () => bridge.setView('vehicle'));
    expect(panel.zonePage).toBe(1); expect(bridge.visibleZoneIds.some(id => first.includes(id))).toBe(false);
    await render({ inputKey: 'pending', cargo: [], preparedCargo: [], pendingProducts: 237, inputsConfirmed: false });
    expect(bridge.inventory.units).toEqual([]); expect(panel.canLoad).toBe(false); expect(panel.message).toContain('237 EA');
  });
  it('saves an automatic accepted plan and selected metadata, then restores it after reload', async () => {
    const result: LoadingResult = { ...empty(), placements: [{ cargoId: 'A', unitId: 'engine-a', x: 1.5, y: .5, z: 0, length: 1, width: 1, height: .5, weightKg: 20 }], loadedWeightKg: 20, usedVolumeM3: .5 };
    await render({ result, isPreview: false }); await settle();
    expect(readStoredState()?.result?.placements).toHaveLength(1);
    await act(async () => bridge.selectVehicleUnit('cargo', 0)); await settle(); const selectedId = bridge.selectedUnitId;
    expect(readStoredState()?.staging?.selectedUnitId).toBe(selectedId);
    await act(async () => root.unmount()); root = createRoot(host); applications = [];
    await render({ result: empty(), isPreview: true }); await settle();
    expect(applications).toHaveLength(1); expect(bridge.inventory.summary.vehicle.boxes).toBe(1); expect(bridge.selectedUnitId).toBe(selectedId);
  });
  it('does not replace saved matching positions with an empty preview before restoration', async () => {
    const input = { scopeKey: 'operator:guest|active', mode: 'boxes' as const, container, cargo };
    const result: LoadingResult = { ...empty(), placements: [{ cargoId: 'A', unitId: 'saved-a', x: 1.5, y: .5, z: 0, length: 1, width: 1, height: .5, weightKg: 20 }], loadedWeightKg: 20, usedVolumeM3: .5 };
    writeStoredState({ container, cargo, result, staging: { version: 1, scopeKey: input.scopeKey, inputSignature: stagingInputSignature(input), mode: 'boxes', identity: { unitToStableId: {} }, selectedUnitId: null } });
    await render(); expect(readStoredState()?.result?.placements).toHaveLength(1); await settle();
    expect(bridge.inventory.summary.vehicle.boxes).toBe(1); expect(readStoredState()?.result?.placements).toHaveLength(1);
    await render({ inputKey: 'changed', cargo: [{ ...cargo[0], quantity: 4 }], isPreview: true }); await settle();
    expect(bridge.inventory.summary.vehicle.boxes).toBe(0); expect(bridge.inventory.summary.yard.boxes).toBe(4);
    expect(readStoredState()?.staging?.inputSignature).toBe(stagingInputSignature(input));
  });
  it('replaces same-input named snapshots atomically and discards the other plan undo history', async () => {
    await render(); await settle(); await loadFirst(); const loaded = readStoredState()!;
    await act(async () => panel.onWithdraw()); await settle(); const waiting = readStoredState()!;
    expect(bridge.inventory.summary.vehicle.boxes).toBe(0); expect(panel.canUndo).toBe(true);
    await act(async () => writeStoredState(loaded, true)); await settle();
    expect(bridge.inventory.summary.vehicle.boxes).toBe(1); expect(panel.canUndo).toBe(false);
    expect(bridge.selectedUnitId).toBe(loaded.staging!.selectedUnitId);
    await act(async () => writeStoredState(waiting, true)); await settle();
    expect(bridge.inventory.summary.vehicle.boxes).toBe(0); expect(bridge.inventory.summary.yard.boxes).toBe(3);
    expect(panel.canUndo).toBe(false);
  });
  it('does not reapply an older saved staging plan after an input-only recovered-plan notification', async () => {
    await render(); await settle(); await loadFirst();
    const oldSaved = readStoredState()!;
    const recovered: LoadingResult = { ...props.result,
      placements: props.result.placements.map(placement => ({ ...placement, x: .25 })) };
    applications = [];
    await act(async () => {
      window.dispatchEvent(new CustomEvent(STORAGE_UPDATED_EVENT, { detail: { container, cargo } }));
      await render({ result: recovered, isPreview: false });
    });
    await settle(); await settle();
    // A restore calls onApply and invalidates the optimizer's fresh certification.
    expect(applications).toHaveLength(0); expect(props.result).toBe(recovered);
    expect(readStoredState()?.result?.placements).toEqual(recovered.placements);
    expect(oldSaved.result?.placements[0].x).not.toBe(recovered.placements[0].x);
  });
  it('restores the explicitly notified staging payload before consulting older local storage', async () => {
    await render(); await settle(); await loadFirst(); const loaded = readStoredState()!;
    await act(async () => panel.onWithdraw()); await settle();
    expect(readStoredState()?.result?.placements).toHaveLength(0); applications = [];
    await act(async () => window.dispatchEvent(new CustomEvent(STORAGE_UPDATED_EVENT, { detail: loaded })));
    await settle(); await settle();
    expect(applications).toHaveLength(1); expect(bridge.inventory.summary.vehicle.boxes).toBe(1);
    expect(panel.canUndo).toBe(false); expect(bridge.selectedUnitId).toBe(loaded.staging!.selectedUnitId);
  });
  it('forgets a deleted staged plan when the same inputs are reentered after reset', async () => {
    await render(); await settle(); await loadFirst();
    expect(readStoredState()?.staging).toBeDefined(); applications = [];
    await act(async () => {
      localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new Event(STORAGE_RESET_EVENT));
      await render({ inputKey: 'reset-empty', cargo: [], result: empty(), isPreview: true });
    });
    await settle(); expect(panel.canUndo).toBe(false); expect(bridge.selectedUnitId).toBeNull();
    await render({ inputKey: 'reset-reentered', cargo, result: empty(), isPreview: true });
    await settle(); await settle();
    expect(applications).toHaveLength(0); expect(bridge.inventory.summary.vehicle.boxes).toBe(0);
    expect(bridge.inventory.summary.yard.boxes).toBe(3); expect(readStoredState()).toBeNull();
  });
  it('provides mixed initial scaffolding and inverses the world footprint center without moving the vehicle floor', () => {
    const snapshot = emptyStagingPalletSnapshot(defaultPalletSpec, 'mixed');
    expect(snapshot.result).toMatchObject({ pallets: [], placements: [], mixed: { enabled: true, palletCount: 0, directBoxCount: 0 } });
    expect(stagingDragPosition({ length: 1, width: 1 } as never, [0, -.9, 0], container)).toEqual({ x: 1.5, y: .5, z: 0 });
  });
  it('loads, withdraws and undoes a whole mixed pallet with the same members and packaging', async () => {
    const spec = { ...defaultPalletSpec, length: 1, width: 1, height: .15, tareWeightKg: 5,
      maxLoadKg: 500, maxStaticLoadKg: 1000, maxSupportedTopWeightKg: 1000, maxStackLevels: 1,
      useWrapping: false, useCornerGuards: false };
    recordPalletJobSpec('company-default', spec);
    const ack = (event: Event) => { (event as CustomEvent<StagingPalletPlanDetail>).detail.accepted = true; };
    window.addEventListener(STAGING_PALLET_PLAN_EVENT, ack);
    try {
      await render({ mode: 'mixed', cargo: [{ ...cargo[0], mixedLoadingMethod: 'pallet' }] }); await settle(); await settle();
      expect(bridge.inventory.yardUnits.every(unit => unit.kind === 'pallet')).toBe(true);
      const unit = bridge.inventory.yardUnits[0], members = unit.boxUnits.map(box => box.id), id = unit.id;
      await loadFirst(); await settle(); expect(bridge.inventory.summary.vehicle.pallets).toBe(1);
      expect(bridge.selectedUnitId).toBe(id); expect(bridge.inventory.vehicleUnits[0].boxUnits.map(box => box.id)).toEqual(members);
      expect(applications[0].palletSnapshot?.result).toMatchObject({ mixed: { enabled: true, palletCount: 1 } });
      const target = physicsTargetFromPalletSnapshot(container, props.cargo, readPalletSnapshot()!);
      const actualPlan: InertiaCertification = { mode: 'pallets', status: 'failed', targetSignature: createPhysicsTargetSignature(target), testedAt: new Date(0).toISOString(), securing: buildSecuringUsage(target, 3), testedScenarios: 0, passedScenarios: 0, failedScenarios: [], maxHorizontalShiftM: 0, maxTiltDeg: 0, results: {}, payloadWithinLimit: true };
      await act(async () => { (window as Window & { __containerLoadingLatestCertification?: InertiaCertification }).__containerLoadingLatestCertification = actualPlan; window.dispatchEvent(new CustomEvent(INERTIA_CERTIFICATION_EVENT, { detail: actualPlan })); }); await settle();
      const plannedPackaging = bridge.inventory.vehicleUnits[0].packaging;
      expect(plannedPackaging?.bandingStraps).toBe(4);
      expect(plannedPackaging).toMatchObject({ wrapping: true, cornerGuards: true, source: 'transport-reinforcement' });
      await act(async () => panel.onWithdraw()); await settle(); await settle();
      expect(bridge.inventory.summary.vehicle.pallets).toBe(0); expect(bridge.inventory.summary.yard.pallets).toBe(3);
      const returned = bridge.inventory.yardUnits.find(candidate => candidate.id === id)!;
      expect(returned.boxUnits.map(box => box.id)).toEqual(members); expect(returned.packaging).toEqual(plannedPackaging);
      expect(props.result.securingBudget?.level).toBe(3); expect(readLatestInertiaCertification()).toBeUndefined();
      expect(readStoredState()?.staging?.yardPallets).toHaveLength(3);
      await act(async () => panel.onUndo()); await settle(); await settle();
      expect(bridge.inventory.summary.vehicle.pallets).toBe(1); expect(bridge.inventory.summary.yard.pallets).toBe(2);
      expect(bridge.inventory.vehicleUnits[0].id).toBe(id); expect(bridge.inventory.vehicleUnits[0].boxUnits.map(box => box.id)).toEqual(members);
      expect(bridge.inventory.vehicleUnits[0].packaging?.bandingStraps).toBe(4); expect(props.result.securingBudget?.level).toBe(3);
      await act(async () => recordPalletJobSpec('company-default', { ...spec, useWrapping: true })); await settle();
      expect(bridge.selectedUnitId).toBeNull(); expect(panel.canUndo).toBe(false); expect(bridge.inventory.summary.vehicle.pallets).toBe(0);
    } finally { window.removeEventListener(STAGING_PALLET_PLAN_EVENT, ack); }
  });
});
