import type { PhysicsTarget } from '../physicsTarget';

/** Anonymous geometry of the 3,089-carton incident: 49 full fronts and two floor remnants. */
export function steppedDirectLoad(): PhysicsTarget {
  const cargo = [
    { id: 'FULL', name: 'Full carton', length: .26, width: .24, height: .225, weightKg: 1.96, quantity: 3088, maxTopLoadKg: 40.2, allowRotation: true },
    { id: 'PARTIAL', name: 'Partial carton', length: .26, width: .24, height: .225, weightKg: .92, quantity: 1, maxTopLoadKg: 40.2, allowRotation: true },
  ];
  const placements = [];
  for (let front = 0; front < 49; front++) for (let tier = 0; tier < 7; tier++) for (let row = 0; row < 9; row++) {
    placements.push({ cargoId: 'FULL', x: Math.round(front * .24 * 1e6) / 1e6, y: .006 + row * .26, z: Math.round(tier * .225 * 1e6) / 1e6,
      length: .24, width: .26, height: .225, weightKg: 1.96, rotated: true });
  }
  placements.push({ ...placements[0], x: 11.76, y: .9629444444444444 });
  placements.push({ ...placements[0], x: 11.76, y: 1.2229444444444444, cargoId: 'PARTIAL', weightKg: .92 });
  return {
    mode: 'boxes', container: { length: 12.032, width: 2.352, height: 2.395, maxPayloadKg: 28750 }, cargo,
    result: { placements, remaining: [], validationIssues: [], loadedWeightKg: 6053.4, usedVolumeM3: 3089 * .26 * .24 * .225 },
  };
}
