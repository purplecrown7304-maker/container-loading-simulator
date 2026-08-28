import { loadContainer, type LoadingStrategy } from './loadingEngine';
import type { CargoItem, LoadingResult } from './types';
import type { PhysicsTarget } from '../physicsTarget';
import { createPhysicsTargetSignature } from '../inertiaCertification';

const EPS = 1e-9;
const STRATEGIES: LoadingStrategy[] = ['stability', 'capacity', 'unloading'];
const HEIGHT_RATIOS = [1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25];

type LayerProfileMode = 'all' | 'heavy' | 'tall' | 'staggered';

type CargoSearchProfile = {
  label: string;
  cargo: CargoItem[];
};

export type DirectResultReoptimizationCandidate = {
  label: string;
  result: LoadingResult;
  target: PhysicsTarget;
  staticPenalty: number;
};

function loadedCounts(result: LoadingResult) {
  const counts = new Map<string, number>();
  result.placements.forEach(item => counts.set(item.cargoId, (counts.get(item.cargoId) ?? 0) + 1));
  return counts;
}

function sameLoadedCargo(a: LoadingResult, b: LoadingResult) {
  const A = loadedCounts(a);
  const B = loadedCounts(b);
  const ids = new Set([...A.keys(), ...B.keys()]);
  for (const id of ids) if ((A.get(id) ?? 0) !== (B.get(id) ?? 0)) return false;
  return true;
}

function physicalLayerLimit(target: PhysicsTarget, item: CargoItem) {
  const byHeight = Math.max(1, Math.floor((target.container.height + EPS) / Math.max(EPS, item.height)));
  const configured = item.maxStackLayers == null ? byHeight : Math.max(1, Math.floor(item.maxStackLayers));
  return Math.max(1, Math.min(byHeight, configured));
}

function cappedCargo(target: PhysicsTarget, ratio: number): CargoItem[] {
  const preferredHeight = Math.max(0.15, target.container.height * ratio);
  return target.cargo.map(item => {
    const physicalLayers = Math.max(1, Math.floor((preferredHeight + EPS) / Math.max(EPS, item.height)));
    return { ...item, maxStackLayers: Math.max(1, Math.min(physicalLayerLimit(target, item), physicalLayers)) };
  });
}

function preferredIds(items: CargoItem[], selector: (item: CargoItem) => number) {
  const count = Math.max(1, Math.ceil(items.length / 2));
  return new Set(
    [...items]
      .sort((a, b) => selector(b) - selector(a) || a.id.localeCompare(b.id))
      .slice(0, count)
      .map(item => item.id),
  );
}

function idPhase(id: string) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  return hash % 3;
}

function reducedCargo(target: PhysicsTarget, reduction: number, mode: LayerProfileMode): CargoItem[] {
  const heavy = preferredIds(target.cargo, item => item.weightKg);
  const tall = preferredIds(target.cargo, item => item.height);
  return target.cargo.map(item => {
    const base = physicalLayerLimit(target, item);
    let extra = 0;
    if (mode === 'heavy' && heavy.has(item.id)) extra = 1;
    if (mode === 'tall' && tall.has(item.id)) extra = 1;
    if (mode === 'staggered') extra = idPhase(item.id);
    return { ...item, maxStackLayers: Math.max(1, base - reduction - extra) };
  });
}

function stackProfileKey(cargo: CargoItem[]) {
  return cargo
    .map(item => `${item.id}:${item.maxStackLayers ?? 'auto'}`)
    .sort()
    .join('|');
}

/**
 * Generates every distinct, deterministic stack-height profile that can be
 * explored without changing the requested cargo count. There is deliberately
 * no fixed "3회/6회" retry budget: search terminates only when the finite set
 * of unique stack profiles has been exhausted.
 */
export function buildDirectReoptimizationCargoProfiles(current: PhysicsTarget): CargoSearchProfile[] {
  if (current.mode !== 'boxes') return [];
  const profiles: CargoSearchProfile[] = [];
  const seen = new Set<string>();
  const add = (label: string, cargo: CargoItem[]) => {
    const key = stackProfileKey(cargo);
    if (seen.has(key)) return;
    seen.add(key);
    profiles.push({ label, cargo });
  };

  for (const ratio of HEIGHT_RATIOS) {
    add(`전체 높이 ${Math.round(ratio * 100)}%`, cappedCargo(current, ratio));
  }

  const maxLayers = current.cargo.reduce((max, item) => Math.max(max, physicalLayerLimit(current, item)), 1);
  const modes: Array<{ mode: LayerProfileMode; label: string }> = [
    { mode: 'all', label: '전체 저중심' },
    { mode: 'heavy', label: '중량물 저층 우선' },
    { mode: 'tall', label: '고형상 저층 우선' },
    { mode: 'staggered', label: 'SKU 층수 분산' },
  ];
  for (let reduction = 1; reduction < maxLayers; reduction += 1) {
    for (const profile of modes) {
      add(`${profile.label} · ${reduction}단 낮춤`, reducedCargo(current, reduction, profile.mode));
    }
  }

  return profiles;
}

function weightedCogHeight(result: LoadingResult) {
  const total = result.placements.reduce((sum, item) => sum + Math.max(0, item.weightKg), 0) || 1;
  return result.placements.reduce((sum, item) => sum + (item.z + item.height / 2) * Math.max(0, item.weightKg), 0) / total;
}

function maxTop(result: LoadingResult) {
  return result.placements.reduce((max, item) => Math.max(max, item.z + item.height), 0);
}

function lateralMoment(target: PhysicsTarget, result: LoadingResult) {
  const center = target.container.width / 2;
  const total = result.placements.reduce((sum, item) => sum + Math.max(0, item.weightKg), 0) || 1;
  return Math.abs(result.placements.reduce((sum, item) => sum + ((item.y + item.width / 2) - center) * Math.max(0, item.weightKg), 0) / total);
}

function staticPenalty(target: PhysicsTarget, result: LoadingResult) {
  return maxTop(result) * 2.5 + weightedCogHeight(result) * 4 + lateralMoment(target, result) * 2 + result.validationIssues.length * 100;
}

export function buildDirectResultReoptimizationCandidates(
  current: PhysicsTarget,
  limit = Number.POSITIVE_INFINITY,
): DirectResultReoptimizationCandidate[] {
  if (current.mode !== 'boxes') return [];
  const seen = new Set<string>([createPhysicsTargetSignature(current)]);
  const candidates: DirectResultReoptimizationCandidate[] = [];

  for (const profile of buildDirectReoptimizationCargoProfiles(current)) {
    for (const strategy of STRATEGIES) {
      const result = loadContainer(current.container, profile.cargo, { strategy, publish: false });
      if (result.validationIssues.length > 0) continue;
      if (!sameLoadedCargo(current.result, result)) continue;
      const target: PhysicsTarget = { mode: 'boxes', container: current.container, cargo: current.cargo, result };
      const signature = createPhysicsTargetSignature(target);
      if (seen.has(signature)) continue;
      seen.add(signature);
      candidates.push({
        label: `${strategy === 'stability' ? '안정성 우선' : strategy === 'capacity' ? '적재율 우선' : '하역 우선'} · ${profile.label}`,
        result,
        target,
        staticPenalty: staticPenalty(current, result),
      });
    }
  }

  const sorted = candidates.sort((a, b) => a.staticPenalty - b.staticPenalty || a.label.localeCompare(b.label));
  return Number.isFinite(limit)
    ? sorted.slice(0, Math.max(1, Math.floor(limit)))
    : sorted;
}
