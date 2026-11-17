import { cargoColor } from './cargoColors';
import type { StagingUnit } from './stagingInventory';
import type { ThreeComparisonPlan } from './threeComparisonSceneState';

/** One texture per SKU, shared by loose cartons and prepared pallet contents. */
export function stagingCartonLabelPlan(units: readonly StagingUnit[]): Pick<ThreeComparisonPlan, 'placements'> {
  const samples = new Map<string, ThreeComparisonPlan['placements'][number]>();
  for (const unit of units) {
    const boxes = unit.kind === 'box' ? [{ ...unit, cargoId: unit.cargoId ?? unit.cargoIds[0] ?? unit.id, x: 0, y: 0, z: 0 }] : unit.localPlacements ?? [];
    for (const box of boxes) {
      if (samples.has(box.cargoId)) continue;
      const content = unit.contents?.find(item => item.cargoId === box.cargoId);
      samples.set(box.cargoId, { ...box, invalid: false, color: cargoColor(box.cargoId, content?.displayColor ?? unit.displayColor),
        labelTitle: content?.name || (unit.kind === 'box' ? unit.name : box.cargoId), labelCode: content?.labelCode || box.cargoId,
        labelDetail: `${content?.unitsPerPackage ?? 1} EA · ${box.weightKg.toFixed(1)} kg`,
        labelSize: `${Math.round(box.length * 1000)} × ${Math.round(box.width * 1000)} × ${Math.round(box.height * 1000)} mm` });
    }
  }
  return { placements: [...samples.values()] };
}
