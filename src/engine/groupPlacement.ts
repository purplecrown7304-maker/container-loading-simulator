import { resolveLimitReview, reviewPlacementBlockers } from './limitReview';
import { isARules, aConfig } from './loadingRuleset';
import { isInsideContainer, overlaps } from './constraints';
import { canPlaceByStackingRules } from './stacking';
import { hasAdequateSupport, supportContactArea } from './support';
import { analyzeFloorLoad } from './floorLoad';
import { assessWeightBalance } from './weightBalance';
import { buildPlacementAddresses } from './locationGrid';
import { snapManualCoordinate } from './manualPlacement';
import { manualEditRegressionReasons, recomputeManualEditResult } from './manualEditPolicy';
import type { CargoItem, ContainerSpec, LoadingResult, Placement } from './types';

const EPS = 0.001;

export type GroupSelectionMode = 'cargo' | 'row' | 'layer';

export type GroupMoveAssessment = {
  valid: boolean;
  reasons: string[];
  indices: number[];
  delta: { x: number; y: number; z: number };
  result: LoadingResult;
  before: { quality: number; maxFloorLoadKgPerM2: number; centerX: number };
  after: { quality: number; maxFloorLoadKgPerM2: number; centerX: number };
};

const snapSigned = (value: number, step = 0.05) => Math.round(value / step) * step;

function overlapArea(a: Placement, b: Placement): number {
  const x = Math.max(0, Math.min(a.x + a.length, b.x + b.length) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.width, b.y + b.width) - Math.max(a.y, b.y));
  return x * y;
}

function directlySupports(lower: Placement, upper: Placement): boolean {
  return supportContactArea(lower, upper) > 0;
}

function fullySupported(candidate: Placement, placements: Placement[]): boolean {
  if (candidate.z <= EPS) return true;
  let area = 0;
  for (const p of placements) {
    if (Math.abs(p.z + p.height - candidate.z) > EPS) continue;
    area += overlapArea(candidate, p);
  }
  return area + EPS >= candidate.length * candidate.width;
}

export function selectPlacementGroup(
  source: LoadingResult,
  container: ContainerSpec,
  anchorIndex: number,
  mode: GroupSelectionMode,
): number[] {
  const anchor = source.placements[anchorIndex];
  if (!anchor) return [];
  const addresses = buildPlacementAddresses(source.placements, container.length);
  const anchorAddress = addresses[anchorIndex];
  return source.placements
    .map((placement, index) => ({ placement, index, address: addresses[index] }))
    .filter(({ placement, address }) => {
      if (mode === 'cargo') return placement.cargoId === anchor.cargoId;
      if (mode === 'row') return address.row === anchorAddress.row;
      return address.layer === anchorAddress.layer;
    })
    .map(({ index }) => index);
}

export function groupSupportsOutside(indices: number[], placements: Placement[]): boolean {
  const selected = new Set(indices);
  return indices.some(index => {
    const base = placements[index];
    if (!base) return false;
    return placements.some((upper, upperIndex) => !selected.has(upperIndex) && directlySupports(base, upper));
  });
}

export function assessGroupMove(
  container: ContainerSpec,
  cargo: CargoItem[],
  source: LoadingResult,
  indices: number[],
  delta: { x: number; y: number; z: number },
): GroupMoveAssessment {
  const review = resolveLimitReview(container,cargo);
  const reviewing = review.status === 'active';
  const uniqueIndices = [...new Set(indices)].filter(index => source.placements[index]);
  const reasons: string[] = [];
  if (uniqueIndices.length === 0) reasons.push('이동할 박스가 선택되지 않았습니다.');
  if (groupSupportsOutside(uniqueIndices, source.placements)) reasons.push('선택 블록이 선택되지 않은 상부 화물을 지지하고 있습니다.');

  const snappedDelta = {
    x: snapSigned(delta.x),
    y: snapSigned(delta.y),
    z: snapSigned(delta.z),
  };
  const movedByIndex = new Map<number, Placement>();
  for (const index of uniqueIndices) {
    const original = source.placements[index];
    movedByIndex.set(index, {
      ...original,
      x: snapManualCoordinate(original.x + snappedDelta.x),
      y: snapManualCoordinate(original.y + snappedDelta.y),
      z: snapManualCoordinate(original.z + snappedDelta.z),
    });
  }

  const finalPlacements = source.placements.map((placement, index) => movedByIndex.get(index) ?? placement);
  const cargoById = new Map(review.cargo.map(item => [item.id, item]));

  for (const index of uniqueIndices) {
    const candidate = finalPlacements[index];
    const item = cargoById.get(candidate.cargoId);
    if (!item) { reasons.push(`품목 정보가 없습니다: ${candidate.cargoId}`); continue; }
    if (!isInsideContainer(container, candidate)) reasons.push(`${candidate.cargoId}: 컨테이너 경계를 벗어납니다.`);
    const others = finalPlacements.filter((_, i) => i !== index);
    if (others.some(other => overlaps(candidate, other,isARules(container)?aConfig(container).epsilon/1000:undefined))) reasons.push(`${candidate.cargoId}: 이동 후 다른 화물과 충돌합니다.`);
    // Group edits retain the stricter full-footprint manual policy. It supplements,
    // rather than replaces, the final audit of every moved and unmoved box below.
    if (!(isARules(container) ? fullySupported(candidate, others) : hasAdequateSupport(candidate,others,undefined,reviewing && container.limitReview?.minimumSupportRatio !== undefined ? review.minimumSupportRatio : 1))) reasons.push(`${candidate.cargoId}: 이동 후 바닥면 전체가 지지되지 않습니다.`);
    if (!isARules(container) && !canPlaceByStackingRules(item, candidate, others, cargoById)) reasons.push(`${candidate.cargoId}: 적층단 또는 상부 허용중량 조건을 만족하지 않습니다.`);
  }

  const conflictStrategy = source.operationalFindings?.some(f => f.code === 'HEAVY_INNER_UNLOAD_CONFLICT') ? 'unloading' : 'capacity';
  const result = recomputeManualEditResult(container, cargo, source, finalPlacements, conflictStrategy);
  const sourceEvidence = recomputeManualEditResult(container, cargo, source, source.placements, conflictStrategy);
  if (container.limitReview === undefined) {
    reasons.push(...manualEditRegressionReasons(sourceEvidence, result));
  } else {
    reasons.push(...reviewPlacementBlockers(container, cargo, finalPlacements, result.securingBudget?.totalTransportWeightKg));
    reasons.push(...manualEditRegressionReasons(sourceEvidence, result)
      .filter(reason => reason.includes('기존 운영 오류')));
  }
  const beforeQuality = assessWeightBalance(container, source);
  const afterQuality = assessWeightBalance(container, result);
  const beforeFloor = analyzeFloorLoad(container, source, 12, 4);
  const afterFloor = analyzeFloorLoad(container, result, 12, 4);

  return {
    valid: reasons.length === 0,
    reasons: [...new Set(reasons)],
    indices: uniqueIndices,
    delta: snappedDelta,
    result,
    before: { quality: beforeQuality.loadingQualityScore, maxFloorLoadKgPerM2: beforeFloor.maxKgPerM2, centerX: beforeQuality.centerOfGravity.x },
    after: { quality: afterQuality.loadingQualityScore, maxFloorLoadKgPerM2: afterFloor.maxKgPerM2, centerX: afterQuality.centerOfGravity.x },
  };
}
