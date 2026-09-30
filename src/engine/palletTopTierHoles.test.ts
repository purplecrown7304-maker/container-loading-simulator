import { describe, expect, it } from 'vitest';
import { defaultPalletSpec, placeTopTierHolesInside, type PalletLoad } from './palletPacking';
import { packOnPallets } from './palletOptimization';
import type { CargoItem, ContainerSpec, Placement } from './types';

const box: CargoItem = { id: 'HEAVY', name: 'Heavy', length: 0.235, width: 0.13, height: 0.265, weightKg: 16, quantity: 62, maxStackLayers: 10, maxTopLoadKg: 100 };
const cargoMap = new Map([[box.id, box]]);

function gridLoad(topCount: number): PalletLoad {
  const cargoPlacements: Placement[] = [];
  for (let layer = 0; layer < 2; layer += 1) {
    for (let ix = 0; ix < 4; ix += 1) {
      for (let iy = 0; iy < 8; iy += 1) {
        if (layer === 1 && cargoPlacements.length >= 32 + topCount) break;
        cargoPlacements.push({ cargoId: box.id, x: 0.08 + ix * 0.235, y: 0.03 + iy * 0.13, z: 0.12 + layer * 0.265, length: 0.235, width: 0.13, height: 0.265, weightKg: 16 });
      }
    }
  }
  const cargoWeightKg = cargoPlacements.reduce((sum, p) => sum + p.weightKg, 0);
  return {
    palletIndex: 1, x: 0, y: 0, z: 0, stackLevel: 1, stackColumn: 1, length: 1.1, width: 1.1, height: 0.12,
    cargoPlacements, cargoWeightKg, packagingWeightKg: 0, packagingExtraHeightM: 0, cornerGuardsUsed: false, wrappingUsed: false,
    totalWeightKg: cargoWeightKg + 6, centerOfGravity: { x: 0.55, y: 0.55, z: 0.3 },
  };
}

function topTierHoles(load: PalletLoad) {
  const topZ = Math.max(...load.cargoPlacements.map(p => p.z));
  const top = new Set(load.cargoPlacements.filter(p => Math.abs(p.z - topZ) < 1e-6).map(p => `${p.x.toFixed(4)}:${p.y.toFixed(4)}`));
  return load.cargoPlacements
    .filter(p => Math.abs(p.z + p.height - topZ) < 1e-6)
    .filter(p => !top.has(`${p.x.toFixed(4)}:${p.y.toFixed(4)}`));
}

describe('weight-limited top tier holes', () => {
  it('moves unavoidable holes to the perimeter as a point-symmetric pair', () => {
    const input = gridLoad(30);

    const output = placeTopTierHolesInside(input, cargoMap);
    expect(output.cargoPlacements).toHaveLength(input.cargoPlacements.length);
    const holes = topTierHoles(output);
    expect(holes).toHaveLength(2);
    const slots = output.cargoPlacements.filter(p => Math.abs(p.z + p.height - Math.max(...output.cargoPlacements.map(q => q.z))) < 1e-6);
    const [minX, maxX, minY, maxY] = [
      Math.min(...slots.map(p => p.x)),
      Math.max(...slots.map(p => p.x)),
      Math.min(...slots.map(p => p.y)),
      Math.max(...slots.map(p => p.y)),
    ];
    for (const hole of holes) {
      expect(
        Math.abs(hole.x - minX) < 1e-6
        || Math.abs(hole.x - maxX) < 1e-6
        || Math.abs(hole.y - minY) < 1e-6
        || Math.abs(hole.y - maxY) < 1e-6,
      ).toBe(true);
    }
    const cx = holes.reduce((sum, p) => sum + p.x + p.length / 2, 0) / 2;
    const cy = holes.reduce((sum, p) => sum + p.y + p.width / 2, 0) / 2;
    expect(cx).toBeCloseTo((minX + maxX + 0.235) / 2, 6);
    expect(cy).toBeCloseTo((minY + maxY + 0.13) / 2, 6);
  });

  it('keeps larger partial top tiers free of internal holes', () => {
    const output = placeTopTierHolesInside(gridLoad(22), cargoMap);
    const holes = topTierHoles(output);
    expect(holes).toHaveLength(10);
    const slots = output.cargoPlacements.filter(p => Math.abs(p.z + p.height - Math.max(...output.cargoPlacements.map(q => q.z))) < 1e-6);
    const [minX, maxX, minY, maxY] = [
      Math.min(...slots.map(p => p.x)),
      Math.max(...slots.map(p => p.x)),
      Math.min(...slots.map(p => p.y)),
      Math.max(...slots.map(p => p.y)),
    ];
    expect(holes.every(hole =>
      Math.abs(hole.x - minX) < 1e-6
      || Math.abs(hole.x - maxX) < 1e-6
      || Math.abs(hole.y - minY) < 1e-6
      || Math.abs(hole.y - maxY) < 1e-6,
    )).toBe(true);
  });

  it('leaves full tiers untouched', () => {
    const input = gridLoad(32);
    expect(placeTopTierHolesInside(input, cargoMap)).toBe(input);
  });

  it('applies to the final pallet plan without changing quantity or pallet count', () => {
    const container: ContainerSpec = { length: 5.9, width: 2.352, height: 2.395, maxPayloadKg: 28130 };
    const spec = { ...defaultPalletSpec, length: 1.1, width: 1.1, height: 0.12, tareWeightKg: 6, maxLoadKg: 1000 };
    const result = packOnPallets(container, [{ ...box, quantity: 124 }], spec, 'capacity');
    expect(result.placements).toHaveLength(124);
    expect(result.palletCount).toBe(2);
    expect(result.pallets.every(load => topTierHoles(load).length === 2)).toBe(true);
    for (const load of result.pallets) {
      const topZ = Math.max(...load.cargoPlacements.map(p => p.z));
      const slots = load.cargoPlacements.filter(p => Math.abs(p.z + p.height - topZ) < 1e-6);
      const [minX, maxX, minY, maxY] = [
        Math.min(...slots.map(p => p.x)),
        Math.max(...slots.map(p => p.x)),
        Math.min(...slots.map(p => p.y)),
        Math.max(...slots.map(p => p.y)),
      ];
      for (const hole of topTierHoles(load)) {
        expect(
          Math.abs(hole.x - minX) < 1e-6
          || Math.abs(hole.x - maxX) < 1e-6
          || Math.abs(hole.y - minY) < 1e-6
          || Math.abs(hole.y - maxY) < 1e-6,
        ).toBe(true);
      }
    }
  });
});
