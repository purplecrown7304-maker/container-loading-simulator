import type { CargoItem, ContainerSpec, LoadingResult } from './types';
import type { FloorLoadAnalysis } from './floorLoad';
import { validateExistingWithLoadSim } from '../rule-engine/loadSimEngine';

export type ConstraintStatus = 'pass' | 'warn' | 'fail';
export type ConstraintCheck = { id: 'payload' | 'bounds' | 'height' | 'stack' | 'topLoad' | 'floorLoad' | 'door' | 'doorSpace' | 'support' | 'cg' | 'unload' | 'segregation' | 'axle'; label: string; status: ConstraintStatus; detail: string };

/** UI categories are derived from the same A validation, never a second set of B thresholds. */
export function analyzeConstraints(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult, floorLoad: FloorLoadAnalysis): ConstraintCheck[] {
  const source = result.ruleEngineInput;
  const checked = validateExistingWithLoadSim(container, source?.cargo ?? cargo, source?.placements ?? result.placements);
  const findings = checked.operationalFindings;
  const check = (id: ConstraintCheck['id'], label: string, codes: string[], detail = 'A 입력 규칙 기준 통과'): ConstraintCheck => {
    const matches = findings.filter(v => codes.includes(v.code) || codes.some(code => v.code === `AFTER_STOP_${code}`));
    return { id, label, status: matches.some(v => v.severity === 'error') ? 'fail' : matches.length ? 'warn' : 'pass', detail: matches.length ? matches.map(v => v.message).join(' · ') : detail };
  };
  return [
    check('payload', 'A 적재중량', ['PAYLOAD_EXCEEDED'], `${result.loadedWeightKg.toLocaleString()} / ${container.maxPayloadKg.toLocaleString()} kg`),
    check('bounds', 'A 경계·충돌·방향', ['OUT_OF_BOUNDS','OVERLAP','ORIENTATION_NOT_ALLOWED','INPUT_INVALID_CARGO','INPUT_QUANTITY']),
    check('height', 'A 높이·한계선', ['HEIGHT_EXCEEDED','LOAD_LINE_EXCEEDED']),
    check('support', 'A 지지·무게중심 지지', ['FLOATING','INSUFFICIENT_SUPPORT','CG_OUTSIDE_SUPPORT']),
    check('stack', 'A 최대 위치 단수', ['TIER_EXCEEDED','MUST_BE_ON_FLOOR']),
    check('topLoad', 'A 전달 하중·면압', ['TOP_LOAD_EXCEEDED','NO_STACK_ON_TOP','TOP_PRESSURE_EXCEEDED']),
    container.floorLineLoadKgPerM != null
      ? check('floorLoad', 'A 바닥 선하중', ['LINE_LOAD_EXCEEDED'], `${container.floorLineLoadKgPerM} kg/m 한도`)
      : { id: 'floorLoad', label: 'A 바닥 선하중', status: 'warn', detail: `kg/m 입력 없음 · 검사 생략. ${floorLoad.maxKgPerM2.toFixed(0)} kg/m² 표시는 다른 물리량이며 대체 한도가 아닙니다.` },
    check('door', 'A 도어·지게차 여유', ['DOOR_NOT_PASSABLE','DOOR_HEADER_CLEARANCE']),
    check('doorSpace', 'A 고정·빈 공간', ['REAR_GAP','LATERAL_GAP','TIPPING_RISK']),
    check('cg', 'A 전체 무게중심', ['CG_LONGITUDINAL','CG_LATERAL','CG_HIGH']),
    check('unload', 'A 하역 순서', ['UNLOAD_BLOCKED','UNLOAD_BLOCKED_ABOVE']),
    check('segregation', 'A 혼적·온도', ['INCOMPATIBLE_CARGO','MIXED_TEMP_ZONE']),
    container.axles
      ? check('axle', 'A 입력 축하중', ['FRONT_AXLE_OVERLOAD','REAR_AXLE_OVERLOAD','GROSS_WEIGHT_EXCEEDED','FRONT_AXLE_TOO_LIGHT'], '입력 모델 기준 계산 · 실제 차량 제원 검증과 별도')
      : { id: 'axle', label: 'A 입력 축하중', status: 'warn', detail: '실차 축 제원 입력 없음 · 축하중 검사 생략. 예제 축값은 자동 적용하지 않습니다.' },
  ];
}
