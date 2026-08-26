import type { ContainerSpec } from './types';
import type { PalletSpec } from './palletPacking';

const EPS = 1e-9;

/**
 * Produces a non-overlapping width layout centered on the container centerline.
 * If multiple pallets fit across the container width, use those lanes immediately
 * instead of exhausting one long lane first. One pallet remains exactly centered.
 */
export function centeredPalletLaneLayout(
  container: ContainerSpec,
  pallet: PalletSpec,
  columnCount: number,
) {
  const maxX = Math.max(0, container.length - pallet.length);
  const maxBands = Math.max(1, Math.floor((maxX + EPS) / pallet.length) + 1);
  const rowCapacity = Math.max(1, Math.floor((container.width + EPS) / pallet.width));
  const laneCount = Math.min(rowCapacity, Math.max(1, columnCount));
  const bandCount = Math.max(1, Math.ceil(columnCount / laneCount));
  const xSlots = Array.from({ length: bandCount }, (_, index) =>
    bandCount === 1 ? 0 : index * maxX / (bandCount - 1),
  );
  const groupWidth = laneCount * pallet.width;
  const yOffset = Math.max(0, (container.width - groupWidth) / 2);
  const ySlots = Array.from({ length: laneCount }, (_, index) => yOffset + index * pallet.width);

  return {
    maxBands,
    rowCapacity,
    laneCount,
    bandCount,
    xSlots,
    ySlots,
  };
}
