import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompanyProductItem } from './companyProduct';
import ConfirmedPackagingLoadingBridge from './ConfirmedPackagingLoadingBridge';
import { buildBlackboxSnapshots } from './diagnosticBlackbox';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { clearLatestInertiaCertification } from './inertiaCertification';
import PackagingDataIntegrityGuard from './PackagingDataIntegrityGuard';
import { clearPhysicsTarget } from './physicsTarget';
import { cargoFromProductPackaging } from './productWorkflow';
import { buildLoadingReportHtml } from './report';
import { reportCargoCatalog } from './reportCargo';
import { writeShipmentInstructionSnapshot } from './shipmentInstruction';
import { readStoredState, writeStoredState } from './storage';
import { APP_ACTION_EVENT } from './uiEvents';
import { vehicleSplitDocumentNote, vehicleSplitReportHtml, vehicleSplitSummaryRows } from './vehicleSplitPresentation';
import { confirmedShipmentOfSplit, resetVehicleSplitStateForTests, selectSplitVehicle, startVehicleSplit } from './vehicleSplitState';

/**
 * A vehicle of a divided job (AGENTS.md 2L) holds a share of the confirmed cargo on purpose.
 * Its documents must name the vehicle, and the guards that protect the confirmed packaging
 * must accept the share only while the whole divided job is still that packaging.
 */
const container: ContainerSpec = { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 };
const products: CompanyProductItem[] = [
  { id: 'SLAB', name: '<b>슬래브</b>', length: 1, width: 2.3, height: .5, weightKg: 4, quantity: 7, requiresBoxPackaging: false },
  { id: 'CASE', name: '케이스', length: .6, width: .4, height: .3, weightKg: 9, quantity: 4, requiresBoxPackaging: false },
] as CompanyProductItem[];
let confirmed: CargoItem[];

function loadedResult(cargo: CargoItem[]): LoadingResult {
  const placements = cargo.flatMap(item => Array.from({ length: item.quantity }, (_, index) => ({
    cargoId: item.id, x: index * item.length, y: 0, z: 0, length: item.length, width: item.width, height: item.height, weightKg: item.weightKg, rotated: false,
  })));
  return { placements, remaining: [], validationIssues: [], loadedWeightKg: placements.reduce((sum, p) => sum + p.weightKg, 0), usedVolumeM3: 1 };
}

beforeEach(() => {
  localStorage.clear();
  resetVehicleSplitStateForTests();
  clearLatestInertiaCertification();
  clearPhysicsTarget();
  confirmed = cargoFromProductPackaging(products, []);
  writeShipmentInstructionSnapshot(products, [], confirmed);
  writeStoredState({ container, cargo: confirmed });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('documents of one vehicle of a divided job', () => {
  it('names the vehicle and lists every vehicle of the job', () => {
    expect(vehicleSplitDocumentNote(confirmed)).toBeNull();
    startVehicleSplit(2);
    const share = readStoredState()!.cargo;
    // The whole cargo is not the open vehicle's cargo and gets no vehicle mark.
    expect(vehicleSplitDocumentNote(confirmed)).toBeNull();
    const note = vehicleSplitDocumentNote(share)!;
    expect(note).toMatchObject({ label: '차량 1/2', vehicle: 1, vehicleCount: 2, totalUnits: 11 });
    expect(note.vehicles.map(item => [item.vehicle, item.units, item.current])).toEqual([[1, 6, true], [2, 5, false]]);
    expect(note.vehicles.reduce((sum, item) => sum + item.weightKg, 0)).toBe(7 * 4 + 4 * 9);

    const html = vehicleSplitReportHtml(note);
    expect(html).toContain('data-vehicle-split="1/2"');
    expect(html).toContain('전체 11 EA를 차량 2대에 고르게 나눈 화물입니다');
    expect(html).toContain('차량 2 · 5 EA');
    expect(vehicleSplitSummaryRows(note)).toEqual([
      ['차량 구분', '차량 1/2 · 나눠 싣는 화물'],
      ['전체 출하 수량(EA, 모든 차량)', 11],
      // Whole shares weigh 30 kg each; the odd slab (4 kg) goes to vehicle 1.
      ['차량 1', '6 EA · 34 kg · 이 문서'],
      ['차량 2', '5 EA · 30 kg'],
    ]);
  });

  it('marks the work order of each vehicle and keeps the plain one unmarked', () => {
    const plain = buildLoadingReportHtml(container, confirmed, loadedResult(confirmed));
    expect(plain).not.toContain('vehicle-split-note"');
    expect(plain).not.toContain('차량 1/2');

    startVehicleSplit(2);
    const first = readStoredState()!.cargo;
    const firstHtml = buildLoadingReportHtml(container, first, loadedResult(first));
    expect(firstHtml).toContain('<title>컨테이너 통합 출하·적재 작업지시서 · 차량 1/2</title>');
    expect(firstHtml).toContain('data-vehicle-split="1/2"');
    expect(firstHtml).toContain('차량별로 나눈 화물입니다');
    expect(firstHtml).toContain('차량별 화물 기준');
    // Product names keep their confirmed identity and stay escaped.
    expect(firstHtml).not.toContain('<b>슬래브</b>');
    expect([...reportCargoCatalog(first).values()].map(item => item.code)).toEqual(['SLAB', 'CASE']);

    selectSplitVehicle(1);
    const second = readStoredState()!.cargo;
    expect(buildLoadingReportHtml(container, second, loadedResult(second))).toContain('작업지시서 · 차량 2/2</title>');
    // A report about some other cargo than the open share carries no vehicle mark.
    expect(buildLoadingReportHtml(container, first, loadedResult(first))).not.toContain('data-vehicle-split=');
  });

  it('records the division in the check file and compares the packaging with the whole job', () => {
    startVehicleSplit(2);
    const share = readStoredState()!.cargo;
    const snapshots = buildBlackboxSnapshots(container, share, loadedResult(share));
    expect(snapshots.loadingInput.cargo).toEqual(share);
    expect(snapshots.loadingInput.vehicleSplit).toMatchObject({ vehicle: 1, vehicleCount: 2, sourceCargo: confirmed });
    expect(snapshots.packaging).toMatchObject({ cargoMatchesShipmentSignature: false, wholeJobMatchesShipmentSignature: true });
    const checks = snapshots.consistency.checks as Array<{ id: string; severity: string; detail: string }>;
    expect(checks.find(check => check.id === 'packaging-signature')?.severity).toBe('OK');
    expect(checks.filter(check => check.id.startsWith('packaging-cargo-')).map(check => check.severity)).toEqual(['OK', 'OK']);
    expect(checks.find(check => check.id === 'vehicle-split')?.detail).toContain('차량 2대에 고르게 나눈 것 중 차량 1');
  });
});

describe('packaging guards for one vehicle of a divided job', () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

  const runLoading = () => {
    const reached = vi.fn();
    window.addEventListener(APP_ACTION_EVENT, reached);
    window.dispatchEvent(new CustomEvent(APP_ACTION_EVENT, { detail: { action: 'run-loading' } }));
    window.removeEventListener(APP_ACTION_EVENT, reached);
    return reached;
  };

  it('lets a share run while the whole divided job is the confirmed packaging, and blocks it otherwise', async () => {
    const alert = vi.fn();
    vi.stubGlobal('alert', alert);
    await act(async () => root.render(<PackagingDataIntegrityGuard />));
    expect(runLoading()).toHaveBeenCalledOnce();

    startVehicleSplit(2);
    expect(confirmedShipmentOfSplit(readStoredState()!.cargo)).not.toBeNull();
    expect(runLoading()).toHaveBeenCalledOnce();
    expect(alert).not.toHaveBeenCalled();

    // The same share without a split behind it is exactly what the guard exists to stop.
    const share = readStoredState()!.cargo;
    localStorage.removeItem('container-loading-vehicle-split-v1');
    resetVehicleSplitStateForTests();
    writeStoredState({ container, cargo: share });
    expect(confirmedShipmentOfSplit(share)).toBeNull();
    expect(runLoading()).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledOnce();
  });

  it('blocks a share once the divided job no longer is the confirmed packaging', async () => {
    const alert = vi.fn();
    vi.stubGlobal('alert', alert);
    await act(async () => root.render(<PackagingDataIntegrityGuard />));
    startVehicleSplit(2);
    // Another packaging was confirmed meanwhile: the divided job is not that shipment.
    writeShipmentInstructionSnapshot(products.map(product => ({ ...product, quantity: product.quantity + 1 })), [], cargoFromProductPackaging(products.map(product => ({ ...product, quantity: product.quantity + 1 })), []));
    expect(confirmedShipmentOfSplit(readStoredState()!.cargo)).toBeNull();
    expect(runLoading()).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledOnce();
  });

  it('replays the run for a share with the confirmed identity, as it does for the whole cargo', async () => {
    await act(async () => root.render(<ConfirmedPackagingLoadingBridge />));
    startVehicleSplit(2);
    const replayed = new Promise<CustomEvent>(resolve => {
      const listen = (event: Event) => {
        const custom = event as CustomEvent<{ confirmedPackagingReplay?: boolean }>;
        if (!custom.detail?.confirmedPackagingReplay) return;
        window.removeEventListener(APP_ACTION_EVENT, listen);
        resolve(custom);
      };
      window.addEventListener(APP_ACTION_EVENT, listen);
    });
    // The first dispatch is intercepted; the bridge re-issues it after re-injecting the cargo.
    expect(runLoading()).not.toHaveBeenCalled();
    expect((await replayed).detail).toMatchObject({ action: 'run-loading', confirmedPackagingReplay: true });
    expect(readStoredState()!.cargo.reduce((sum, item) => sum + item.quantity, 0)).toBe(6);
  });
});
