import { describe, expect, it } from 'vitest';
import { loadContainer } from './loadingEngine';
import type { CargoItem, ContainerSpec } from './types';
import {
  buildDirectReoptimizationCargoProfiles,
  buildDirectResultReoptimizationCandidates,
  buildDirectResultReoptimizationCandidatesAsync,
} from './finalResultOptimization';
import type { PhysicsTarget } from '../physicsTarget';
import { operationalQuality } from './operationalQuality';

const container: ContainerSpec = {
  length: 12.03,
  width: 2.35,
  height: 2.69,
  maxPayloadKg: 26500,
};

const cargo: CargoItem[] = [
  { id: 'HEAVY', name: 'heavy', length: 0.6, width: 0.4, height: 0.35, weightKg: 24, quantity: 42, maxStackLayers: 7, maxTopLoadKg: 200, allowRotation: true },
  { id: 'TALL', name: 'tall', length: 0.5, width: 0.35, height: 0.55, weightKg: 11, quantity: 36, maxStackLayers: 7, maxTopLoadKg: 150, allowRotation: true },
  { id: 'LIGHT', name: 'light', length: 0.4, width: 0.3, height: 0.25, weightKg: 4, quantity: 48, maxStackLayers: 7, maxTopLoadKg: 100, allowRotation: true },
];

function target(): PhysicsTarget {
  return {
    mode: 'boxes',
    container,
    cargo,
    result: loadContainer(container, cargo, { strategy: 'capacity', publish: false }),
  };
}

function smallTarget(): PhysicsTarget {
  const smallContainer: ContainerSpec = { length: 2.4, width: 1.2, height: 1.6, maxPayloadKg: 3000 };
  const smallCargo: CargoItem[] = [
    { id: 'A', name: 'A', length: 0.6, width: 0.4, height: 0.3, weightKg: 18, quantity: 6, maxStackLayers: 4, maxTopLoadKg: 180, allowRotation: true },
    { id: 'B', name: 'B', length: 0.4, width: 0.4, height: 0.25, weightKg: 9, quantity: 6, maxStackLayers: 4, maxTopLoadKg: 120, allowRotation: true },
  ];
  return {
    mode: 'boxes',
    container: smallContainer,
    cargo: smallCargo,
    result: loadContainer(smallContainer, smallCargo, { strategy: 'capacity', publish: false }),
  };
}

describe('final result inertia re-layout search', () => {
  it('orders capacity recovery candidates by compactness rather than low height', async () => {
    const current = smallTarget();
    const { candidates } = await buildDirectResultReoptimizationCandidatesAsync(current, 6, () => false, { strategy: 'capacity' });
    expect(candidates.length).toBeGreaterThan(1);
    const penalties = candidates.map(candidate => {
      const shape = operationalQuality(current.container, candidate.result.placements);
      return shape.footprint * 30 + shape.slenderness * 45;
    });
    expect(penalties).toEqual([...penalties].sort((a, b) => a - b));
  }, 30000);
  it('generates a broad deterministic and deduplicated profile set', () => {
    const profiles = buildDirectReoptimizationCargoProfiles(target());
    expect(profiles.length).toBeGreaterThan(6);
    expect(profiles.some((profile) => profile.label.includes('저층') || profile.label.includes('층수') || profile.label.includes('높이'))).toBe(true);

    const keys = profiles.map((profile) => profile.cargo
      .map((item) => `${item.id}:${item.maxStackLayers ?? 'auto'}`)
      .sort()
      .join('|'));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps bounded candidate search cargo counts unchanged in both execution paths', async () => {
    const current = smallTarget();
    const candidates = buildDirectResultReoptimizationCandidates(current, 2);
    expect(candidates.length).toBeLessThanOrEqual(2);
    expect((await buildDirectResultReoptimizationCandidatesAsync(current, 2)).candidates).toEqual(candidates);

    const requested = new Map<string, number>();
    current.result.placements.forEach((item) => requested.set(item.cargoId, (requested.get(item.cargoId) ?? 0) + 1));
    for (const candidate of candidates) {
      const actual = new Map<string, number>();
      candidate.result.placements.forEach((item) => actual.set(item.cargoId, (actual.get(item.cargoId) ?? 0) + 1));
      expect(actual).toEqual(requested);
    }
  }, 30000);
});
