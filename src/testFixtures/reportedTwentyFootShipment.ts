import type { CargoItem, ContainerSpec } from '../engine/types';

/**
 * The shipment reported on 2026-11-20: 2,907 cartons, 9,544 kg, 20' STANDARD, strict unloading.
 * One container loads 2,828 of them 2.12 m high and fails the inertia certification
 * (braking 24.8 mm against the 12 mm limit); 79 wait. Used for the vehicle split (AGENTS.md 2L).
 */
const carton = (id: string, quantity: number, weightKg: number, length: number, width: number, height: number, maxTopLoadKg: number): CargoItem => ({
  id, name: id, quantity, weightKg, length, width, height, maxTopLoadKg, topLoadLimitExplicit: true, strengthUnverified: false, allowRotation: true,
});

export const reportedTwentyFoot: ContainerSpec = {
  length: 5.9, width: 2.352, height: 2.395, maxPayloadKg: 28130, floorLoadLimitKgPerM2: 2030,
  floorLoadWarningMultiplier: 3, unloadingPolicy: 'strict', ceilingClearanceM: .05,
};

export const reportedTwentyFootCargo: CargoItem[] = [
  carton('P003', 93, 22, .235, .13, .265, 34.3), carton('P003-PART', 1, 10.2, .235, .13, .265, 34.3),
  carton('P014', 93, 22, .26, .24, .225, 40.2), carton('P014-PART', 1, 10.2, .26, .24, .225, 40.2),
  carton('P042', 222, 7.8, .235, .31, .265, 42), carton('P042-PART', 1, 2.2, .235, .31, .265, 42),
  carton('P050', 55, 4.2, .235, .31, .265, 42), carton('P050-PART', 1, 2.4, .235, .31, .265, 42),
  carton('G002', 2439, 1.42, .235, .13, .265, 34.3), carton('G002-PART', 1, .62, .235, .13, .265, 34.3),
];
