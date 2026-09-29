import { describe, expect, it } from 'vitest';
import { loadContainer } from './loadingEngine';
import { auditLoading } from './loadingAudit';
import { SPARSE_TOP_LAYER_RATIO, settleSparseTopLayer } from './topLayerSettling';
import type { CargoItem, ContainerSpec, Placement } from './types';

// Field report 2026-09-29 (#86): a few cartons rode alone on top of a tall direct-box
// load. In practice they are brought down into lower gaps; if none exists they are
// loaded in any remaining space, never dropped for this reason.
const c20: ContainerSpec = { length: 5.9, width: 2.35, height: 2.39, maxPayloadKg: 28000 };
const mix = (l: number, w: number, h: number, quantities: number[]): CargoItem[] =>
  quantities.map((quantity, i) => ({ id: `S${i}`, name: `S${i}`, length: l, width: w, height: h, weightKg: 12 + i, quantity, maxStackLayers: 10, maxTopLoadKg: 100 }));

function tiers(placements: Placement[]) {
  const counts = new Map<number, number>();
  placements.forEach(p => counts.set(Math.round(p.z * 1000), (counts.get(Math.round(p.z * 1000)) ?? 0) + 1));
  return [...counts.entries()].sort(([a], [b]) => a - b).map(([, count]) => count);
}

describe('DIRECT BOX isolated top tier settling', () => {
  it.each([
    ['0.30 x 0.20 x 0.25', mix(0.3, 0.2, 0.25, [300, 300, 60, 15, 70])],
    ['0.35 x 0.25 x 0.22', mix(0.35, 0.25, 0.22, [300, 300, 60, 15, 70])],
    ['0.35 x 0.25 x 0.22 small', mix(0.35, 0.25, 0.22, [120, 90, 33, 7])],
  ])('%s: no isolated top tier, nothing dropped, audit clean', (_label, cargo) => {
    for (const strategy of ['capacity', 'stability'] as const) {
      const result = loadContainer(c20, cargo, { strategy, publish: false });
      const total = cargo.reduce((sum, item) => sum + item.quantity, 0);
      expect(result.placements).toHaveLength(total);
      expect(result.validationIssues).toEqual([]);
      const counts = tiers(result.placements);
      expect(counts.length >= 3 && counts[counts.length - 1] <= Math.max(...counts) * SPARSE_TOP_LAYER_RATIO).toBe(false);
    }
  });

  it('keeps a carton on top when no lower gap exists instead of dropping it', () => {
    const container: ContainerSpec = { length: 1, width: 1, height: 1, maxPayloadKg: 5000 };
    const box = { length: 0.25, width: 0.25, height: 0.25, weightKg: 1 };
    const placements: Placement[] = [];
    for (let z = 0; z < 3; z += 1) for (let x = 0; x < 4; x += 1) for (let y = 0; y < 4; y += 1) {
      placements.push({ cargoId: 'A', x: x * 0.25, y: y * 0.25, z: z * 0.25, ...box });
    }
    placements.push({ cargoId: 'A', x: 0, y: 0, z: 0.75, ...box });
    const cargo: CargoItem[] = [{ id: 'A', name: 'A', ...box, quantity: 49 }];
    const input = { placements, loadedWeightKg: 49, usedVolumeM3: 49 * 0.25 ** 3, remaining: [] };
    const settled = settleSparseTopLayer(container, cargo, input, 'capacity');
    expect(settled.placements).toHaveLength(49);
    expect(settled.remaining).toEqual([]);
    expect(auditLoading(container, cargo, settled.placements)).toEqual([]);
  });

  it('moves the isolated carton into a lower gap when one exists', () => {
    const container: ContainerSpec = { length: 1, width: 1, height: 1, maxPayloadKg: 5000 };
    const box = { length: 0.25, width: 0.25, height: 0.25, weightKg: 1 };
    const placements: Placement[] = [];
    for (let z = 0; z < 3; z += 1) for (let x = 0; x < 4; x += 1) for (let y = 0; y < 4; y += 1) {
      if (z === 2 && x === 3 && y === 3) continue; // gap in the third tier
      placements.push({ cargoId: 'A', x: x * 0.25, y: y * 0.25, z: z * 0.25, ...box });
    }
    placements.push({ cargoId: 'A', x: 0, y: 0, z: 0.75, ...box });
    const cargo: CargoItem[] = [{ id: 'A', name: 'A', ...box, quantity: 48 }];
    const settled = settleSparseTopLayer(container, cargo, { placements, loadedWeightKg: 48, usedVolumeM3: 48 * 0.25 ** 3, remaining: [] }, 'capacity');
    expect(settled.placements).toHaveLength(48);
    expect(Math.max(...settled.placements.map(p => p.z))).toBeCloseTo(0.5);
    expect(auditLoading(container, cargo, settled.placements)).toEqual([]);
  });
});
