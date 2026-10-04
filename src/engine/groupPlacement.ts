import { analyzeFloorLoad } from './floorLoad';
import { assessWeightBalance } from './weightBalance';
import { buildPlacementAddresses } from './locationGrid';
import { snapManualCoordinate } from './manualPlacement';
import type { CargoItem, ContainerSpec, LoadingResult, Placement } from './types';
import { canPlaceWithLoadSim, validateExistingWithLoadSim } from '../rule-engine/loadSimEngine';

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
  return Math.abs(lower.z + lower.height - upper.z) <= EPS && overlapArea(lower, upper) > EPS;
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
  const uniqueIndices = [...new Set(indices)].filter(index => source.placements[index]);
  const reasons: string[] = [];
  if (uniqueIndices.length === 0) reasons.push('이동할 박스가 선택되지 않았습니다.');

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
  const cargoById = new Map(cargo.map(item => [item.id, item]));

  for (const index of uniqueIndices) {
    const candidate = finalPlacements[index];
    const item = cargoById.get(candidate.cargoId);
    if (!item) { reasons.push(`품목 정보가 없습니다: ${candidate.cargoId}`); continue; }
    const others = finalPlacements.filter((_, i) => i !== index);
    reasons.push(...canPlaceWithLoadSim(container, cargo, others, candidate)
      .filter(v => v.severity === 'error').map(v => `${candidate.cargoId}: ${v.message}`));
  }

  const nextValidation = validateExistingWithLoadSim(container, cargo, finalPlacements);
  const validationIssues = nextValidation.validationIssues;
  if (validationIssues.length) reasons.push('최종 배치 검증에서 충돌·경계·적재규칙 문제가 발견됐습니다.');

  const result: LoadingResult = {
    ...source,
    placements: finalPlacements,
    validationIssues,
    operationalFindings: nextValidation?.operationalFindings ?? source.operationalFindings,
    ruleEngine: 'load-sim',
  };
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
