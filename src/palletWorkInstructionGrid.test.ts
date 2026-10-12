import { fromAPlacement, toAItem } from './engine/loadSimAdapter';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultPalletSpec, type PalletLoad } from './engine/palletOptimization';
import type { CargoItem, Placement } from './engine/types';
import { buildPalletVehicleAddresses, palletAssemblyPlacements } from './palletWorkInstructionGrid';
import { buildWorkInstructionAddresses, buildWorkInstructionRuns, formatWorkAddress } from './workInstructionGrid';
import { buildPalletAssemblyHtml, type PalletWorkSnapshot } from './palletWorkerReportV2';
import { setUiLanguage, uiText } from './uiLanguage';

const cargo: CargoItem[] = [{ id: '한글 코드', name: '<b>박스 선택</b>', quantity: 4, length: .5, width: .5, height: .4, weightKg: 1 }];
function pallet(index: number, column: number, level: number, x: number, y: number, z: number, local?: Placement[]): PalletLoad {
  const boxes = local ?? [
    { cargoId: '한글 코드', x: 0, y: 0, z: 0, length: .5, width: .5, height: .4, weightKg: 1 },
    { cargoId: '한글 코드', x: 0, y: .5, z: 0, length: .5, width: .5, height: .4, weightKg: 1 },
    { cargoId: '한글 코드', x: .5, y: 0, z: 0, length: .5, width: .5, height: .4, weightKg: 1 },
    { cargoId: '한글 코드', x: 0, y: 0, z: .4, length: .5, width: .5, height: .4, weightKg: 1 },
  ];
  return { palletIndex: index, stackColumn: column, stackLevel: level, x, y, z, length: 1.1, width: 1.1, height: .15,
    cargoPlacements: boxes.map(p => ({ ...p, x: p.x + x, y: p.y + y, z: p.z + z + .15 })),
    cargoWeightKg: boxes.length, packagingWeightKg: 0, packagingExtraHeightM: 0, cornerGuardsUsed: false, wrappingUsed: false,
    totalWeightKg: boxes.length + 25, centerOfGravity: { x: x + .5, y: y + .5, z: z + .5 },
  };
}
function snapshot(pallets: PalletLoad[]): PalletWorkSnapshot {
  return { spec: defaultPalletSpec, result: { pallets, placements: pallets.flatMap(p => p.cargoPlacements), remaining: [],
    palletCount: pallets.length, loadedCargoWeightKg: 0, totalPackagingWeightKg: 0, avoidedPackagingWeightKg: 0,
    packagedPalletCount: 0, totalPalletizedWeightKg: 0, consolidatedPallets: 0, lateralImbalanceKg: 0,
    stackedPallets: 0, maxUsedStackLevel: 2, optimization: { selectedStackTarget: 2, candidateCount: 1, floorPositions: 3, redistributedForLowUtilization: false, consolidationPasses: 0 } } };
}
afterEach(() => setUiLanguage('ko'));

describe('pallet work instruction numbering', () => {
  it('anchors vehicle rows and columns to stable C stacks and keeps unequal-height physical tiers', () => {
    const pallets = [pallet(10, 7, 1, 0, 0, 0), pallet(20, 9, 1, 0, 1.1, 0), pallet(11, 7, 2, 0, 0, .95), pallet(21, 9, 2, 0, 1.1, .55), pallet(30, 12, 1, 1.2, 0, 0)];
    const before = JSON.stringify(pallets);
    const addresses = buildPalletVehicleAddresses(pallets);
    expect(addresses.get(10)).toEqual({ column: 2, row: 1, layer: 1 });
    expect(addresses.get(20)).toEqual({ column: 1, row: 1, layer: 1 });
    expect(addresses.get(11)).toEqual({ column: 2, row: 1, layer: 2 });
    expect(addresses.get(21)).toEqual({ column: 1, row: 1, layer: 2 });
    expect(addresses.get(30)).toEqual({ column: 1, row: 2, layer: 1 });
    expect([...buildPalletVehicleAddresses([...pallets].reverse()).entries()].sort()).toEqual([...addresses.entries()].sort());
    expect(JSON.stringify(pallets)).toBe(before);
  });

  it('restarts carton numbering on every pallet deck and covers L-shapes without phantom boxes', () => {
    const elevated = pallet(11, 7, 2, 1.2, 1.1, .95);
    const before = JSON.stringify(elevated);
    const local = palletAssemblyPlacements(elevated);
    const addresses = buildWorkInstructionAddresses(local);
    expect(addresses).toEqual([{ column: 2, row: 1, layer: 1 }, { column: 1, row: 1, layer: 1 }, { column: 1, row: 2, layer: 1 }, { column: 2, row: 1, layer: 2 }]);
    const runs = buildWorkInstructionRuns(local);
    expect(runs.reduce((sum, run) => sum + run.quantity, 0)).toBe(4);
    expect(runs.flatMap(run => run.indices).sort()).toEqual([0, 1, 2, 3]);
    for (const run of runs) expect((run.columnTo - run.columnFrom + 1) * (run.rowTo - run.rowFrom + 1)).toBe(run.quantity);
    expect(runs.filter(run => run.layer === 1).map(run => run.quantity)).toEqual([2, 1]);
    expect(JSON.stringify(elevated)).toBe(before);
  });

  it.each(['ko', 'en', 'vi'] as const)('renders exact per-pallet assembly diagrams and translated %s addresses without translating names', language => {
    setUiLanguage(language);
    const data = snapshot([pallet(10, 7, 1, 0, 0, 0), pallet(11, 7, 2, 0, 0, .95)]);
    const before = JSON.stringify(data);
    const html = buildPalletAssemblyHtml(data, cargo);
    const document = new DOMParser().parseFromString(html, 'text/html');
    const articles = [...document.querySelectorAll('[data-pallet-assembly]')];
    expect(articles).toHaveLength(2);
    for (const article of articles) {
      const cells = [...article.querySelectorAll('[data-pallet-box]')];
      expect(cells).toHaveLength(4);
      expect(article.querySelectorAll('svg[data-box-layer]')).toHaveLength(2);
      const rows = [...article.querySelectorAll('[data-assembly-quantity]')];
      expect(rows.reduce((sum, row) => sum + Number(row.getAttribute('data-assembly-quantity')), 0)).toBe(4);
      expect(rows.flatMap(row => row.getAttribute('data-box-indices')!.split(',').map(Number)).sort()).toEqual([0, 1, 2, 3]);
      expect(article.textContent).toContain(formatWorkAddress({ column: 1, row: 1, layer: 1 }));
      expect(article.textContent).toContain(uiText('문에서 본 오른쪽'));
      expect(article.textContent).toContain(uiText('문에서 본 왼쪽'));
    }
    expect(html).toContain('&lt;b&gt;박스 선택&lt;/b&gt;');
    expect(document.querySelector('b')?.textContent).not.toBe('박스 선택');
    if (language !== 'ko') expect(document.body.textContent!.replaceAll('한글 코드', '').replaceAll('<b>박스 선택</b>', '')).not.toMatch(/[가-힣]/);
    expect(JSON.stringify(data)).toBe(before);
  });
});

it.each(['ko', 'en', 'vi'] as const)('prints allowed side-laid A-rule carton orientation and dimensions in %s pallet assembly', language => {
  setUiLanguage(language);
  const item: CargoItem = { ...cargo[0], length: .6, width: .4, height: .3, quantity: 2, allowedOrientations: ['LWH', 'LHW'] };
  const sideways = fromAPlacement({ item: toAItem(item, 'sideways'), pos: { x: 0, y: 0, z: 0 }, orientation: 'LHW' }, item);
  const upright = fromAPlacement({ item: toAItem(item, 'upright'), pos: { x: 0, y: 300, z: 0 }, orientation: 'LWH' }, item);
  const data = snapshot([pallet(10, 7, 1, 0, 0, 0, [sideways, upright])]);
  const before = JSON.stringify(data);
  const document = new DOMParser().parseFromString(buildPalletAssemblyHtml(data, [item]), 'text/html');
  const rows = [...document.querySelectorAll('[data-assembly-quantity]')];
  expect(rows).toHaveLength(2);
  expect(rows.find(row => row.textContent?.includes('LHW'))?.textContent).toContain('0.6 × 0.3 × 0.4 m');
  expect(rows.find(row => row.textContent?.includes('LWH'))?.textContent).toContain('0.6 × 0.4 × 0.3 m');
  expect(rows.reduce((sum, row) => sum + Number(row.getAttribute('data-assembly-quantity')), 0)).toBe(2);
  expect(JSON.stringify(data)).toBe(before);
});
