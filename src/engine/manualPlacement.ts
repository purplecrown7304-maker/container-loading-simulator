import { preflightCargoInput } from './inputPreflight';
import { decorateLimitReview, resolveLimitReview, reviewPlacementBlockers } from './limitReview';
import { isARules, placementOrientation, rotateHorizontal, aConfig } from './loadingRuleset';
import { aCandidateAllowed } from './loadSimAdapter';
import { isInsideContainer, overlaps } from './constraints';
import { canPlaceByStackingRules } from './stacking';
import { auditLoading } from './loadingAudit';
import { validateOperationalLoading } from './operationalValidator';
import { hasAdequateSupport, supportContactArea } from './support';
import { editedSecuringEvidence, editRegressionReasons, voidFillFindings } from './directBoxEditPolicy';
import { readSecuringMaterialSettings } from '../securingMaterialSettings';
import { heavyInnerConflictFindings, usesHeavyInnerLoading } from './heavyInnerPolicy';
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
  return placements.some((p,i) => i !== index && supportContactArea(base,p) > 0);
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
  const review = resolveLimitReview(container,cargo);
  const reviewing = review.status === 'active';
  const item = review.cargo.find(c => c.id === original.cargoId);
  if (!item) throw new Error(`품목 정보가 없습니다: ${original.cargoId}`);

  const others = source.placements.filter((_,i) => i !== placementIndex);
  const candidate: Placement = {
    ...original,
    x: snapManualCoordinate(target.x), y: snapManualCoordinate(target.y), z: snapManualCoordinate(target.z),
    length: rotate ? original.width : original.length,
    width: rotate ? original.length : original.width,
    rotated: rotate ? !original.rotated : original.rotated,
    orientation: isARules(container) ? (rotate ? rotateHorizontal(placementOrientation(original)) : placementOrientation(original)) : original.orientation,
  };
  const reasons: string[] = [];
  if (supportsOtherPlacement(placementIndex, source.placements)) reasons.push('이 박스는 위 화물을 지지하고 있어 먼저 이동할 수 없습니다.');
  if (!isInsideContainer(container,candidate)) reasons.push('컨테이너 벽·바닥·천장 경계를 벗어납니다.');
  if (others.some(p => overlaps(candidate,p,isARules(container)?aConfig(container).epsilon/1000:undefined))) reasons.push('다른 화물과 충돌합니다.');
  // Manual edits intentionally require a full footprint; final acceptance still
  // runs below, with the same hard rules used when restoring the saved result.
  if (!(isARules(container) ? fullySupported(candidate,others) : hasAdequateSupport(candidate,others,undefined,reviewing && container.limitReview?.minimumSupportRatio !== undefined ? review.minimumSupportRatio : 1))) reasons.push('바닥 또는 하부 박스가 전체 바닥면을 지지하지 못합니다.');
  const cargoById = new Map(review.cargo.map(c => [c.id,c]));
  if (isARules(container) ? !aCandidateAllowed(container,cargo,others,candidate) : !canPlaceByStackingRules(item,candidate,others,cargoById)) reasons.push('최대 적층단 또는 상부 허용중량 조건을 만족하지 않습니다.');

  const placements = [...others];
  placements.splice(Math.min(placementIndex, placements.length),0,candidate);
  const validationIssues = auditLoading(container,container.limitReview === undefined ? cargo : preflightCargoInput(cargo).cargo,placements);
  const securingLevel = source.securingBudget?.level ?? 1;
  const materials = readSecuringMaterialSettings();
  const securing = editedSecuringEvidence(container,cargo,placements,securingLevel,materials);
  const loadedWeightKg = placements.reduce((sum, placement) => sum + placement.weightKg,0);
  if (container.limitReview === undefined && securing.totalTransportWeightKg > container.maxPayloadKg + 1e-6) validationIssues.push({
    type:'PAYLOAD',message:'필수 고정·메움재를 포함한 운송 중량이 허용 적재 중량을 초과합니다.',placementIndexes:[],
  });
  // A prior conflict records that the source used the unloading strategy even
  // when no explicit container policy was saved. Edits preserve that provenance.
  const conflictStrategy = source.operationalFindings?.some(f => f.code === 'HEAVY_INNER_UNLOAD_CONFLICT') ? 'unloading' : 'capacity';
  const operationalFindings = [
    ...validateOperationalLoading(container,cargo,placements,[],{legacyDirectBox:usesHeavyInnerLoading(container,cargo)}),
    ...heavyInnerConflictFindings(container,cargo,placements,conflictStrategy),
    ...voidFillFindings(securing.voidFillPlan),
  ];
  const candidateResult: LoadingResult = { ...source, placements, validationIssues, operationalFindings, loadedWeightKg,
    voidFillPlan:securing.voidFillPlan,
    securingBudget:{level:securingLevel,
      reservedWeightKg:Math.max(source.securingBudget?.reservedWeightKg ?? 0,securing.transportSecuringWeightKg),
      requiredWeightKg:securing.requiredWeightKg,voidFillWeightKg:securing.voidFillWeightKg,
      transportSecuringWeightKg:securing.transportSecuringWeightKg,totalTransportWeightKg:securing.totalTransportWeightKg} };
  if (container.limitReview === undefined) reasons.push(...editRegressionReasons(source,candidateResult));
  else reasons.push(...reviewPlacementBlockers(container,cargo,placements,securing.totalTransportWeightKg));
  const result: LoadingResult = decorateLimitReview(container,cargo,candidateResult);
  const beforeQuality = assessWeightBalance(container,source);
  const afterQuality = assessWeightBalance(container,result);
  const beforeFloor = analyzeFloorLoad(container,source,12,4);
  const afterFloor = analyzeFloorLoad(container,result,12,4);

  return {
    valid: reasons.length === 0, reasons: [...new Set(reasons)], candidate, result,
    before: { quality: beforeQuality.loadingQualityScore, maxFloorLoadKgPerM2: beforeFloor.maxKgPerM2, center: beforeQuality.centerOfGravity },
    after: { quality: afterQuality.loadingQualityScore, maxFloorLoadKgPerM2: afterFloor.maxKgPerM2, center: afterQuality.centerOfGravity },
  };
}
