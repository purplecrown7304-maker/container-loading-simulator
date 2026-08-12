import type { CargoItem, ContainerSpec, Placement } from './types';

export type PalletSpec = { length: number; width: number; height: number; tareWeightKg: number; maxLoadKg: number };
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
  centerOfGravity: { x: number; y: number; z: number };
};
export type PalletPackingResult = {
  pallets: PalletLoad[];
  placements: Placement[];
  remaining: Array<{ cargoId: string; quantity: number; reason: string }>;
  palletCount: number;
  loadedCargoWeightKg: number;
  totalPalletizedWeightKg: number;
  consolidatedPallets: number;
  lateralImbalanceKg: number;
};

export const defaultPalletSpec: PalletSpec = { length: 1.1, width: 1.1, height: 0.15, tareWeightKg: 25, maxLoadKg: 1000 };
const EPS = 1e-9;
const cargoVolume = (item: CargoItem) => item.length * item.width * item.height;

function palletPositions(container: ContainerSpec, pallet: PalletSpec) {
  const positions: Array<{ x: number; y: number }> = [];
  for (let x = 0; x + pallet.length <= container.length + EPS; x += pallet.length) {
    const row: Array<{ x: number; y: number }> = [];
    for (let y = 0; y + pallet.width <= container.width + EPS; y += pallet.width) row.push({ x, y });
    row.sort((a, b) => Math.abs((a.y + pallet.width / 2) - container.width / 2) - Math.abs((b.y + pallet.width / 2) - container.width / 2));
    positions.push(...row);
  }
  return positions;
}

function palletCog(load: PalletLoad, pallet: PalletSpec) {
  const parts = [
    ...load.cargoPlacements.map((p) => ({
      weight: p.weightKg,
      x: p.x + p.length / 2,
      y: p.y + p.width / 2,
      z: p.z + p.height / 2,
    })),
    { weight: pallet.tareWeightKg, x: load.x + pallet.length / 2, y: load.y + pallet.width / 2, z: pallet.height / 2 },
  ];
  const total = parts.reduce((sum, p) => sum + p.weight, 0) || 1;
  return {
    x: parts.reduce((sum, p) => sum + p.x * p.weight, 0) / total,
    y: parts.reduce((sum, p) => sum + p.y * p.weight, 0) / total,
    z: parts.reduce((sum, p) => sum + p.z * p.weight, 0) / total,
  };
}

function slotFor(palletLoad: PalletLoad, item: CargoItem, pallet: PalletSpec, container: ContainerSpec): Placement | null {
  if (palletLoad.cargoWeightKg + item.weightKg > pallet.maxLoadKg + EPS) return null;
  const maxLayers = Math.max(0, Math.min(item.maxStackLayers ?? Infinity, Math.floor((container.height - pallet.height) / item.height)));
  if (maxLayers < 1) return null;
  const colsX = Math.floor(pallet.length / item.length);
  const colsY = Math.floor(pallet.width / item.width);
  if (colsX < 1 || colsY < 1) return null;

  for (let layer = 0; layer < maxLayers; layer += 1) {
    for (let row = 0; row < colsX; row += 1) {
      for (let col = 0; col < colsY; col += 1) {
        const candidate: Placement = { cargoId: item.id, x: palletLoad.x + row * item.length, y: palletLoad.y + col * item.width, z: pallet.height + layer * item.height, length: item.length, width: item.width, height: item.height, weightKg: item.weightKg };
        const collides = palletLoad.cargoPlacements.some((p) => candidate.x < p.x + p.length - EPS && candidate.x + candidate.length > p.x + EPS && candidate.y < p.y + p.width - EPS && candidate.y + candidate.width > p.y + EPS && candidate.z < p.z + p.height - EPS && candidate.z + candidate.height > p.z + EPS);
        if (!collides) return candidate;
      }
    }
  }
  return null;
}

function tryConsolidate(pallets: PalletLoad[], cargoMap: Map<string, CargoItem>, pallet: PalletSpec, container: ContainerSpec) {
  let removed = 0;
  for (let sourceIndex = pallets.length - 1; sourceIndex > 0; sourceIndex -= 1) {
    const source = pallets[sourceIndex];
    const trialTargets = pallets.slice(0, sourceIndex).map((p) => ({ ...p, cargoPlacements: [...p.cargoPlacements] }));
    let success = true;
    for (const placement of source.cargoPlacements) {
      const item = cargoMap.get(placement.cargoId);
      if (!item) { success = false; break; }
      let moved = false;
      for (const target of trialTargets) {
        const candidate = slotFor(target, item, pallet, container);
        if (!candidate) continue;
        target.cargoPlacements.push(candidate);
        target.cargoWeightKg += item.weightKg;
        target.totalWeightKg = target.cargoWeightKg + pallet.tareWeightKg;
        moved = true;
        break;
      }
      if (!moved) { success = false; break; }
    }
    if (success) {
      for (let i = 0; i < trialTargets.length; i += 1) pallets[i] = trialTargets[i];
      pallets.splice(sourceIndex, 1);
      removed += 1;
    }
  }
  return removed;
}

function rebalanceAndReposition(pallets: PalletLoad[], positions: Array<{ x: number; y: number }>, container: ContainerSpec, pallet: PalletSpec) {
  pallets.sort((a, b) => b.totalWeightKg - a.totalWeightKg);
  let leftWeight = 0;
  let rightWeight = 0;
  const used = new Set<number>();

  for (let i = 0; i < pallets.length; i += 1) {
    const load = pallets[i];
    let bestIndex = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let p = 0; p < positions.length; p += 1) {
      if (used.has(p)) continue;
      const pos = positions[p];
      const xScore = pos.x;
      const centerY = pos.y + pallet.width / 2;
      const goesLeft = centerY < container.width / 2;
      const nextLeft = leftWeight + (goesLeft ? load.totalWeightKg : 0);
      const nextRight = rightWeight + (!goesLeft ? load.totalWeightKg : 0);
      const balancePenalty = Math.abs(nextLeft - nextRight) / Math.max(1, load.totalWeightKg);
      const centerPenalty = Math.abs(centerY - container.width / 2) / Math.max(container.width, EPS);
      const score = xScore * 10 + balancePenalty + centerPenalty * 0.25;
      if (score < bestScore) { bestScore = score; bestIndex = p; }
    }
    if (bestIndex < 0) continue;
    used.add(bestIndex);
    const pos = positions[bestIndex];
    const dx = pos.x - load.x;
    const dy = pos.y - load.y;
    load.x = pos.x;
    load.y = pos.y;
    load.palletIndex = i + 1;
    load.cargoPlacements = load.cargoPlacements.map((placement) => ({ ...placement, x: placement.x + dx, y: placement.y + dy }));
    load.centerOfGravity = palletCog(load, pallet);
    if (pos.y + pallet.width / 2 < container.width / 2) leftWeight += load.totalWeightKg;
    else rightWeight += load.totalWeightKg;
  }
  return { lateralImbalanceKg: Math.abs(leftWeight - rightWeight) };
}

export function packOnPallets(container: ContainerSpec, cargo: CargoItem[], pallet: PalletSpec = defaultPalletSpec): PalletPackingResult {
  const queue = [...cargo].filter((item) => item.quantity > 0).sort((a, b) => b.weightKg - a.weightKg || cargoVolume(b) - cargoVolume(a));
  const cargoMap = new Map(queue.map((item) => [item.id, item]));
  const positions = palletPositions(container, pallet);
  const pallets: PalletLoad[] = [];
  const remaining: PalletPackingResult['remaining'] = [];
  let totalCargoWeight = 0;

  for (const item of queue) {
    let left = item.quantity;
    for (let p = 0; p < positions.length && left > 0; p += 1) {
      let palletLoad = pallets[p];
      if (!palletLoad) {
        const pos = positions[p];
        palletLoad = { palletIndex: p + 1, x: pos.x, y: pos.y, z: 0, length: pallet.length, width: pallet.width, height: pallet.height, cargoPlacements: [], cargoWeightKg: 0, totalWeightKg: pallet.tareWeightKg, centerOfGravity: { x: pos.x + pallet.length / 2, y: pos.y + pallet.width / 2, z: pallet.height / 2 } };
        pallets[p] = palletLoad;
      }
      while (left > 0) {
        if (totalCargoWeight + item.weightKg + pallets.filter(Boolean).length * pallet.tareWeightKg > container.maxPayloadKg + EPS) break;
        const placement = slotFor(palletLoad, item, pallet, container);
        if (!placement) break;
        palletLoad.cargoPlacements.push(placement);
        palletLoad.cargoWeightKg += item.weightKg;
        palletLoad.totalWeightKg = palletLoad.cargoWeightKg + pallet.tareWeightKg;
        totalCargoWeight += item.weightKg;
        left -= 1;
      }
    }
    if (left > 0) remaining.push({ cargoId: item.id, quantity: left, reason: '팔레트 면적·높이·허용중량 또는 컨테이너 최대중량 조건 때문에 적재하지 못함' });
  }

  const usedPallets = pallets.filter((p) => p && p.cargoPlacements.length > 0);
  const consolidatedPallets = tryConsolidate(usedPallets, cargoMap, pallet, container);
  const { lateralImbalanceKg } = rebalanceAndReposition(usedPallets, positions, container, pallet);
  const placements = usedPallets.flatMap((p) => p.cargoPlacements);
  const loadedCargoWeightKg = usedPallets.reduce((sum, p) => sum + p.cargoWeightKg, 0);
  return { pallets: usedPallets, placements, remaining, palletCount: usedPallets.length, loadedCargoWeightKg, totalPalletizedWeightKg: loadedCargoWeightKg + usedPallets.length * pallet.tareWeightKg, consolidatedPallets, lateralImbalanceKg };
}
