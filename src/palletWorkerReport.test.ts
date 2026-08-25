import { describe, expect, it } from 'vitest';
import type { InertiaCertification } from './inertiaCertification';
import { buildPalletLoadingReportHtml, type PalletWorkSnapshot } from './palletWorkerReport';
import type { CargoItem, ContainerSpec } from './engine/types';

const container: ContainerSpec = { length: 4.4, width: 2.2, height: 2.6, maxPayloadKg: 5000 };
const cargo: CargoItem[] = [{ id: 'A', name: '<b>제품 A</b>', length: 0.5, width: 0.5, height: 0.4, weightKg: 10, quantity: 4 }];

const snapshot: PalletWorkSnapshot = {
  spec: {
    length: 1.1, width: 1.1, height: 0.15, tareWeightKg: 25, maxLoadKg: 1000,
    maxStackLevels: 2, maxSupportedTopWeightKg: 1000, useCornerGuards: false,
    cornerGuardWeightKg: 2, cornerGuardExtraHeightM: 0.03, useWrapping: false,
    wrappingWeightKg: 1.5, wrappingExtraHeightM: 0.01, minimizePackaging: true,
  },
  result: {
    pallets: [
      {
        palletIndex: 1, x: 0, y: 0, z: 0, stackLevel: 1, stackColumn: 1,
        length: 1.1, width: 1.1, height: 0.15,
        cargoPlacements: [
          { cargoId: 'A', x: 0, y: 0, z: 0.15, length: 0.5, width: 0.5, height: 0.4, weightKg: 10 },
          { cargoId: 'A', x: 0.5, y: 0, z: 0.15, length: 0.5, width: 0.5, height: 0.4, weightKg: 10 },
        ],
        cargoWeightKg: 20, packagingWeightKg: 0, packagingExtraHeightM: 0,
        cornerGuardsUsed: false, wrappingUsed: false, totalWeightKg: 45,
        centerOfGravity: { x: 0.5, y: 0.25, z: 0.3 },
      },
      {
        palletIndex: 2, x: 0, y: 0, z: 0.55, stackLevel: 2, stackColumn: 1,
        length: 1.1, width: 1.1, height: 0.15,
        cargoPlacements: [
          { cargoId: 'A', x: 0, y: 0, z: 0.70, length: 0.5, width: 0.5, height: 0.4, weightKg: 10 },
          { cargoId: 'A', x: 0.5, y: 0, z: 0.70, length: 0.5, width: 0.5, height: 0.4, weightKg: 10 },
        ],
        cargoWeightKg: 20, packagingWeightKg: 0, packagingExtraHeightM: 0,
        cornerGuardsUsed: false, wrappingUsed: false, totalWeightKg: 45,
        centerOfGravity: { x: 0.5, y: 0.25, z: 0.85 },
      },
    ],
    placements: [
      { cargoId: 'A', x: 0, y: 0, z: 0.15, length: 0.5, width: 0.5, height: 0.4, weightKg: 10 },
      { cargoId: 'A', x: 0.5, y: 0, z: 0.15, length: 0.5, width: 0.5, height: 0.4, weightKg: 10 },
      { cargoId: 'A', x: 0, y: 0, z: 0.70, length: 0.5, width: 0.5, height: 0.4, weightKg: 10 },
      { cargoId: 'A', x: 0.5, y: 0, z: 0.70, length: 0.5, width: 0.5, height: 0.4, weightKg: 10 },
    ],
    remaining: [], palletCount: 2, loadedCargoWeightKg: 40, totalPackagingWeightKg: 0,
    avoidedPackagingWeightKg: 0, packagedPalletCount: 0, totalPalletizedWeightKg: 90,
    consolidatedPallets: 0, lateralImbalanceKg: 0, stackedPallets: 1, maxUsedStackLevel: 2,
    optimization: { selectedStackTarget: 2, candidateCount: 2, floorPositions: 1, redistributedForLowUtilization: false, consolidationPasses: 0 },
  },
};

const certification: InertiaCertification = {
  status: 'passed', mode: 'pallets', targetSignature: 'test', testedAt: '2026-08-25T00:00:00Z',
  securing: {
    level: 2, levelLabel: '2차 보강 · 밴딩+각대+랩핑', palletCount: 2, palletWeightKg: 50,
    bandingStraps: 6, bandingLengthM: 18, cornerGuards: 8, cornerGuardLengthM: 3.2,
    wrappingLengthM: 28, antiSlipMats: 2, dunnageBlocks: 0, loadBars: 0,
    estimatedAddedWeightKg: 2.1, estimatedNonCargoWeightKg: 52.1,
  },
  testedScenarios: 3, passedScenarios: 3, failedScenarios: [], maxHorizontalShiftM: 0.006,
  maxTiltDeg: 0.9, results: {}, payloadWithinLimit: true,
};

describe('pallet worker report', () => {
  it('renders pallet numbers, stack positions, securing legend and worker checks', () => {
    const html = buildPalletLoadingReportHtml(container, cargo, snapshot, certification);
    expect(html).toContain('팔레트 적재 작업지시서');
    expect(html).toContain('P1');
    expect(html).toContain('P2');
    expect(html).toContain('C1');
    expect(html).toContain('2단');
    expect(html).toContain('검은 선=밴딩');
    expect(html).toContain('밴딩 3줄');
    expect(html).toContain('파란 점선=랩핑');
    expect(html).toContain('□ 팔레트 흔들림·오버행 없음');
  });

  it('escapes cargo names in the worker table', () => {
    const html = buildPalletLoadingReportHtml(container, cargo, snapshot, certification);
    expect(html).toContain('&lt;b&gt;제품 A&lt;/b&gt;');
    expect(html).not.toContain('<b>제품 A</b>');
  });
});
