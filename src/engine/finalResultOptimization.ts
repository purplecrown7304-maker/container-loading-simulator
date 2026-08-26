import { loadContainer, type LoadingStrategy } from './loadingEngine';
import type { CargoItem, LoadingResult } from './types';
import type { PhysicsTarget } from '../physicsTarget';
import { createPhysicsTargetSignature } from '../inertiaCertification';

const EPS = 1e-9;
const STRATEGIES: LoadingStrategy[] = ['stability', 'capacity', 'unloading'];
const HEIGHT_RATIOS = [0.5, 0.62, 0.74, 0.86, 1];

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

function cappedCargo(target: PhysicsTarget, ratio: number): CargoItem[] {
  const preferredHeight = Math.max(0.15, target.container.height * ratio);
  return target.cargo.map(item => {
    const physicalLayers = Math.max(1, Math.floor((preferredHeight + EPS) / Math.max(EPS, item.height)));
    const configured = item.maxStackLayers ?? Number.POSITIVE_INFINITY;
    return { ...item, maxStackLayers: Math.max(1, Math.min(configured, physicalLayers)) };
  });
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
  limit = 6,
): DirectResultReoptimizationCandidate[] {
  if (current.mode !== 'boxes') return [];
  const seen = new Set<string>([createPhysicsTargetSignature(current)]);
  const candidates: DirectResultReoptimizationCandidate[] = [];

  for (const ratio of HEIGHT_RATIOS) {
    const cargo = cappedCargo(current, ratio);
    for (const strategy of STRATEGIES) {
      const result = loadContainer(current.container, cargo, { strategy, publish: false });
      if (result.validationIssues.length > 0) continue;
      if (!sameLoadedCargo(current.result, result)) continue;
      const target: PhysicsTarget = { mode: 'boxes', container: current.container, cargo: current.cargo, result };
      const signature = createPhysicsTargetSignature(target);
      if (seen.has(signature)) continue;
      seen.add(signature);
      candidates.push({
        label: `${strategy === 'stability' ? '안정성 우선' : strategy === 'capacity' ? '적재율 우선' : '하역 우선'} · 높이 ${Math.round(ratio * 100)}% 재배치`,
        result,
        target,
        staticPenalty: staticPenalty(current, result),
      });
    }
  }

  return candidates.sort((a, b) => a.staticPenalty - b.staticPenalty).slice(0, Math.max(1, limit));
}
