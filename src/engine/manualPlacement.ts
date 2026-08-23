import { isInsideContainer, overlaps, validatePlacements } from './constraints';
import { canPlaceByStackingRules } from './stacking';
import { analyzeFloorLoad } from './floorLoad';
import { assessWeightBalance } from './weightBalance';
import type { CargoItem, ContainerSpec, LoadingResult, Placement } from './types';

const EPS = 0.001;
const round3 = (v: number) => Math.round(v * 1000) / 1000;

export type ManualMoveAssessment = {
  valid: boolean;
  reasons: string[];
  candidate: Placement;
  result: LoadingResult;
  before: { quality: number; maxFloorLoadKgPerM2: number; center: { x:number; y:number; z:number } };
  after: { quality: number; maxFloorLoadKgPerM2: number; center: { x:number; y:number; z:number } };
};

function overlapArea(a: Placement, b: Placement): number {
  const x = Math.max(0, Math.min(a.x+a.length,b.x+b.length)-Math.max(a.x,b.x));
  const y = Math.max(0, Math.min(a.y+a.width,b.y+b.width)-Math.max(a.y,b.y));
  return x*y;
}

export function supportsOtherPlacement(index: number, placements: Placement[]): boolean {
  const base = placements[index];
  if (!base) return false;
  const top = base.z + base.height;
  return placements.some((p,i) => i !== index && Math.abs(p.z-top) <= EPS && overlapArea(base,p) > EPS);
}

function fullySupported(candidate: Placement, placements: Placement[]): boolean {
  if (candidate.z <= EPS) return true;
  let area = 0;
  for (const p of placements) {
    if (Math.abs(p.z+p.height-candidate.z) > EPS) continue;
    area += overlapArea(candidate,p);
  }
  return area + EPS >= candidate.length*candidate.width;
}

export function snapManualCoordinate(value: number, step = 0.05): number {
  const s = Math.max(0.001, step);
  return round3(Math.max(0, Math.round(value/s)*s));
}

export function assessManualMove(
  container: ContainerSpec,
  cargo: CargoItem[],
  source: LoadingResult,
  placementIndex: number,
  target: { x:number; y:number; z:number },
  rotate = false,
): ManualMoveAssessment {
  const original = source.placements[placementIndex];
  if (!original) throw new Error('선택한 박스를 찾을 수 없습니다.');
  const item = cargo.find(c => c.id === original.cargoId);
  if (!item) throw new Error(`품목 정보가 없습니다: ${original.cargoId}`);

  const others = source.placements.filter((_,i) => i !== placementIndex);
  const candidate: Placement = {
    ...original,
    x: snapManualCoordinate(target.x), y: snapManualCoordinate(target.y), z: snapManualCoordinate(target.z),
    length: rotate ? original.width : original.length,
    width: rotate ? original.length : original.width,
    rotated: rotate ? !original.rotated : original.rotated,
  };
  const reasons: string[] = [];
  if (supportsOtherPlacement(placementIndex, source.placements)) reasons.push('이 박스는 위 화물을 지지하고 있어 먼저 이동할 수 없습니다.');
  if (!isInsideContainer(container,candidate)) reasons.push('컨테이너 벽·바닥·천장 경계를 벗어납니다.');
  if (others.some(p => overlaps(candidate,p))) reasons.push('다른 화물과 충돌합니다.');
  if (!fullySupported(candidate,others)) reasons.push('바닥 또는 하부 박스가 전체 바닥면을 지지하지 못합니다.');
  const cargoById = new Map(cargo.map(c => [c.id,c]));
  if (!canPlaceByStackingRules(item,candidate,others,cargoById)) reasons.push('최대 적층단 또는 상부 허용중량 조건을 만족하지 않습니다.');

  const placements = [...others];
  placements.splice(Math.min(placementIndex, placements.length),0,candidate);
  const validationIssues = validatePlacements(container,placements);
  if (validationIssues.length) reasons.push('최종 충돌/경계 검증에서 문제가 발견됐습니다.');
  const result: LoadingResult = { ...source, placements, validationIssues };
  const beforeQuality = assessWeightBalance(container,source);
  const afterQuality = assessWeightBalance(container,result);
  const beforeFloor = analyzeFloorLoad(container,source,12,4);
  const afterFloor = analyzeFloorLoad(container,result,12,4);

  return {
    valid: reasons.length === 0, reasons, candidate, result,
    before: { quality: beforeQuality.loadingQualityScore, maxFloorLoadKgPerM2: beforeFloor.maxKgPerM2, center: beforeQuality.centerOfGravity },
    after: { quality: afterQuality.loadingQualityScore, maxFloorLoadKgPerM2: afterFloor.maxKgPerM2, center: afterQuality.centerOfGravity },
  };
}
