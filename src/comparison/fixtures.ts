import type { CargoItem, ContainerSpec, LoadingResult, Placement } from '../engine/types';
import type { PhysicsSupport } from '../engine/physicsValidation';
import type { SecuringUsage } from '../inertiaCertification';
import type { InertiaAnimationFrame } from '../engine/inertiaSimulation';

export const fixtureNames = ['pallets', 'boxes', 'large', 'empty'] as const;
export type FixtureName = typeof fixtureNames[number];
const cargo: CargoItem[] = [
  { id: 'SAMPLE-A', name: '비교용 화물 A', productName: '정밀 부품', boxId: 'BOX-01', unitsPerPackage: 24, length: .55, width: .45, height: .45, weightKg: 10, quantity: 8, displayColor: '#70a1d7' },
  { id: 'SAMPLE-B', name: '비교용 화물 B', productName: '포장 샘플', boxId: 'BOX-02', unitsPerPackage: 12, length: .45, width: .55, height: .45, weightKg: 8, quantity: 8, displayColor: '#e8ad57' },
];
export function comparisonFixture(name: FixtureName) {
  const container: ContainerSpec = { length: name === 'large' ? 12 : 6, width: 2.4, height: 2.6, maxPayloadKg: 28000 };
  let placements: Placement[] = [], supports: PhysicsSupport[] = [];
  if (name === 'pallets') {
    supports = [
      { id: 'P1', modelKey: 'wood-pallet', x: .5, y: .45, z: 0, length: 1.2, width: 1.1, height: .15, weightKg: 25 },
      { id: 'P2', modelKey: 'plastic-pallet', x: 2.2, y: .45, z: 0, length: 1.2, width: 1.1, height: .15, weightKg: 15 },
    ];
    placements = supports.flatMap((support, pallet) => Array.from({ length: 8 }, (_, i) => ({ cargoId: pallet ? 'SAMPLE-B' : 'SAMPLE-A', x: support.x + .05 + i % 2 * .55, y: support.y + .1 + Math.floor(i / 2) % 2 * .45, z: .15 + Math.floor(i / 4) * .45, length: .55, width: .45, height: .45, weightKg: pallet ? 8 : 10, rotated: !!pallet })));
  }
  if (name === 'boxes' || name === 'large') {
    const count = name === 'large' ? 1200 : 12;
    const l = name === 'large' ? .2 : .6, w = name === 'large' ? .4 : .45, h = name === 'large' ? .4 : .5;
    placements = Array.from({ length: count }, (_, i) => ({ cargoId: i % 2 ? 'SAMPLE-B' : 'SAMPLE-A', x: i % (name === 'large' ? 60 : 3) * l, y: Math.floor(i / (name === 'large' ? 60 : 3)) % (name === 'large' ? 5 : 2) * w, z: Math.floor(i / (name === 'large' ? 300 : 6)) * h, length: l, width: w, height: h, weightKg: 2, rotated: i % 2 === 1 }));
  }
  const securing: SecuringUsage = { level: 2, levelLabel: '비교용 보강 샘플', palletCount: supports.length, palletWeightKg: 40, bandingStraps: supports.length * 4, bandingLengthM: 20, cornerGuards: supports.length * 4, cornerGuardLengthM: 8, wrappingLengthM: supports.length ? 15 : 0, antiSlipMats: 2, dunnageBlocks: supports.length ? 0 : 4, loadBars: 1, estimatedAddedWeightKg: 0, estimatedNonCargoWeightKg: 0 };
  const result: LoadingResult = { placements, remaining: [], loadedWeightKg: placements.reduce((s,p) => s + p.weightKg, 0), usedVolumeM3: placements.reduce((s,p) => s + p.length * p.width * p.height, 0), validationIssues: [] };
  return { container, cargo, result, supports, securing: name === 'empty' || name === 'large' ? null : securing };
}
/** Synthetic playback checks the renderer transform only; this is not a safety simulation. */
export function comparisonFrame(fixture: ReturnType<typeof comparisonFixture>, progress: number): InertiaAnimationFrame {
  const toPoses = (items: Array<{x:number;y:number;z:number;length:number;width:number;height:number}>) => new Float32Array(items.flatMap(p => [p.x + p.length / 2 - fixture.container.length / 2 + .12 * progress, p.z + p.height / 2, p.y + p.width / 2 - fixture.container.width / 2, 0, Math.sin(progress * .05), 0, Math.cos(progress * .05)]));
  return { cargo: toPoses(fixture.result.placements), supports: toPoses(fixture.supports), phase: 'force', step: Math.round(progress * 100) };
}
