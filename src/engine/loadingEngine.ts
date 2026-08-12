import type { CargoItem, ContainerSpec, LoadingResult, Placement } from './types';
import { findMixedPlacement } from './mixedPacking';
import { validatePlacements } from './constraints';

const cbm = (item: CargoItem) => item.length * item.width * item.height;

export function loadContainer(
  container: ContainerSpec,
  cargo: CargoItem[],
): LoadingResult {
  const placements: Placement[] = [];
  const deferred: Array<{ item: CargoItem; quantity: number }> = [];
  const remaining: LoadingResult['remaining'] = [];
  let loadedWeightKg = 0;
  let usedVolumeM3 = 0;

  const prioritized = [...cargo].sort((a, b) => {
    const aScore = cbm(a) * a.quantity + a.weightKg * 0.001;
    const bScore = cbm(b) * b.quantity + b.weightKg * 0.001;
    return bScore - aScore;
  });

  let cursorX = 0;

  for (const item of prioritized) {
    const columnsAcross = Math.max(1, Math.floor(container.width / item.width));
    const layersHigh = Math.max(
      1,
      Math.min(
        item.maxStackLayers ?? Number.POSITIVE_INFINITY,
        Math.floor(container.height / item.height),
      ),
    );
    const boxesPerSlice = columnsAcross * layersHigh;
    let placed = 0;

    while (placed < item.quantity) {
      const left = item.quantity - placed;
      const isFullSlice = left >= boxesPerSlice;

      if (!isFullSlice) break;
      if (cursorX + item.length > container.length) break;

      let slicePlaced = 0;

      for (let layer = 0; layer < layersHigh && placed < item.quantity; layer += 1) {
        for (let col = 0; col < columnsAcross && placed < item.quantity; col += 1) {
          if (loadedWeightKg + item.weightKg > container.maxPayloadKg) break;

          placements.push({
            cargoId: item.id,
            x: cursorX,
            y: col * item.width,
            z: layer * item.height,
            length: item.length,
            width: item.width,
            height: item.height,
            weightKg: item.weightKg,
          });
          placed += 1;
          slicePlaced += 1;
          loadedWeightKg += item.weightKg;
          usedVolumeM3 += cbm(item);
        }

        if (loadedWeightKg >= container.maxPayloadKg) break;
      }

      if (slicePlaced === 0) break;
      cursorX += item.length;

      if (slicePlaced < boxesPerSlice) break;
    }

    if (placed < item.quantity) {
      deferred.push({ item, quantity: item.quantity - placed });
    }
  }

  for (const { item, quantity } of deferred) {
    let mixedPlaced = 0;

    for (let i = 0; i < quantity; i += 1) {
      if (loadedWeightKg + item.weightKg > container.maxPayloadKg) break;

      const placement = findMixedPlacement(container, item, placements);
      if (!placement) break;

      placements.push(placement);
      mixedPlaced += 1;
      loadedWeightKg += item.weightKg;
      usedVolumeM3 += cbm(item);
    }

    const left = quantity - mixedPlaced;
    if (left > 0) {
      remaining.push({
        cargoId: item.id,
        quantity: left,
        reason:
          loadedWeightKg >= container.maxPayloadKg
            ? '컨테이너 최대 적재 중량에 도달하여 적재하지 못함'
            : '동일 종류 완전 블록 및 혼합 적재 가능한 안정 공간을 찾지 못함',
      });
    }
  }

  const validationIssues = validatePlacements(container, placements);

  return {
    placements,
    remaining,
    loadedWeightKg,
    usedVolumeM3,
    validationIssues,
  };
}
