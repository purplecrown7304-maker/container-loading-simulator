import type { OptimizedPalletPackingResult, PalletLoad } from './palletOptimization';
import type { ContainerSpec } from './types';

const EPS = 1e-9;
const CENTERLINE_EPS = 1e-6;
const round6 = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
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
      x: round6(placement.x + dx),
      y: round6(placement.y + dy),
    })),
    centerOfGravity: {
      ...load.centerOfGravity,
      x: round6(load.centerOfGravity.x + dx * cargoFraction),
      y: round6(load.centerOfGravity.y + dy * cargoFraction),
    },
  };
}

function translateLoad(load: PalletLoad, dx: number, dy: number): PalletLoad {
  return {
    ...load,
    x: round6(load.x + dx),
    y: round6(load.y + dy),
    cargoPlacements: load.cargoPlacements.map((placement) => ({
      ...placement,
      x: round6(placement.x + dx),
      y: round6(placement.y + dy),
    })),
    centerOfGravity: {
      ...load.centerOfGravity,
      x: round6(load.centerOfGravity.x + dx),
      y: round6(load.centerOfGravity.y + dy),
    },
  };
}

function centerPalletGroupOnContainer(pallets: PalletLoad[], container: ContainerSpec) {
  if (!pallets.length) return [];
  const totalWeightKg = pallets.reduce((sum, pallet) => sum + Math.max(0, pallet.totalWeightKg), 0);
  if (totalWeightKg <= EPS) return pallets.map((pallet) => translateLoad(pallet, 0, 0));

  const cogX = pallets.reduce(
    (sum, pallet) => sum + pallet.centerOfGravity.x * Math.max(0, pallet.totalWeightKg),
    0,
  ) / totalWeightKg;
  const cogY = pallets.reduce(
    (sum, pallet) => sum + pallet.centerOfGravity.y * Math.max(0, pallet.totalWeightKg),
    0,
  ) / totalWeightKg;

  const minX = Math.min(...pallets.map((pallet) => pallet.x));
  const maxX = Math.max(...pallets.map((pallet) => pallet.x + pallet.length));
  const minY = Math.min(...pallets.map((pallet) => pallet.y));
  const maxY = Math.max(...pallets.map((pallet) => pallet.y + pallet.width));

  const desiredDx = container.length / 2 - cogX;
  const desiredDy = container.width / 2 - cogY;
  const dx = clamp(desiredDx, -minX, container.length - maxX);
  const dy = clamp(desiredDy, -minY, container.width - maxY);

  return pallets.map((pallet) => translateLoad(pallet, dx, dy));
}

function recalcLateralImbalance(pallets: PalletLoad[], container: ContainerSpec) {
  let left = 0;
  let right = 0;
  const centerY = container.width / 2;
  for (const pallet of pallets) {
    const delta = pallet.centerOfGravity.y - centerY;
    if (Math.abs(delta) < CENTERLINE_EPS) continue;
    if (delta < 0) left += pallet.totalWeightKg;
    else right += pallet.totalWeightKg;
  }
  return Math.abs(left - right);
}

/**
 * 1) Centers each cargo footprint on its own pallet.
 * 2) Centers the complete palletized load against the container's fixed
 *    geometric X/Y center, never the currently occupied pallet footprint.
 * 3) Recomputes lateral imbalance against container.width / 2.
 *
 * The complete pallet group is translated rigidly and clamped by container
 * walls, so pallet-to-pallet spacing, stack columns, support, and Z heights are
 * preserved. Vertical CG remains governed by the low-CG stability rules.
 */
export function centerPalletCargo(
  result: OptimizedPalletPackingResult,
  container: ContainerSpec,
): OptimizedPalletPackingResult {
  const source = nextOverride ?? result;
  nextOverride = null;
  const cargoCentered = source.pallets.map(centerLoadCargo);
  const pallets = centerPalletGroupOnContainer(cargoCentered, container);
  return {
    ...source,
    pallets,
    placements: pallets.flatMap((pallet) => pallet.cargoPlacements),
    lateralImbalanceKg: recalcLateralImbalance(pallets, container),
  };
}
