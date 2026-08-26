import { loadContainer, type LoadingStrategy } from './loadingEngine';
import { assessTruckAxleLoad } from './truckAxleLoad';
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

function longitudinalMoment(target: PhysicsTarget, result: LoadingResult) {
  const center = target.container.length / 2;
  const total = result.placements.reduce((sum, item) => sum + Math.max(0, item.weightKg), 0) || 1;
  return Math.abs(result.placements.reduce((sum, item) => sum + ((item.x + item.length / 2) - center) * Math.max(0, item.weightKg), 0) / total);
}

function staticPenalty(target: PhysicsTarget, result: LoadingResult) {
  const truckLongitudinalPenalty = target.container.transportKind === 'truck' ? longitudinalMoment(target, result) * 5 : 0;
  const axle = assessTruckAxleLoad(target.container, result);
  return maxTop(result) * 2.5
    + weightedCogHeight(result) * 4
    + lateralMoment(target, result) * 2
    + truckLongitudinalPenalty
    + (axle?.penalty ?? 0)
    + result.validationIssues.length * 100;
}

function centerLongitudinally(target: PhysicsTarget, result: LoadingResult): LoadingResult | null {
  if (target.container.transportKind !== 'truck' || !result.placements.length) return null;
  const minX = Math.min(...result.placements.map(item => item.x));
  const maxX = Math.max(...result.placements.map(item => item.x + item.length));
  const footprintCenter = (minX + maxX) / 2;
  const desired = target.container.length / 2;
  const minShift = -minX;
  const maxShift = target.container.length - maxX;
  const dx = Math.max(minShift, Math.min(maxShift, desired - footprintCenter));
  if (Math.abs(dx) < 0.005) return null;

  return {
    ...result,
    placements: result.placements.map(item => ({ ...item, x: item.x + dx })),
    autoCorrections: [
      ...(result.autoCorrections ?? []),
      {
        kind: 'SHAPE',
        label: '트럭 종방향 중앙 정렬',
        description: `화물 묶음을 ${(dx * 1000).toFixed(0)}mm 이동해 적재함 앞뒤 무게중심을 중앙 쪽으로 조정`,
      },
    ],
  };
}

function addCandidate(
  current: PhysicsTarget,
  result: LoadingResult,
  label: string,
  seen: Set<string>,
  candidates: DirectResultReoptimizationCandidate[],
) {
  if (result.validationIssues.length > 0) return;
  if (!sameLoadedCargo(current.result, result)) return;
  const target: PhysicsTarget = { mode: 'boxes', container: current.container, cargo: current.cargo, result };
  const signature = createPhysicsTargetSignature(target);
  if (seen.has(signature)) return;
  seen.add(signature);
  candidates.push({ label, result, target, staticPenalty: staticPenalty(current, result) });
}

export function buildDirectResultReoptimizationCandidates(
  current: PhysicsTarget,
  limit = Number.POSITIVE_INFINITY,
): DirectResultReoptimizationCandidate[] {
  if (current.mode !== 'boxes') return [];
  const seen = new Set<string>([createPhysicsTargetSignature(current)]);
  const candidates: DirectResultReoptimizationCandidate[] = [];

  for (const ratio of HEIGHT_RATIOS) {
    const cargo = cappedCargo(current, ratio);
    for (const strategy of STRATEGIES) {
      const result = loadContainer(current.container, cargo, { strategy, publish: false });
      const strategyLabel = strategy === 'stability' ? '안정성 우선' : strategy === 'capacity' ? '적재율 우선' : '하역 우선';
      addCandidate(current, result, `${strategyLabel} · 높이 ${Math.round(ratio * 100)}% 재배치`, seen, candidates);

      const centered = centerLongitudinally(current, result);
      if (centered) addCandidate(current, centered, `트럭 중앙균형 · ${strategyLabel} · 높이 ${Math.round(ratio * 100)}%`, seen, candidates);
    }
  }

  const sorted = candidates.sort((a, b) => a.staticPenalty - b.staticPenalty);
  return Number.isFinite(limit) ? sorted.slice(0, Math.max(1, limit)) : sorted;
}
