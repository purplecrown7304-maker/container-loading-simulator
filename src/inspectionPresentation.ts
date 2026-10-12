import { uiMessage, uiText, readUiLanguage } from './uiLanguage';

/** Presentation-only adapter for known engine diagnostics. It never runs on cargo names,
 * IDs or input fields, and leaves all captured numeric/user values unchanged. */
export function inspectionDiagnosticText(text: string): string {
  if (readUiLanguage() === 'ko') return text;
  const physicsReasons = /^(최종 보강 물리검증에서 불안정 화물\/지지대 (?:\d+|상세)건이 감지되었습니다\.) (최종 보강 물리검증에서 잔류 움직임이 감지되었습니다\.)$/.exec(text);
  if (physicsReasons) return physicsReasons.slice(1).map(reason => uiMessage(reason)).join(' ');
  const scenario = /^(출발 0\.30g|급제동 0\.50g|급회전 0\.35g) · ([\d.]+)초 · 최대 수평 이동 ([\d.]+) mm · 최대 기울기 ([\d.]+)°$/.exec(text);
  if (scenario) return uiText('{0} · {1}초 · 최대 수평 이동 {2} mm · 최대 기울기 {3}°', [uiText(scenario[1]), scenario[2], scenario[3], scenario[4]]);
  const caution = /^결속 계산 조건: (.+)\. 기존 Rapier 강체·마찰·결속 모델의 계산값입니다\. 실측 도로·포장 변형·고박 시공 상태를 보증하지 않으며 실제 운송 안전 인증이 아닙니다\.$/.exec(text);
  if (caution) return uiText('{0}. 기존 Rapier 강체·마찰·결속 모델의 계산값입니다. 실측 도로·포장 변형·고박 시공 상태를 보증하지 않으며 실제 운송 안전 인증이 아닙니다.', [uiText('결속 계산 조건: ') + uiText(caution[1])]);
  return uiMessage(text);
}

/** Physics reason fields consist only of engine-generated metrics and fixed separators. */
export function physicsReasonText(text: string): string {
  return text.split(' · ').map(part => uiMessage(part)).join(' · ');
}

/** Optimizer labels are fixed engine-generated descriptions, never cargo names or IDs. */
export function inspectionProgressText(text: string): string {
  if (readUiLanguage() === 'ko') return text;
  const exact = uiText(text);
  if (exact !== text) return exact;
  return text.split(' · ').map(part => {
    const approval = /^작업지시서 (PASS|주의|위험|검증 미완료|적재 제약 실패|물리검증 실패|물리검증 미완료)$/.exec(part);
    if (approval) return uiText('작업지시서 {0}', [uiText(approval[1])]);
    return uiMessage(part);
  }).join(' · ');
}
