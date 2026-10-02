import type { LoadingResult } from './engine/types';
import type { PhysicsSupport } from './engine/physicsValidation';

/** Viewer placements are individual cartons. Supports carry only each pallet base's tare,
 * while result.loadedWeightKg may already include that tare; never add to that total. */
export function viewerWeightResult(result: LoadingResult, supports: PhysicsSupport[] = []): LoadingResult {
  const placements = [...result.placements, ...supports.map(support => ({
    ...support, cargoId: `pallet-base:${support.id}`,
  }))];
  return { ...result, placements, loadedWeightKg: placements.reduce((sum, box) => sum + box.weightKg, 0) };
}
