import type { CargoItem, ContainerSpec, LoadingResult, Placement } from './types';
import { assessManualMove, snapManualCoordinate } from './manualPlacement';

export type SmartSnapReason = '드래그 위치' | '안쪽 벽' | '문쪽 벽' | '좌측 벽' | '우측 벽' | '같은 품목 옆' | '기존 박스 옆' | '상단 지지면';

export type SmartSnapCandidate = {
  position: { x: number; y: number; z: number };
  reason: SmartSnapReason;
  score: number;
};

const EPS = 0.001;
const distance2 = (a: {x:number;y:number;z:number}, b:{x:number;y:number;z:number}) => (a.x-b.x)**2 + (a.y-b.y)**2 + (a.z-b.z)**2;

function addCandidate(map: Map<string, SmartSnapCandidate>, position: {x:number;y:number;z:number}, reason: SmartSnapReason) {
  const p = { x: snapManualCoordinate(position.x), y: snapManualCoordinate(position.y), z: snapManualCoordinate(position.z) };
  const key = `${p.x}|${p.y}|${p.z}`;
  if (!map.has(key)) map.set(key, { position: p, reason, score: Number.POSITIVE_INFINITY });
}

export function findBestSmartSnap(
  container: ContainerSpec,
  cargo: CargoItem[],
  result: LoadingResult,
  placementIndex: number,
  raw: { x:number; y:number; z:number },
  rotate = false,
): SmartSnapCandidate | null {
  const original = result.placements[placementIndex];
  if (!original) return null;
  const length = rotate ? original.width : original.length;
  const width = rotate ? original.length : original.width;
  const candidates = new Map<string, SmartSnapCandidate>();
  addCandidate(candidates, raw, '드래그 위치');
  addCandidate(candidates, { ...raw, x: 0 }, '안쪽 벽');
  addCandidate(candidates, { ...raw, x: Math.max(0, container.length - length) }, '문쪽 벽');
  addCandidate(candidates, { ...raw, y: 0 }, '좌측 벽');
  addCandidate(candidates, { ...raw, y: Math.max(0, container.width - width) }, '우측 벽');

  result.placements.forEach((p, index) => {
    if (index === placementIndex) return;
    const same = p.cargoId === original.cargoId;
    const reason: SmartSnapReason = same ? '같은 품목 옆' : '기존 박스 옆';
    if (Math.abs(p.z - raw.z) <= Math.max(original.height, p.height) + 0.2) {
      addCandidate(candidates, { x: p.x + p.length, y: p.y, z: p.z }, reason);
      addCandidate(candidates, { x: p.x - length, y: p.y, z: p.z }, reason);
      addCandidate(candidates, { x: p.x, y: p.y + p.width, z: p.z }, reason);
      addCandidate(candidates, { x: p.x, y: p.y - width, z: p.z }, reason);
    }
    const top = p.z + p.height;
    if (Math.abs(top - raw.z) <= 0.45) {
      addCandidate(candidates, { x: p.x, y: p.y, z: top }, '상단 지지면');
      addCandidate(candidates, { x: p.x + p.length - length, y: p.y, z: top }, '상단 지지면');
      addCandidate(candidates, { x: p.x, y: p.y + p.width - width, z: top }, '상단 지지면');
    }
  });

  let best: SmartSnapCandidate | null = null;
  for (const candidate of candidates.values()) {
    const assessment = assessManualMove(container, cargo, result, placementIndex, candidate.position, rotate);
    if (!assessment.valid) continue;
    const moved = assessment.candidate;
    const sameContacts = result.placements.reduce((count, p, index) => {
      if (index === placementIndex || p.cargoId !== original.cargoId) return count;
      const xTouch = Math.abs(moved.x + moved.length - p.x) <= EPS || Math.abs(p.x + p.length - moved.x) <= EPS;
      const yTouch = Math.abs(moved.y + moved.width - p.y) <= EPS || Math.abs(p.y + p.width - moved.y) <= EPS;
      const zOverlap = Math.min(moved.z + moved.height, p.z + p.height) - Math.max(moved.z, p.z) > EPS;
      return count + ((xTouch || yTouch) && zOverlap ? 1 : 0);
    }, 0);
    const wallContacts = (moved.x <= EPS ? 1 : 0) + (moved.y <= EPS ? 1 : 0) + (moved.y + moved.width >= container.width - EPS ? 1 : 0);
    const proximity = Math.sqrt(distance2(candidate.position, raw));
    const innerPenalty = moved.x / Math.max(container.length, EPS);
    const heightPenalty = moved.z / Math.max(container.height, EPS);
    const qualityBonus = Math.max(-20, Math.min(20, assessment.after.quality - assessment.before.quality));
    const score = proximity * 2.4 + innerPenalty * 1.1 + heightPenalty * 1.6 - sameContacts * 1.4 - wallContacts * 0.35 - qualityBonus * 0.03;
    const ranked = { ...candidate, score };
    if (!best || ranked.score < best.score) best = ranked;
  }
  return best;
}
