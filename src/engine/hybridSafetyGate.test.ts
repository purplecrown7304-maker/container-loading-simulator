import { beforeEach, expect, it, vi } from 'vitest';
import type { CargoItem, Placement } from './types';
vi.mock('./strictWallPacker', () => ({ packByStrictWalls: vi.fn() }));
vi.mock('./blockSpaceBeamPackerV2', () => ({ packByBlockSpaceBeamV2: vi.fn() }));
import { packByStrictWalls } from './strictWallPacker';
import { packByBlockSpaceBeamV2 } from './blockSpaceBeamPackerV2';
import { packByHybridOptimizer } from './hybridLoadingOptimizer';
const container = { length: 4, width: 2, height: 4, maxPayloadKg: 1000 };
const cargo: CargoItem[] = [{ id: 'A', name: 'A', length: 1, width: 1, height: 1, weightKg: 10, quantity: 120 }];
const box = (z: number): Placement => ({ cargoId: 'A', x: 0, y: 0, z, length: 1, width: 1, height: 1, weightKg: 10 });
const output = (placements: Placement[]) => ({ placements, remaining: [], loadedWeightKg: placements.length * 10, usedVolumeM3: placements.length });
beforeEach(() => vi.clearAllMocks());
it('rejects a larger unsafe fast-path candidate and selects the finite safe score', () => {
  vi.mocked(packByStrictWalls).mockReturnValue(output([box(1), box(2)]));
  vi.mocked(packByBlockSpaceBeamV2).mockReturnValue(output([box(0)]));
  const result = packByHybridOptimizer(container, cargo, 'capacity');
  expect(packByBlockSpaceBeamV2).toHaveBeenCalled();
  expect(result.placements).toEqual([box(0)]);
});
it('returns all cargo as remaining when both plans violate hard constraints', () => {
  vi.mocked(packByStrictWalls).mockReturnValue(output([box(1)]));
  vi.mocked(packByBlockSpaceBeamV2).mockReturnValue(output([box(2)]));
  const result = packByHybridOptimizer(container, cargo, 'stability');
  expect(result.placements).toEqual([]);
  expect(result.remaining[0].quantity).toBe(120);
});
