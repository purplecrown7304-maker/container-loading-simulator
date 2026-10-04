import { analyzeFloorLoad } from './floorLoad';
import { assessWeightBalance } from './weightBalance';
import type { CargoItem, ContainerSpec, LoadingResult, Placement } from './types';
import { canPlaceWithLoadSim, validateExistingWithLoadSim } from '../rule-engine/loadSimEngine';

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
    // Horizontal rotation swaps the first two axes, including tilted A orientations.
    loadSimOrientation: rotate && original.loadSimOrientation
      ? `${original.loadSimOrientation[1]}${original.loadSimOrientation[0]}${original.loadSimOrientation[2]}` as Placement['loadSimOrientation']
      : original.loadSimOrientation,
  };
  const reasons: string[] = [];
  const violations = canPlaceWithLoadSim(container, cargo, others, candidate);
  reasons.push(...violations.filter(v => v.severity === 'error').map(v => v.message));

  const placements = [...others];
  placements.splice(Math.min(placementIndex, placements.length),0,candidate);
  const nextValidation = validateExistingWithLoadSim(container, cargo, placements);
  const validationIssues = nextValidation.validationIssues;
  if (validationIssues.length) reasons.push('최종 충돌/경계/적재규칙 검증에서 문제가 발견됐습니다.');
  const result: LoadingResult = {
    ...source,
    placements,
    validationIssues,
    operationalFindings: nextValidation?.operationalFindings ?? source.operationalFindings,
    ruleEngine: 'load-sim',
  };
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
