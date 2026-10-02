import { validatePlacements } from './engine/constraints';
import { analyzeFloorLoad } from './engine/floorLoad';
import { assessWeightBalance } from './engine/weightBalance';
import type { Placement } from './engine/types';
import type { PhysicsTarget } from './physicsTarget';

export type InspectionKind = 'geometry' | 'balance' | 'load' | 'inertia';
export type InspectionFinding = { summary: string; details: string[]; caution: string; attention: boolean };
export type InspectionResponse = { progress: number; result?: InspectionFinding; error?: string };
export const INSPECTIONS: { id: InspectionKind; title: string; description: string }[] = [
  { id: 'geometry', title: '경계·충돌 점검', description: '상자와 팔레트 바닥판의 경계 침범·겹침을 다시 계산합니다.' },
  { id: 'balance', title: '무게중심 점검', description: '상자·팔레트 자중을 포함한 중심 좌표와 앞뒤·좌우 편차를 계산합니다.' },
  { id: 'load', title: '총중량·바닥 하중 추정', description: '허용 적재중량과 비교하고 12 × 4 격자 투영 하중을 계산합니다.' },
  { id: 'inertia', title: '관성 테스트', description: 'Rapier 엔진으로 출발 0.30g · 급제동 0.50g · 급회전 0.35g를 계산합니다.' },
];

/** PhysicsTarget placements are cartons; supports are only the pallet bases, not gross units. */
export function inspectionPlacements(target: PhysicsTarget): Placement[] {
  return [...target.result.placements, ...(target.supports ?? []).map(s => ({
    cargoId: `팔레트 ${s.id}`, x: s.x, y: s.y, z: s.z,
    length: s.length, width: s.width, height: s.height, weightKg: s.weightKg,
  }))];
}

export function hasInspectionTarget(target: PhysicsTarget | undefined): target is PhysicsTarget {
  return Boolean(target && (target.result.placements.length || target.supports?.length));
}

export function runStaticInspection(target: PhysicsTarget, kind: Exclude<InspectionKind, 'inertia'>): InspectionFinding {
  if (!hasInspectionTarget(target)) throw new Error('적재 결과가 없습니다. 먼저 자동 적재를 실행하세요.');
  const placements = inspectionPlacements(target);
  const c = target.container;
  if (![c.length, c.width, c.height, c.maxPayloadKg].every(v => Number.isFinite(v) && v > 0)
    || placements.some(p => ![p.x, p.y, p.z, p.length, p.width, p.height, p.weightKg].every(Number.isFinite)
      || Math.min(p.length, p.width, p.height) <= 0 || p.weightKg < 0)) throw new Error('치수·좌표·중량 입력이 유효하지 않습니다. 입력을 확인하고 다시 적재하세요.');
  const total = placements.reduce((sum, p) => sum + p.weightKg, 0);
  if (kind === 'geometry') {
    const issues = validatePlacements(c, placements);
    return { summary: issues.length ? `경계·충돌 문제 ${issues.length}건` : '경계·충돌 문제 미발견',
      details: issues.slice(0, 50).map(i => i.message).concat(issues.length > 50 ? [`나머지 ${issues.length - 50}건은 표시 생략`] : []),
      caution: '직육면체 배치 기준입니다. 지지율·적층단·누적 상부하중·하역 접근성은 이 항목에서 검사하지 않습니다.', attention: issues.length > 0 };
  }
  if (kind === 'balance') {
    if (total <= 0) throw new Error('총중량이 0이어서 무게중심을 계산할 수 없습니다.');
    const b = assessWeightBalance(c, { ...target.result, placements, loadedWeightKg: total });
    return { summary: `무게중심 X ${b.centerOfGravity.x.toFixed(2)} · Y ${b.centerOfGravity.y.toFixed(2)} · Z ${b.centerOfGravity.z.toFixed(2)} m`,
      details: [`앞뒤 편차 ${b.longitudinalDeviationPct.toFixed(1)}%`, `좌우 편차 ${b.lateralDeviationPct.toFixed(1)}%`, `장비 높이 대비 중심 높이 ${b.verticalCenterPct.toFixed(1)}%`],
      caution: '장비 안쪽 바닥 모서리가 원점입니다. 편차는 중심 위치 지표이며 전복 한계·축하중 검사나 운송 안전 판정이 아닙니다.', attention: false };
  }
  const f = analyzeFloorLoad(c, { placements }, 12, 4);
  const limit = c.floorLoadLimitKgPerM2;
  const hasLimit = limit !== undefined && Number.isFinite(limit) && limit > 0;
  const over = total > c.maxPayloadKg + 1e-6;
  return { summary: `${total.toFixed(1)} / ${c.maxPayloadKg.toFixed(1)} kg · ${over ? '허용 적재중량 초과' : '허용 적재중량 이내'}`,
    details: [`격자 평균 ${f.averageKgPerM2.toFixed(0)} kg/m²`, `격자 최대 ${f.maxKgPerM2.toFixed(0)} kg/m²`, hasLimit ? `입력된 바닥 기준 ${limit.toFixed(0)} kg/m² · ${f.maxKgPerM2 > limit ? '추정치 초과' : '추정치 이내'}` : '바닥 허용하중 미입력 · 기준 비교 미실행'],
    caution: '각 상자·팔레트 자중을 바닥에 투영한 추정치입니다. 팔레트 발의 실제 접촉압·지지 전달하중·차량 축하중은 계산하지 않습니다.', attention: over || (hasLimit && f.maxKgPerM2 > limit) };
}
