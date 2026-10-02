import { expect, it } from 'vitest';
import { viewerWeightResult } from './viewerWeightResult';

it('uses carton mass and each pallet base once even when the reported total is already gross', () => {
  const box = { cargoId: 'A', x: 1, y: 1, z: .15, length: 1, width: 1, height: 1, weightKg: 100 };
  const base = { id: 'pallet', x: 1, y: 1, z: 0, length: 1, width: 1, height: .15, weightKg: 25 };
  const result = { placements: [box], remaining: [], validationIssues: [], usedVolumeM3: 1, loadedWeightKg: 125 };
  const before = JSON.stringify(result);
  const weighted = viewerWeightResult(result, [base]);
  expect(weighted.loadedWeightKg).toBe(125);
  expect(weighted.placements).toHaveLength(2);
  expect(weighted.placements[0]).toBe(box);
  expect(weighted.placements[1]).toMatchObject({ weightKg: 25, z: 0, height: .15 });
  expect(JSON.stringify(result)).toBe(before);
  expect(viewerWeightResult(result).loadedWeightKg).toBe(100);
});
