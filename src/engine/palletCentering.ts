import type { OptimizedPalletPackingResult, PalletLoad } from './palletOptimization';

const EPS = 1e-9;
let nextOverride: OptimizedPalletPackingResult | null = null;

/**
 * 작업지시서 전 최종 최적화처럼 외부에서 이미 검증한 팔레트 결과를
 * PalletModePanel의 다음 재계산 1회에 그대로 주입할 때 사용한다.
 */
export function setNextPalletCenteredResultOverride(result: OptimizedPalletPackingResult) {
  nextOverride = result;
}

function centerLoadCargo(load: PalletLoad): PalletLoad {
  if (!load.cargoPlacements.length) return { ...load, cargoPlacements: [] };

  const minX = Math.min(...load.cargoPlacements.map((placement) => placement.x));
  const maxX = Math.max(...load.cargoPlacements.map((placement) => placement.x + placement.length));
  const minY = Math.min(...load.cargoPlacements.map((placement) => placement.y));
  const maxY = Math.max(...load.cargoPlacements.map((placement) => placement.y + placement.width));

  const targetCenterX = load.x + load.length / 2;
  const targetCenterY = load.y + load.width / 2;
  const footprintCenterX = (minX + maxX) / 2;
  const footprintCenterY = (minY + maxY) / 2;

  const minDx = load.x - minX;
  const maxDx = load.x + load.length - maxX;
  const minDy = load.y - minY;
  const maxDy = load.y + load.width - maxY;

  const desiredDx = targetCenterX - footprintCenterX;
  const desiredDy = targetCenterY - footprintCenterY;
  const dx = Math.min(maxDx, Math.max(minDx, desiredDx));
  const dy = Math.min(maxDy, Math.max(minDy, desiredDy));

  if (Math.abs(dx) <= EPS && Math.abs(dy) <= EPS) {
    return { ...load, cargoPlacements: load.cargoPlacements.map((placement) => ({ ...placement })) };
  }

  const cargoFraction = load.totalWeightKg > EPS
    ? Math.max(0, Math.min(1, load.cargoWeightKg / load.totalWeightKg))
    : 0;

  return {
    ...load,
    cargoPlacements: load.cargoPlacements.map((placement) => ({
      ...placement,
      x: placement.x + dx,
      y: placement.y + dy,
    })),
    centerOfGravity: {
      ...load.centerOfGravity,
      x: load.centerOfGravity.x + dx * cargoFraction,
      y: load.centerOfGravity.y + dy * cargoFraction,
    },
  };
}

/**
 * Centers the complete cargo footprint on every pallet without changing
 * relative box-to-box support, layer heights, or pallet positions.
 */
export function centerPalletCargo(result: OptimizedPalletPackingResult): OptimizedPalletPackingResult {
  if (nextOverride) {
    const override = nextOverride;
    nextOverride = null;
    return override;
  }
  const pallets = result.pallets.map(centerLoadCargo);
  return {
    ...result,
    pallets,
    placements: pallets.flatMap((pallet) => pallet.cargoPlacements),
  };
}
