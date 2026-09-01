import { analyzeFloorLoad, type FloorLoadAnalysis, type FloorLoadCell } from './floorLoad';
import type { ContainerSpec, LoadingResult } from './types';
import { assessWeightBalance } from './weightBalance';

export type WeightDistributionStatus = 'empty' | 'balanced' | 'caution';

export type WeightDistributionAnalysis = {
  floor: FloorLoadAnalysis;
  centerOfGravity: { x: number; y: number; z: number };
  totalWeightKg: number;
  innerWeightKg: number;
  doorWeightKg: number;
  leftWeightKg: number;
  rightWeightKg: number;
  innerRatio: number;
  doorRatio: number;
  leftRatio: number;
  rightRatio: number;
  centerOffsetMm: { longitudinal: number; lateral: number; vertical: number };
  localWarningKgPerM2: number;
  maxCell: FloorLoadCell | null;
  status: WeightDistributionStatus;
  messages: string[];
};

const EPS = 1e-9;

function splitAlongAxis(
  cells: FloorLoadCell[],
  splitAt: number,
  axis: 'x' | 'y',
): [number, number] {
  let first = 0;
  let second = 0;

  for (const cell of cells) {
    if (cell.loadKg <= 0) continue;
    const start = axis === 'x' ? cell.x : cell.y;
    const size = axis === 'x' ? cell.length : cell.width;
    const end = start + size;
    const firstLength = Math.max(0, Math.min(end, splitAt) - start);
    const firstShare = size > EPS ? Math.min(1, firstLength / size) : 0;
    first += cell.loadKg * firstShare;
    second += cell.loadKg * (1 - firstShare);
  }

  return [first, second];
}

function ratio(value: number, total: number) {
  return total > EPS ? value / total : 0;
}

export function analyzeWeightDistribution(
  container: ContainerSpec,
  result: LoadingResult,
  columns = 20,
  rows = 8,
): WeightDistributionAnalysis {
  const floor = analyzeFloorLoad(container, result, columns, rows);
  const balance = assessWeightBalance(container, result);
  const totalWeightKg = floor.totalProjectedKg;
  const [innerWeightKg, doorWeightKg] = splitAlongAxis(floor.cells, container.length / 2, 'x');
  const [leftWeightKg, rightWeightKg] = splitAlongAxis(floor.cells, container.width / 2, 'y');
  const maxCell = floor.cells.reduce<FloorLoadCell | null>((current, cell) => {
    if (!current || cell.kgPerM2 > current.kgPerM2) return cell;
    return current;
  }, null);

  const floorLimit = Math.max(EPS, container.floorLoadLimitKgPerM2 ?? 1500);
  const warningMultiplier = Math.max(0.1, container.floorLoadWarningMultiplier ?? 3);
  const localWarningKgPerM2 = floorLimit * warningMultiplier;
  const innerRatio = ratio(innerWeightKg, totalWeightKg);
  const doorRatio = ratio(doorWeightKg, totalWeightKg);
  const leftRatio = ratio(leftWeightKg, totalWeightKg);
  const rightRatio = ratio(rightWeightKg, totalWeightKg);
  const maxLongitudinalRatio = Math.max(innerRatio, doorRatio);
  const maxLateralRatio = Math.max(leftRatio, rightRatio);
  const hasLocalWarning = (maxCell?.kgPerM2 ?? 0) > localWarningKgPerM2;
  const hasBalanceWarning = maxLongitudinalRatio > 0.6 || maxLateralRatio > 0.6;

  const messages: string[] = [];
  if (totalWeightKg <= EPS) {
    messages.push('적재된 화물이 없어 무게 분포를 계산할 수 없습니다.');
  } else {
    messages.push(maxLongitudinalRatio <= 0.6
      ? '안쪽/문쪽 중량이 60:40 범위 안에 있습니다.'
      : `안쪽/문쪽 한쪽에 총중량의 ${(maxLongitudinalRatio * 100).toFixed(1)}%가 집중되어 있습니다.`);
    messages.push(maxLateralRatio <= 0.6
      ? '좌/우 중량이 60:40 범위 안에 있습니다.'
      : `좌/우 한쪽에 총중량의 ${(maxLateralRatio * 100).toFixed(1)}%가 집중되어 있습니다.`);
    if (hasLocalWarning) {
      messages.push(`최대 국부하중 ${(maxCell?.kgPerM2 ?? 0).toFixed(0)} kg/m²가 현재 설정 경고기준 ${localWarningKgPerM2.toFixed(0)} kg/m²를 넘습니다.`);
    } else {
      messages.push(`최대 국부하중이 현재 설정 경고기준 ${localWarningKgPerM2.toFixed(0)} kg/m² 이내입니다.`);
    }
  }

  return {
    floor,
    centerOfGravity: balance.centerOfGravity,
    totalWeightKg,
    innerWeightKg,
    doorWeightKg,
    leftWeightKg,
    rightWeightKg,
    innerRatio,
    doorRatio,
    leftRatio,
    rightRatio,
    centerOffsetMm: {
      longitudinal: (balance.centerOfGravity.x - container.length / 2) * 1000,
      lateral: (balance.centerOfGravity.y - container.width / 2) * 1000,
      vertical: balance.centerOfGravity.z * 1000,
    },
    localWarningKgPerM2,
    maxCell,
    status: totalWeightKg <= EPS ? 'empty' : hasLocalWarning || hasBalanceWarning ? 'caution' : 'balanced',
    messages,
  };
}
