import type { CargoItem, ContainerSpec, LoadingResult } from './types';
import type { FloorLoadAnalysis } from './floorLoad';

export type ConstraintStatus = 'pass' | 'warn' | 'fail';
export type ConstraintCheck = {
  id: 'geometry' | 'door' | 'support' | 'stack' | 'segregation' | 'unload' | 'weight' | 'balance' | 'securing';
  label: string;
  status: ConstraintStatus;
  detail: string;
};

const GROUPS: Array<{ id: ConstraintCheck['id']; label: string; codes: (code: string) => boolean }> = [
  { id: 'geometry', label: '경계 / 겹침 / 회전', codes: code => ['OUT_OF_BOUNDS','HEIGHT_EXCEEDED','LOAD_LINE_EXCEEDED','OVERLAP','ORIENTATION_NOT_ALLOWED'].includes(code) },
  { id: 'door', label: '도어 통과 / 상부 여유', codes: code => code === 'DOOR_NOT_PASSABLE' || code === 'DOOR_HEADER_CLEARANCE' },
  { id: 'support', label: '지지율 / 지지 무게중심', codes: code => ['FLOATING','INSUFFICIENT_SUPPORT','CG_OUTSIDE_SUPPORT'].includes(code) || code.startsWith('AFTER_STOP_FLOATING') || code.startsWith('AFTER_STOP_INSUFFICIENT_SUPPORT') || code.startsWith('AFTER_STOP_CG_OUTSIDE_SUPPORT') },
  { id: 'stack', label: '적층 강도 / 최대 단수', codes: code => ['NO_STACK_ON_TOP','TOP_LOAD_EXCEEDED','TIER_EXCEEDED','MUST_BE_ON_FLOOR','TOP_PRESSURE_EXCEEDED'].includes(code) },
  { id: 'segregation', label: '혼적 / 온도대', codes: code => ['INCOMPATIBLE_CARGO','MIXED_TEMP_ZONE'].includes(code) },
  { id: 'unload', label: '하역 순서', codes: code => code === 'UNLOAD_BLOCKED' || code === 'UNLOAD_BLOCKED_ABOVE' },
  { id: 'weight', label: '총중량 / 선하중 / 축하중', codes: code => code === 'PAYLOAD_EXCEEDED' || code === 'LINE_LOAD_EXCEEDED' || code.includes('AXLE') || code === 'GROSS_WEIGHT_EXCEEDED' || code === 'FRONT_AXLE_TOO_LIGHT' },
  { id: 'balance', label: '무게중심', codes: code => ['CG_LONGITUDINAL','CG_LATERAL','CG_HIGH'].includes(code) },
  { id: 'securing', label: '고정 / 전도 / 빈틈', codes: code => ['TIPPING_RISK','SECURING_FORCE','REAR_GAP','LATERAL_GAP'].includes(code) },
];

export function analyzeConstraints(
  _container: ContainerSpec,
  _cargo: CargoItem[],
  result: LoadingResult,
  _floorLoad: FloorLoadAnalysis,
): ConstraintCheck[] {
  const findings = result.operationalFindings ?? [];
  return GROUPS.map(group => {
    const relevant = findings.filter(item => group.codes(item.code));
    const errors = relevant.filter(item => item.severity === 'error');
    const warnings = relevant.filter(item => item.severity === 'warning');
    const status: ConstraintStatus = errors.length ? 'fail' : warnings.length ? 'warn' : 'pass';
    return {
      id: group.id,
      label: group.label,
      status,
      detail: errors[0]?.message ?? warnings[0]?.message ?? 'load-sim 규칙 통과',
    };
  });
}
