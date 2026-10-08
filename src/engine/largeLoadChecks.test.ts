import { afterEach, describe, expect, it } from 'vitest';
import { validatePlacements } from './constraints';
import { placementsWithinFloorLoadLimit } from './floorLoadLimit';
import { setFootprintGridsEnabledForTests } from './footprintGrid';
import { auditLoading } from './loadingAudit';
import { loadContainer, type LoadingStrategy } from './loadingEngine';
import { validateOperationalLoading } from './operationalValidator';
import type { CargoItem, ContainerSpec, Placement } from './types';
import { acceptsUnloadCandidate } from './unloadingPolicy';

/**
 * The pairwise checks use a footprint index for large loads. These tests run the same inputs
 * through the indexed path and the original full scan and require identical output, including
 * issue order and floating-point values.
 */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}
const round = (value: number, step: number) => Math.round(value / step) * step;

function irregularLayout(seed: number) {
  const r = rng(seed * 7 + 3);
  const container = { length: 6, width: 2.35, height: 2.6, maxPayloadKg: 5000, floorLoadLimitKgPerM2: 800, unloadingPolicy: 'strict' } as ContainerSpec;
  const cargo = [0, 1, 2].map(i => ({ id: `L${i}`, name: `l${i}`, length: 0.5, width: 0.25 * (i + 1), height: 0.3, weightKg: 20 + i * 15, quantity: 999,
    maxTopLoadKg: 40 + i * 30, maxStackLayers: 2 + i, unloadPriority: i + 1, allowRotation: true })) as CargoItem[];
  const placements: Placement[] = [];
  for (let k = 0; k < 160; k += 1) {
    const item = cargo[Math.floor(r() * 3)];
    const rotated = r() < 0.3;
    const length = rotated ? item.width : item.length, width = rotated ? item.length : item.width;
    // Grid-aligned positions give exact edge contact and exact stacking; the rest overlaps or floats.
    const x = r() < 0.8 ? round(r() * (6 - length), 0.25) : r() * (6 - length);
    const y = r() < 0.8 ? round(r() * (2.35 - width), 0.125) : r() * (2.35 - width);
    const z = r() < 0.7 ? round(r() * 3, 1) * 0.3 : (r() < 0.5 ? 0.3 + (r() - 0.5) * 0.002 : r() * 1.5);
    placements.push({ cargoId: item.id, x, y, z, length, width, height: item.height, weightKg: item.weightKg, rotated });
  }
  const supports = [{ id: 'SUP1', x: 0, y: 0, z: 0, length: 1.2, width: 1, height: 0.15, weightKg: 25 }, { id: 'SUP2', x: 2, y: 1, z: 0.3, length: 1, width: 1, height: 0.15, weightKg: 20 }];
  return { container, cargo, placements, supports };
}

function randomLoad(seed: number) {
  const r = rng(seed);
  const container = { length: r() < 0.5 ? 5.898 : 12.032, width: 2.35, height: 2.69, maxPayloadKg: 26000 + Math.floor(r() * 3000),
    floorLoadLimitKgPerM2: r() < 0.6 ? 1500 : undefined, ceilingClearanceM: r() < 0.5 ? 0.05 : undefined,
    unloadingPolicy: (['strict', 'soft', undefined] as const)[Math.floor(r() * 3)] } as ContainerSpec;
  const cargo = Array.from({ length: 2 + Math.floor(r() * 4) }, (_, i) => ({
    id: `S${seed}-${i}`, name: `sku${i}`, length: round(0.2 + r() * 0.9, 0.005), width: round(0.15 + r() * 0.7, 0.005), height: round(0.1 + r() * 0.6, 0.005),
    weightKg: round(1 + r() * 60, 0.1), quantity: 5 + Math.floor(r() * (seed % 3 === 0 ? 300 : 80)), allowRotation: r() < 0.7,
    maxStackLayers: r() < 0.5 ? 1 + Math.floor(r() * 5) : undefined, maxTopLoadKg: r() < 0.6 ? round(20 + r() * 300, 1) : undefined,
    unloadPriority: container.unloadingPolicy && r() < 0.7 ? 1 + Math.floor(r() * 3) : undefined,
  })) as CargoItem[];
  return { container, cargo };
}

function both<T>(run: () => T) {
  setFootprintGridsEnabledForTests(true);
  const indexed = run();
  setFootprintGridsEnabledForTests(false);
  const full = run();
  setFootprintGridsEnabledForTests(true);
  return { indexed, full };
}

afterEach(() => setFootprintGridsEnabledForTests(true));

describe('indexed pairwise checks match the full scan', () => {
  it('audit, collision, floor-load and operational findings on irregular layouts', () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const { container, cargo, placements, supports } = irregularLayout(seed);
      const audit = both(() => auditLoading(container, cargo, placements));
      expect(audit.indexed.length).toBeGreaterThan(0);
      expect(audit.indexed).toEqual(audit.full);
      const collisions = both(() => validatePlacements(container, placements));
      expect(collisions.indexed).toEqual(collisions.full);
      for (const limit of [400, 800, 5000]) {
        const floor = both(() => [20, 60, 100, 160].map(n => placementsWithinFloorLoadLimit({ ...container, floorLoadLimitKgPerM2: limit }, placements.slice(0, n))));
        expect(floor.indexed).toEqual(floor.full);
      }
      const ops = both(() => validateOperationalLoading(container, cargo, placements, supports, { approvedDirectBox: true }));
      expect(ops.indexed).toEqual(ops.full);
      const soft = both(() => validateOperationalLoading({ ...container, unloadingPolicy: 'soft' }, cargo, placements));
      expect(soft.indexed).toEqual(soft.full);
    }
  });

  it('whole loading results for mixed SKUs, stops, rotations and limits', () => {
    const strategies: LoadingStrategy[] = ['capacity', 'stability', 'unloading'];
    for (let seed = 1; seed <= 9; seed += 1) {
      const { container, cargo } = randomLoad(seed);
      const result = both(() => loadContainer(container, cargo, { strategy: strategies[seed % 3], publish: false }));
      expect(result.indexed.placements.length).toBeGreaterThan(0);
      expect(result.indexed).toEqual(result.full);
    }
  }, 120_000);

  it('skips the unload-path scan only when every cargo uses the same stop', () => {
    const container = { length: 4, width: 2, height: 2, maxPayloadKg: 1000, unloadingPolicy: 'strict' } as ContainerSpec;
    const first = { cargoId: 'A', x: 0, y: 0, z: 0, length: 1, width: 1, height: 1, weightKg: 10 };
    const door = { cargoId: 'B', x: 1, y: 0, z: 0, length: 1, width: 1, height: 1, weightKg: 10 };
    const map = (a: number | undefined, b: number | undefined) => new Map([['A', { unloadPriority: a } as CargoItem], ['B', { unloadPriority: b } as CargoItem]]);
    expect(acceptsUnloadCandidate(container, map(undefined, undefined), [first], door)).toBe(true);
    expect(acceptsUnloadCandidate(container, map(1, 1), [first], door)).toBe(true);
    // B is a later stop between A and the door: still rejected.
    expect(acceptsUnloadCandidate(container, map(1, 2), [first], door)).toBe(false);
    // An id missing from the map uses stop 1, like the pairwise check: B (stop 2) blocks A.
    expect(acceptsUnloadCandidate(container, new Map([['B', { unloadPriority: 2 } as CargoItem]]), [first], door)).toBe(false);
  });
});
