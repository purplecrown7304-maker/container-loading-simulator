import { isARules } from './loadingRuleset';
import { palletSupportBodies } from './palletPlanValidation';
import { validateOperationalLoading, validateOperationalWeightAndCog } from './operationalValidator';
import type { PalletPackingResult } from './palletPacking';
import type { CargoItem, ContainerSpec, OperationalRuleFinding, Placement } from './types';

const EPS = 1e-9;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const errors = (findings: OperationalRuleFinding[]) => findings.filter(finding => finding.severity === 'error');
const isCg = (finding: OperationalRuleFinding) => finding.code === 'CG_LONGITUDINAL' || finding.code === 'CG_LATERAL';
const findingKey = (finding: OperationalRuleFinding) => JSON.stringify([finding.code, finding.placementIndexes]);

/**
 * MIXED's vehicle solver leaves a compact load at the inner/left origin. Move the
 * complete physical plan as one rigid group when its existing CG verdict improves.
 * Loose cartons must move with the pallets; the pallet-only centering helper would
 * discard those placements. No within-pallet or relative unloading order changes.
 */
export function centerLegacyMixedPlan<T extends PalletPackingResult>(
  result: T,
  container: ContainerSpec,
  cargo: CargoItem[],
): T {
  if (isARules(container) || container.limitReview || !result.placements.length) return result;
  const supports = palletSupportBodies(result);
  const bodies: Placement[] = [...result.placements, ...supports.map(support => ({ ...support, cargoId: support.id }))];
  const weight = bodies.reduce((sum, body) => sum + body.weightKg, 0);
  if (!Number.isFinite(weight) || weight <= EPS) return result;
  const cogX = bodies.reduce((sum, body) => sum + (body.x + body.length / 2) * body.weightKg, 0) / weight;
  const cogY = bodies.reduce((sum, body) => sum + (body.y + body.width / 2) * body.weightKg, 0) / weight;
  const bounds = bodies.reduce((box, body) => ({ minX: Math.min(box.minX, body.x), minY: Math.min(box.minY, body.y),
    maxX: Math.max(box.maxX, body.x + body.length), maxY: Math.max(box.maxY, body.y + body.width) }),
  { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  const minDx = -bounds.minX, maxDx = container.length - bounds.maxX;
  const minDy = -bounds.minY, maxDy = container.width - bounds.maxY;
  if (minDx > maxDx || minDy > maxDy) return result;
  const dx = clamp(container.length / 2 - cogX, minDx, maxDx);
  const dy = clamp(container.width / 2 - cogY, minDy, maxDy);
  if (![dx, dy].every(Number.isFinite) || (Math.abs(dx) <= EPS && Math.abs(dy) <= EPS)) return result;

  const before = errors(validateOperationalLoading(container, cargo, result.placements, supports));
  const beforeCg = before.filter(isCg);
  if (!beforeCg.length) return result;
  const move = (placement: Placement): Placement => ({ ...placement, x: placement.x + dx, y: placement.y + dy });
  const pallets = result.pallets.map(pallet => ({
    ...pallet,
    x: pallet.x + dx,
    y: pallet.y + dy,
    cargoPlacements: pallet.cargoPlacements.map(move),
    centerOfGravity: { ...pallet.centerOfGravity, x: pallet.centerOfGravity.x + dx, y: pallet.centerOfGravity.y + dy },
  }));
  const centered: T = {
    ...result,
    pallets,
    placements: result.placements.map(move),
    lateralImbalanceKg: Math.abs(pallets.reduce((sum, pallet) => {
      const offset = pallet.centerOfGravity.y - container.width / 2;
      return sum + (Math.abs(offset) <= EPS ? 0 : Math.sign(offset) * pallet.totalWeightKg);
    }, 0)),
  };
  const centeredSupports = palletSupportBodies(centered);
  const after = errors(validateOperationalLoading(container, cargo, centered.placements, centeredSupports));
  const previousKeys = new Set(before.map(findingKey));
  if (after.filter(isCg).length >= beforeCg.length || after.some(finding => !previousKeys.has(findingKey(finding)))) return result;

  // The operational support graph checks carton support, stacking, bounds and
  // unloading. Also apply its unchanged weight/CG limits to all actual masses,
  // including physical deck/packaging tare, without double-counting pallet cargo.
  const beforeMass = errors(validateOperationalWeightAndCog(container, bodies));
  const afterMass = errors(validateOperationalWeightAndCog(container, [...centered.placements,
    ...centeredSupports.map(support => ({ ...support, cargoId: support.id }))]));
  const previousMassKeys = new Set(beforeMass.map(findingKey));
  if (afterMass.some(finding => !previousMassKeys.has(findingKey(finding)))) return result;
  return centered;
}
