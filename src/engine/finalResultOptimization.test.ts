import { describe, expect, it } from 'vitest';
import { loadContainer } from './loadingEngine';
import type { CargoItem, ContainerSpec } from './types';
import {
  buildDirectReoptimizationCargoProfiles,
  buildDirectResultReoptimizationCandidates,
} from './finalResultOptimization';
import type { PhysicsTarget } from '../physicsTarget';

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

describe('final result inertia re-layout search', () => {
  it('generates a broad deterministic profile set instead of a fixed 3/6 retry budget', () => {
    const profiles = buildDirectReoptimizationCargoProfiles(target());
    expect(profiles.length).toBeGreaterThan(6);
    expect(profiles.some(profile => profile.label.includes('중량물 저층 우선'))).toBe(true);
    expect(profiles.some(profile => profile.label.includes('고형상 저층 우선'))).toBe(true);
    expect(profiles.some(profile => profile.label.includes('SKU 층수 분산'))).toBe(true);

    const keys = profiles.map(profile => profile.cargo
      .map(item => `${item.id}:${item.maxStackLayers ?? 'auto'}`)
      .sort()
      .join('|'));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('supports exhaustive candidate enumeration while keeping requested cargo counts unchanged', () => {
    const current = target();
    const exhaustive = buildDirectResultReoptimizationCandidates(current, Number.POSITIVE_INFINITY);
    const limited = buildDirectResultReoptimizationCandidates(current, 6);
    expect(exhaustive.length).toBeGreaterThanOrEqual(limited.length);

    const requested = new Map<string, number>();
    current.result.placements.forEach(item => requested.set(item.cargoId, (requested.get(item.cargoId) ?? 0) + 1));
    for (const candidate of exhaustive) {
      const actual = new Map<string, number>();
      candidate.result.placements.forEach(item => actual.set(item.cargoId, (actual.get(item.cargoId) ?? 0) + 1));
      expect(actual).toEqual(requested);
    }
  });
});
