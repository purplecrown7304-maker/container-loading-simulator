import { cargoColor } from './cargoColors';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import type { PhysicsSupport } from './engine/physicsValidation';
import { analyzeWeightDistribution } from './engine/weightDistribution';
import { assessWeightBalance } from './engine/weightBalance';
import { viewerWeightResult } from './viewerWeightResult';
import type { SecuringUsage } from './inertiaCertification';
import { securingGeometry } from './viewerSecuring';

export type ViewerSceneOptions = { supports?: PhysicsSupport[]; securing?: SecuringUsage | null; geometry?: string; vehicle?: boolean };
export function viewerPlan(container: ContainerSpec, result: LoadingResult, revision: number, cargo: Array<Pick<CargoItem, 'id' | 'displayColor'> & Partial<CargoItem>> = [], options: ViewerSceneOptions = {}) {
  const colors = new Map(cargo.map(item => [item.id, item.displayColor]));
  const cargoById = new Map(cargo.map(item => [item.id, item]));
  const invalid = new Set(result.validationIssues.flatMap(issue => issue.placementIndexes));
  const analysis = analyzeWeightDistribution(container, result, 20, 8);
  const centerOfGravity = options.supports?.length
    ? assessWeightBalance(container, viewerWeightResult(result, options.supports)).centerOfGravity
    : analysis.centerOfGravity;
  return { revision, container: { length: container.length, width: container.width, height: container.height }, geometry: options.geometry ?? 'closed', vehicle: options.vehicle ?? false,
    placements: result.placements.map((p, i) => {
      const item = cargoById.get(p.cargoId);
      return { ...p, color: cargoColor(p.cargoId, colors.get(p.cargoId)), invalid: invalid.has(i),
        labelTitle: item?.productName || item?.name || p.cargoId,
        labelCode: item?.boxId || p.cargoId,
        labelDetail: `${item?.unitsPerPackage ?? 1} EA · ${p.weightKg.toFixed(1)} kg`,
        labelSize: `${Math.round(p.length * 1000)} × ${Math.round(p.width * 1000)} × ${Math.round(p.height * 1000)} mm`,
      };
    }),
    supports: options.supports ?? [], decorations: securingGeometry(container, result.placements, options.supports ?? [], options.securing, result.voidFillPlan),
    cells: analysis.floor.cells, centerOfGravity,
  };
}
