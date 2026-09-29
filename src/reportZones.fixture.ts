import type { CargoItem, ContainerSpec, LoadingResult, Placement } from './engine/types';

/** Synthetic 895-carton review example. This is test data, never an engine result override. */
export function reportFixture() {
  const container: ContainerSpec = { length: 5.9, width: 2.352, height: 2.395, maxPayloadKg: 28130 };
  const placements: Placement[] = [];
  const put = (id: string, x: number, y: number, layer: number, rotated: boolean) => placements.push({ cargoId: id, x, y, z: layer * .265, length: rotated ? .13 : .235, width: rotated ? .235 : .13, height: .265, weightKg: 5 });
  for (let z = 0; z < 2; z++) {
    for (let x = 0; x < 8; x++) for (let y = 0; y < 18; y++) put('PRD-002', x * .235, y * .13, z, false);
    for (let x = 0; x < 8; x++) for (let y = 0; y < 18; y++) put(y === 17 ? 'PRD-002' : 'PRD-003', 1.88 + x * .235, y * .13, z, false);
    for (let x = 0; x < 8; x++) for (let y = 0; y < 10; y++) put(y >= 5 && y < 9 ? 'PRD-002' : 'PRD-003', 3.76 + x * .13, y * .235, z, true);
    for (let x = 0; x < 7; x++) for (let y = 0; y < 10; y++) put(y < 5 ? 'PRD-006' : y < 9 ? 'PRD-004' : 'PRD-005', 4.8 + x * .13, y * .235, z, true);
  }
  for (let y = 0; y < 10; y++) put(y < 7 ? 'PRD-002' : 'PRD-003', 5.71, y * .235, 0, true);
  ['PRD-003', 'PRD-003', 'PRD-003', 'PRD-003', 'PRD-004', 'PRD-006', 'PRD-004-PARTIAL', 'PRD-005-PARTIAL', 'PRD-006-PARTIAL'].forEach((id, y) => put(id, 5.71, y * .235, 1, true));
  const colors = ['#93c5fd', '#fdba74', '#86efac', '#94a3b8', '#f9a8d4'];
  const cargo: CargoItem[] = [...new Set(placements.map(p => p.cargoId))].map(id => ({ id, name: id, length: .235, width: .13, height: .265, weightKg: 5, quantity: placements.filter(p => p.cargoId === id).length, displayColor: colors[Number(id.slice(4, 7)) - 2] }));
  const result: LoadingResult = { placements, remaining: [], loadedWeightKg: 4475, usedVolumeM3: placements.length * .235 * .13 * .265, validationIssues: [] };
  return { container, cargo, result };
}
