import type { CargoItem, ContainerSpec, LoadingResult, Placement } from './types';

const cbm = (item: CargoItem) => item.length * item.width * item.height;

export function loadContainer(
  container: ContainerSpec,
  cargo: CargoItem[],
): LoadingResult {
  const placements: Placement[] = [];
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
          loadedWeightKg += item.weightKg;
          usedVolumeM3 += cbm(item);
        }
      }

      cursorX += item.length;
    }

    if (placed < item.quantity) {
      remaining.push({
        cargoId: item.id,
        quantity: item.quantity - placed,
        reason: '동일 종류 완전 블록을 만들 수 없어 혼합 적재 단계로 이월',
      });
    }
  }

  return { placements, remaining, loadedWeightKg, usedVolumeM3 };
}
