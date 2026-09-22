import type { CargoItem, ContainerSpec, Placement } from './types';

/** Door is +X. An earlier stop must not be trapped behind, or underneath, a later stop. */
export function unloadingObstructions(cargo: CargoItem[], placements: Placement[]) {
  const priority = new Map(cargo.map(item => [item.id, item.unloadPriority]));
  let blocked = 0;
  for (const a of placements) {
    const stop = priority.get(a.cargoId);
    if (stop == null) continue;
    if (placements.some(b => {
      const later = priority.get(b.cargoId);
      if (later == null || later <= stop) return false;
      const y = Math.min(a.y + a.width, b.y + b.width) - Math.max(a.y, b.y) > 1e-6;
      const x = Math.min(a.x + a.length, b.x + b.length) - Math.max(a.x, b.x) > 1e-6;
      const z = Math.min(a.z + a.height, b.z + b.height) - Math.max(a.z, b.z) > 1e-6;
      return (y && z && b.x >= a.x + a.length - 1e-6) || (x && y && b.z >= a.z + a.height - 1e-6);
    })) blocked++;
  }
  return blocked;
}

export function operationalQuality(container: ContainerSpec, placements: Placement[]) {
  if (!placements.length) return { cogHeight: 0, height: 0, footprint: 0, slenderness: 0 };
  const measuredWeight = placements.reduce((sum, p) => sum + p.weightKg, 0);
  const total = measuredWeight || placements.length;
  const cogHeight = placements.reduce((sum, p) => sum + (p.z + p.height / 2) * (measuredWeight ? p.weightKg : 1), 0) / total;
  const height = Math.max(...placements.map(p => p.z + p.height));
  const length = Math.max(...placements.map(p => p.x + p.length)) - Math.min(...placements.map(p => p.x));
  const width = Math.max(...placements.map(p => p.y + p.width)) - Math.min(...placements.map(p => p.y));
  const footprint = length * width / (container.length * container.width);
  // A full-width, thin vertical wall has adequate static support but poor transport geometry.
  const slenderness = Math.max(0, height / Math.max(.01, Math.min(length, width)) - 1.25);
  return { cogHeight, height, footprint, slenderness };
}

/** Search preferences only: no declared stacking/compression limit is increased. */
export function fitsEmptyContainer(container: ContainerSpec, item: CargoItem) {
  return item.height <= container.height + 1e-9 && item.weightKg <= container.maxPayloadKg + 1e-9 &&
    ((item.length <= container.length + 1e-9 && item.width <= container.width + 1e-9) ||
      (item.allowRotation !== false && item.width <= container.length + 1e-9 && item.length <= container.width + 1e-9));
}

export function loadingHeightProfiles(container: ContainerSpec, cargo: CargoItem[]) {
  const eligible = cargo.filter(item => fitsEmptyContainer(container, item));
  if (!eligible.length) return [];
  const tallest = Math.max(...eligible.map(item => item.height));
  const volume = eligible.reduce((sum, item) => sum + item.length * item.width * item.height * item.quantity, 0);
  const demandHeight = volume / Math.max(.001, container.length * container.width);
  const values = [Math.max(tallest, demandHeight * 1.2), container.height * .4, container.height * .65];
  return [...new Set(values.map(height => Math.round(Math.max(tallest, height) * 1e6) / 1e6))]
    .filter(height => height < container.height - 1e-6).sort((a, b) => a - b);
}
