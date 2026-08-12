import type { CargoItem, ContainerSpec, Placement } from './types';

export type PalletSpec = {
  length: number;
  width: number;
  height: number;
  tareWeightKg: number;
  maxLoadKg: number;
};

export type PalletLoad = {
  palletIndex: number;
  x: number;
  y: number;
  z: number;
  length: number;
  width: number;
  height: number;
  cargoPlacements: Placement[];
  cargoWeightKg: number;
  totalWeightKg: number;
};

export type PalletPackingResult = {
  pallets: PalletLoad[];
  placements: Placement[];
  remaining: Array<{ cargoId: string; quantity: number; reason: string }>;
  palletCount: number;
  loadedCargoWeightKg: number;
  totalPalletizedWeightKg: number;
};

export const defaultPalletSpec: PalletSpec = {
  length: 1.1,
  width: 1.1,
  height: 0.15,
  tareWeightKg: 25,
  maxLoadKg: 1000,
};

function cargoVolume(item: CargoItem) {
  return item.length * item.width * item.height;
}

function palletPositions(container: ContainerSpec, pallet: PalletSpec) {
  const positions: Array<{ x: number; y: number }> = [];
  for (let x = 0; x + pallet.length <= container.length + 1e-9; x += pallet.length) {
    for (let y = 0; y + pallet.width <= container.width + 1e-9; y += pallet.width) {
      positions.push({ x, y });
    }
  }
  return positions;
}

export function packOnPallets(
  container: ContainerSpec,
  cargo: CargoItem[],
  pallet: PalletSpec = defaultPalletSpec,
): PalletPackingResult {
  const queue = [...cargo]
    .filter((item) => item.quantity > 0)
    .sort((a, b) => b.weightKg - a.weightKg || cargoVolume(b) - cargoVolume(a));

  const positions = palletPositions(container, pallet);
  const pallets: PalletLoad[] = [];
  const remaining: PalletPackingResult['remaining'] = [];
  const placements: Placement[] = [];
  let totalCargoWeight = 0;

  for (const item of queue) {
    let left = item.quantity;

    for (let p = 0; p < positions.length && left > 0; p += 1) {
      let palletLoad = pallets[p];
      if (!palletLoad) {
        const pos = positions[p];
        palletLoad = {
          palletIndex: p + 1,
          x: pos.x,
          y: pos.y,
          z: 0,
          length: pallet.length,
          width: pallet.width,
          height: pallet.height,
          cargoPlacements: [],
          cargoWeightKg: 0,
          totalWeightKg: pallet.tareWeightKg,
        };
        pallets[p] = palletLoad;
      }

      const colsX = Math.floor(pallet.length / item.length);
      const colsY = Math.floor(pallet.width / item.width);
      const layersByHeight = Math.floor((container.height - pallet.height) / item.height);
      const layers = Math.max(0, Math.min(item.maxStackLayers ?? Number.POSITIVE_INFINITY, layersByHeight));
      if (colsX < 1 || colsY < 1 || layers < 1) continue;

      const capacity = colsX * colsY * layers;
      const existingSame = palletLoad.cargoPlacements.filter((x) => x.cargoId === item.id).length;
      let freeSlots = Math.max(0, capacity - existingSame);

      while (left > 0 && freeSlots > 0) {
        if (palletLoad.cargoWeightKg + item.weightKg > pallet.maxLoadKg) break;
        if (totalCargoWeight + item.weightKg + pallets.length * pallet.tareWeightKg > container.maxPayloadKg) break;

        const slot = existingSame + (capacity - existingSame - freeSlots);
        const layer = Math.floor(slot / (colsX * colsY));
        const inLayer = slot % (colsX * colsY);
        const row = Math.floor(inLayer / colsY);
        const col = inLayer % colsY;

        const placement: Placement = {
          cargoId: item.id,
          x: palletLoad.x + row * item.length,
          y: palletLoad.y + col * item.width,
          z: pallet.height + layer * item.height,
          length: item.length,
          width: item.width,
          height: item.height,
          weightKg: item.weightKg,
        };

        palletLoad.cargoPlacements.push(placement);
        placements.push(placement);
        palletLoad.cargoWeightKg += item.weightKg;
        palletLoad.totalWeightKg = palletLoad.cargoWeightKg + pallet.tareWeightKg;
        totalCargoWeight += item.weightKg;
        left -= 1;
        freeSlots -= 1;
      }
    }

    if (left > 0) {
      remaining.push({
        cargoId: item.id,
        quantity: left,
        reason: '팔레트 면적·높이·허용중량 또는 컨테이너 최대중량 조건 때문에 적재하지 못함',
      });
    }
  }

  const usedPallets = pallets.filter((p) => p && p.cargoPlacements.length > 0);

  return {
    pallets: usedPallets,
    placements,
    remaining,
    palletCount: usedPallets.length,
    loadedCargoWeightKg: totalCargoWeight,
    totalPalletizedWeightKg: totalCargoWeight + usedPallets.length * pallet.tareWeightKg,
  };
}
