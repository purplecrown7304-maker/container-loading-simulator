import type { CargoItem, ContainerSpec, LoadingResult, Placement } from './types';
import type { FloorLoadAnalysis } from './floorLoad';

export type ConstraintStatus = 'pass' | 'warn' | 'fail';

export type ConstraintCheck = {
  id: 'payload' | 'bounds' | 'height' | 'stack' | 'topLoad' | 'floorLoad' | 'door';
  label: string;
  status: ConstraintStatus;
  detail: string;
};

const EPS = 1e-7;

function overlapArea(a: Placement, b: Placement): number {
  const x = Math.max(0, Math.min(a.x + a.length, b.x + b.length) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.width, b.y + b.width) - Math.max(a.y, b.y));
  return x * y;
}

export function analyzeConstraints(
  container: ContainerSpec,
  cargo: CargoItem[],
  result: LoadingResult,
  floorLoad: FloorLoadAnalysis,
): ConstraintCheck[] {
  const cargoMap = new Map(cargo.map(item => [item.id, item]));
  const maxTop = Math.max(0, ...result.placements.map(p => p.z + p.height));
  const invalidGeometry = result.validationIssues.length > 0;

  let stackViolation = 0;
  for (let i = 0; i < result.placements.length; i += 1) {
    const p = result.placements[i];
    const spec = cargoMap.get(p.cargoId);
    if (!spec?.maxStackLayers) continue;
    const belowSame = result.placements.filter((q, j) =>
      j !== i && q.cargoId === p.cargoId && q.z + q.height <= p.z + EPS && overlapArea(p, q) > Math.min(p.length * p.width, q.length * q.width) * 0.5,
    ).length;
    if (belowSame + 1 > spec.maxStackLayers) stackViolation += 1;
  }

  let topLoadViolation = 0;
  for (const base of result.placements) {
    const spec = cargoMap.get(base.cargoId);
    if (spec?.maxTopLoadKg === undefined) continue;
    const supportedWeight = result.placements.reduce((sum, upper) => {
      if (upper.z + EPS < base.z + base.height) return sum;
      const area = overlapArea(base, upper);
      if (area <= EPS) return sum;
      const ratio = area / Math.max(EPS, upper.length * upper.width);
      return sum + upper.weightKg * Math.min(1, ratio);
    }, 0);
    if (supportedWeight > spec.maxTopLoadKg + EPS) topLoadViolation += 1;
  }

  const doorBandStart = container.length * 0.92;
  const doorBlockedHigh = result.placements.some(p => p.x + p.length > doorBandStart && p.z + p.height > container.height * 0.92);

  return [
    {
      id: 'payload', label: '중량 제한',
      status: result.loadedWeightKg <= container.maxPayloadKg + EPS ? 'pass' : 'fail',
      detail: `${result.loadedWeightKg.toLocaleString()} / ${container.maxPayloadKg.toLocaleString()} kg`,
    },
    {
      id: 'bounds', label: '경계 / 충돌',
      status: invalidGeometry ? 'fail' : 'pass',
      detail: invalidGeometry ? `${result.validationIssues.length}건 검증 이슈` : '컨테이너 경계·충돌 이상 없음',
    },
    {
      id: 'height', label: '적재 높이',
      status: maxTop <= container.height + EPS ? 'pass' : 'fail',
      detail: `최고 ${maxTop.toFixed(2)} / ${container.height.toFixed(2)} m`,
    },
    {
      id: 'stack', label: '최대 적층단',
      status: stackViolation ? 'fail' : 'pass',
      detail: stackViolation ? `${stackViolation}개 위치 초과 가능성` : '품목별 최대 적층단 이내',
    },
    {
      id: 'topLoad', label: '상부 허용중량',
      status: topLoadViolation ? 'warn' : 'pass',
      detail: topLoadViolation ? `${topLoadViolation}개 박스 보수적 재확인 필요` : '보수적 상부하중 검사 통과',
    },
    {
      id: 'floorLoad', label: '바닥 하중 분포',
      status: floorLoad.maxKgPerM2 > floorLoad.averageKgPerM2 * 3 && floorLoad.maxKgPerM2 > 1500 ? 'warn' : 'pass',
      detail: `최대 ${floorLoad.maxKgPerM2.toFixed(0)} kg/m² · 평균 ${floorLoad.averageKgPerM2.toFixed(0)} kg/m²`,
    },
    {
      id: 'door', label: '문쪽 개방 여유',
      status: doorBlockedHigh ? 'warn' : 'pass',
      detail: doorBlockedHigh ? '문쪽 최상단 적재 확인 필요' : '문쪽 높이 여유 양호',
    },
  ];
}
