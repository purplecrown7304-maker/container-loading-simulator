import type { CargoItem, ContainerSpec, LoadingResult, Placement } from './types';
import { findMixedPlacement } from './mixedPacking';
import { validatePlacements } from './constraints';
import { canPlaceByStackingRules } from './stacking';
import { optimizeLoadingShape } from './shapeOptimizer';
import { moveLowRowsToDoorZone } from './rowOptimizer';

const EPS = 1e-9;
const cbm = (item: CargoItem) => item.length * item.width * item.height;
const fitCount = (available: number, size: number) => size > 0 ? Math.floor((available + EPS) / size) : 0;

function bestBlockOrientation(container: ContainerSpec, item: CargoItem) {
  const options = [
    { length: item.length, width: item.width, rotated: false },
    ...(item.allowRotation === false || Math.abs(item.length - item.width) < EPS
      ? []
      : [{ length: item.width, width: item.length, rotated: true }]),
  ];

  return options
    .map((option) => {
      const columnsAcross = fitCount(container.width, option.width);
      const layersHigh = Math.min(
        item.maxStackLayers ?? Number.POSITIVE_INFINITY,
        fitCount(container.height, item.height),
      );
      const slicesDeep = fitCount(container.length, option.length);
      return {
        ...option,
        columnsAcross,
        layersHigh,
        capacity: Math.max(0, columnsAcross) * Math.max(0, layersHigh) * Math.max(0, slicesDeep),
        sliceCapacity: Math.max(0, columnsAcross) * Math.max(0, layersHigh),
      };
    })
    .sort((a, b) => b.capacity - a.capacity || b.sliceCapacity - a.sliceCapacity || a.length - b.length)[0];
}

export function loadContainer(container: ContainerSpec, cargo: CargoItem[]): LoadingResult {
  let placements: Placement[] = [];
  const deferred: Array<{ item: CargoItem; quantity: number }> = [];
  const remaining: LoadingResult['remaining'] = [];
  let loadedWeightKg = 0;
  let usedVolumeM3 = 0;

  const cargoById = new Map(cargo.map((item) => [item.id, item]));

  const prioritized = [...cargo].sort((a, b) => {
    const aScore = cbm(a) * a.quantity + a.weightKg * 0.001;
    const bScore = cbm(b) * b.quantity + b.weightKg * 0.001;
    return bScore - aScore;
  });

  let cursorX = 0;

  for (const item of prioritized) {
    const orientation = bestBlockOrientation(container, item);
    const columnsAcross = Math.max(1, orientation.columnsAcross);
    const layersHigh = Math.max(1, orientation.layersHigh);
    const boxesPerSlice = columnsAcross * layersHigh;
    let placed = 0;

    while (placed < item.quantity) {
      const left = item.quantity - placed;
      if (left < boxesPerSlice) break;
      if (cursorX + orientation.length > container.length + EPS) break;

      let slicePlaced = 0;
      let sliceBlocked = false;

      for (let layer = 0; layer < layersHigh && placed < item.quantity; layer += 1) {
        for (let col = 0; col < columnsAcross && placed < item.quantity; col += 1) {
          if (loadedWeightKg + item.weightKg > container.maxPayloadKg + EPS) {
            sliceBlocked = true;
            break;
          }

          const candidate: Placement = {
            cargoId: item.id,
            x: cursorX,
            y: col * orientation.width,
            z: layer * item.height,
            length: orientation.length,
            width: orientation.width,
            height: item.height,
            weightKg: item.weightKg,
            rotated: orientation.rotated,
          };

          if (!canPlaceByStackingRules(item, candidate, placements, cargoById)) {
            sliceBlocked = true;
            break;
          }

          placements.push(candidate);
          placed += 1;
          slicePlaced += 1;
          loadedWeightKg += item.weightKg;
          usedVolumeM3 += cbm(item);
        }

        if (sliceBlocked || loadedWeightKg + EPS >= container.maxPayloadKg) break;
      }

      if (slicePlaced === 0) break;
      cursorX += orientation.length;
      if (slicePlaced < boxesPerSlice || sliceBlocked) break;
    }

    if (placed < item.quantity) deferred.push({ item, quantity: item.quantity - placed });
  }

  for (const { item, quantity } of deferred) {
    let mixedPlaced = 0;
    for (let i = 0; i < quantity; i += 1) {
      if (loadedWeightKg + item.weightKg > container.maxPayloadKg + EPS) break;
      const placement = findMixedPlacement(container, item, placements, cargoById);
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
        reason: loadedWeightKg + EPS >= container.maxPayloadKg
          ? '컨테이너 최대 적재 중량에 도달하여 적재하지 못함'
          : '회전을 포함해 적층단·상부 허용중량 또는 안정 공간 조건을 만족하는 위치를 찾지 못함',
      });
    }
  }

  // 1) 중앙 낱개·돌출·품목 분산을 줄인다.
  placements = optimizeLoadingShape(container, placements, cargoById).placements;
  // 2) 대표 행 높이의 50% 미만 또는 사실상 1단으로 남은 앞/중앙 행은
  //    안전 조건을 통과할 때 문쪽 마지막 혼합 구역으로 후순위 이동한다.
  placements = moveLowRowsToDoorZone(container, placements, cargoById).placements;
  // 3) 이동 뒤 다시 한 번 형상을 정돈한다.
  placements = optimizeLoadingShape(container, placements, cargoById).placements;

  return {
    placements,
    remaining,
    loadedWeightKg,
    usedVolumeM3,
    validationIssues: validatePlacements(container, placements),
  };
}
