import { buildReportDocument, reportTable, REPORT_SIGNOFF } from './reportLayout';
import type { InertiaAnimationResult } from './engine/inertiaSimulation';
import type { PhysicsScenario } from './engine/physicsValidation';
import {
  INERTIA_PASS_PALLET_CARGO_SLIP_M,
  INERTIA_PASS_SHIFT_M,
  INERTIA_PASS_SUPPORT_SHIFT_M,
  INERTIA_PASS_TILT_DEG,
} from './inertiaCertification';
import {
  WORK_ORDER_DANGER_PALLET_CARGO_SLIP_M,
  WORK_ORDER_DANGER_SHIFT_M,
  WORK_ORDER_DANGER_SUPPORT_SHIFT_M,
  WORK_ORDER_DANGER_TILT_DEG,
  isInertiaResultDangerous,
} from './inertiaWorkOrderPolicy';
import type { PhysicsTarget } from './physicsTarget';

type InertiaScenario = Exclude<PhysicsScenario, 'settle'>;
type InertiaResults = Partial<Record<InertiaScenario, InertiaAnimationResult>>;
type AssessmentLevel = 'stable' | 'warning' | 'danger';

type ScenarioAssessment = {
  scenario: InertiaScenario;
  label: string;
  forceLabel: string;
  level: AssessmentLevel;
  levelLabel: string;
  result: InertiaAnimationResult;
  evaluation: string;
  recommendations: string[];
};

const SCENARIOS: Array<{ id: InertiaScenario; label: string; forceLabel: string }> = [
  { id: 'acceleration', label: '출발 가속', forceLabel: '후방 관성 0.30g' },
  { id: 'braking', label: '급정거', forceLabel: '전방 관성 0.50g' },
  { id: 'cornering', label: '급회전', forceLabel: '측면 관성 0.35g' },
];

const LEVEL_RANK: Record<AssessmentLevel, number> = { stable: 0, warning: 1, danger: 2 };

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function assessLevel(result: InertiaAnimationResult, mode: PhysicsTarget['mode']): AssessmentLevel {
  if (isInertiaResultDangerous(result, mode)) return 'danger';
  if (result.maxHorizontalShiftM > INERTIA_PASS_SHIFT_M || result.maxTiltDeg > INERTIA_PASS_TILT_DEG) return 'warning';
  if (mode === 'pallets') {
    if ((result.maxCargoRelativeSlipM ?? 0) > INERTIA_PASS_PALLET_CARGO_SLIP_M) return 'warning';
    if ((result.maxSupportShiftM ?? 0) > INERTIA_PASS_SUPPORT_SHIFT_M) return 'warning';
  }
  return 'stable';
}

function levelLabel(level: AssessmentLevel) {
  return level === 'danger' ? '위험' : level === 'warning' ? '보완 권장' : '안정';
}

function mm(value: number) {
  const raw = value * 1000;
  return `${raw.toFixed(raw >= 10 ? 0 : 1)} mm`;
}

function buildEvaluation(result: InertiaAnimationResult, level: AssessmentLevel, mode: PhysicsTarget['mode']) {
  const shift = mm(result.maxHorizontalShiftM);
  const tilt = `${result.maxTiltDeg.toFixed(1)}°`;
  const slip = mm(result.maxCargoRelativeSlipM ?? 0);
  const support = mm(result.maxSupportShiftM ?? 0);
  if (level === 'stable') {
    return mode === 'pallets'
      ? `최대 이동 ${shift}, 최대 기울기 ${tilt}, 화물↔팔레트 ${slip}, 팔레트 이동 ${support}로 내부 PASS 범위입니다.`
      : `최대 이동 ${shift}, 최대 기울기 ${tilt}로 내부 PASS 범위입니다.`;
  }
  const issues: string[] = [];
  if (result.maxHorizontalShiftM > WORK_ORDER_DANGER_SHIFT_M) issues.push(`수평 이동 ${shift} · 위험 기준 초과`);
  else if (result.maxHorizontalShiftM > INERTIA_PASS_SHIFT_M) issues.push(`수평 이동 ${shift} · PASS 기준 초과/위험 이내`);
  if (result.maxTiltDeg > WORK_ORDER_DANGER_TILT_DEG) issues.push(`기울기 ${tilt} · 위험 기준 초과`);
  else if (result.maxTiltDeg > INERTIA_PASS_TILT_DEG) issues.push(`기울기 ${tilt} · PASS 기준 초과/위험 이내`);
  if (mode === 'pallets') {
    if ((result.maxCargoRelativeSlipM ?? 0) > WORK_ORDER_DANGER_PALLET_CARGO_SLIP_M) issues.push(`화물↔팔레트 미끄럼 ${slip} · 위험 기준 초과`);
    else if ((result.maxCargoRelativeSlipM ?? 0) > INERTIA_PASS_PALLET_CARGO_SLIP_M) issues.push(`화물↔팔레트 미끄럼 ${slip} · PASS 기준 초과/위험 이내`);
    if ((result.maxSupportShiftM ?? 0) > WORK_ORDER_DANGER_SUPPORT_SHIFT_M) issues.push(`팔레트 이동 ${support} · 위험 기준 초과`);
    else if ((result.maxSupportShiftM ?? 0) > INERTIA_PASS_SUPPORT_SHIFT_M) issues.push(`팔레트 이동 ${support} · PASS 기준 초과/위험 이내`);
  }
  return issues.join(' · ') || `최대 이동 ${shift}, 최대 기울기 ${tilt}로 추가 확인이 필요합니다.`;
}

function buildRecommendations(scenario: InertiaScenario, result: InertiaAnimationResult, mode: PhysicsTarget['mode']) {
  const items: string[] = [];
  if (result.maxHorizontalShiftM > INERTIA_PASS_SHIFT_M) {
    items.push('바닥·팔레트 접촉면의 미끄럼 방지 상태를 확인하고 필요 시 미끄럼방지재를 적용합니다.');
    items.push('화물 사이의 큰 빈 공간을 줄이고 빈 공간은 적절한 완충·고정재로 채워 이동 여유를 줄입니다.');
  }
  if (result.maxTiltDeg > INERTIA_PASS_TILT_DEG) {
    items.push('높은 적층은 낮추고 무거운 화물을 하부에 배치해 무게중심을 낮춥니다.');
    items.push('열 또는 블록 단위의 랩핑·밴딩·결박 필요성을 검토하고 상단 돌출 적재를 줄입니다.');
  }
  if (mode === 'pallets' && (result.maxCargoRelativeSlipM ?? 0) > INERTIA_PASS_PALLET_CARGO_SLIP_M) {
    items.push('화물-팔레트 상대 미끄럼이 있으므로 밴딩·랩핑·미끄럼방지재가 화물과 팔레트를 함께 구속하는지 확인합니다.');
  }
  if (mode === 'pallets' && (result.maxSupportShiftM ?? 0) > INERTIA_PASS_SUPPORT_SHIFT_M) {
    items.push('팔레트 자체 이동을 줄이도록 바닥 접촉면, 고정바와 블로킹 위치를 확인합니다.');
  }
  if (scenario === 'acceleration') {
    items.push('출발 시 후방 관성 방향으로 밀리지 않도록 길이 방향 후방 지지·블로킹 상태를 점검합니다.');
  } else if (scenario === 'braking') {
    items.push('급제동 시 전방 관성 방향으로 밀리지 않도록 앞쪽 지지·블로킹과 문쪽 끝단의 이동 여유를 점검합니다.');
  } else {
    items.push('좌우 측벽 여유를 줄이고 좌우 중량 편차 및 상단 편중을 줄여 측면 전도 가능성을 낮춥니다.');
  }
  if (mode === 'pallets') {
    items.push('팔레트-바닥 고정과 화물-팔레트 결속을 각각 분리해 확인하고, 랩핑/밴딩이 팔레트와 화물을 함께 구속하는지 점검합니다.');
  }
  if (!items.length) items.push('현재 결과를 기준선으로 저장하고 실제 포장재·마찰계수·결박 조건을 반영한 재시험으로 확인합니다.');
  return [...new Set(items)];
}

function assessScenario(scenario: InertiaScenario, result: InertiaAnimationResult, mode: PhysicsTarget['mode']): ScenarioAssessment {
  const info = SCENARIOS.find(item => item.id === scenario) ?? SCENARIOS[0];
  const level = assessLevel(result, mode);
  return {
    scenario,
    label: info.label,
    forceLabel: info.forceLabel,
    level,
    levelLabel: levelLabel(level),
    result,
    evaluation: buildEvaluation(result, level, mode),
    recommendations: buildRecommendations(scenario, result, mode),
  };
}

export function buildInertiaImprovementReportHtml(target: PhysicsTarget, results: InertiaResults) {
  const assessments = SCENARIOS
    .map(info => results[info.id] ? assessScenario(info.id, results[info.id]!, target.mode) : null)
    .filter((item): item is ScenarioAssessment => Boolean(item));
  if (!assessments.length) return null;

  const worst = [...assessments].sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || b.result.maxHorizontalShiftM - a.result.maxHorizontalShiftM || b.result.maxTiltDeg - a.result.maxTiltDeg)[0];
  const tested = assessments.length;
  const overallLabel = worst.level === 'danger'
    ? '위험 · 작업지시서 생성 불가'
    : tested < 3
      ? '검증 미완료 · 남은 시나리오 실행 필요'
      : worst.level === 'warning'
      ? '위험 아님 · 권장사항 반영 후 작업지시서 생성 가능'
      : '안정 · 작업지시서 생성 가능';
  const commonRecommendations = [...new Set(assessments.flatMap(item => item.recommendations))];
  const scenarioRows = SCENARIOS.map(info => {
    const assessment = assessments.find(item => item.scenario === info.id);
    if (!assessment) return `<tr><td>${info.label}</td><td>${info.forceLabel}</td><td><span class="report-pill neutral">미실행</span></td><td colspan="3">시나리오를 실행한 뒤 결과를 확인하세요.</td></tr>`;
    return `<tr class="${assessment.level}"><td>${assessment.label}</td><td>${assessment.forceLabel}</td><td><span class="report-pill ${assessment.level === 'stable' ? 'good' : assessment.level === 'warning' ? 'caution' : 'danger'}">${assessment.levelLabel}</span></td><td>${mm(assessment.result.maxHorizontalShiftM)}</td><td>${assessment.result.maxTiltDeg.toFixed(1)}°</td><td>${escapeHtml(assessment.evaluation)}</td></tr>`;
  }).join('');

  const recommendationHtml = commonRecommendations.map((item, index) => `<li><b>${index + 1}</b><span>${escapeHtml(item)}</span></li>`).join('');
  const retestHtml = [
    '보완 조치 후 같은 3개 시나리오를 다시 실행해 최대 이동량과 기울기가 감소했는지 비교',
    '상자 적재는 상단 블록과 문쪽/안쪽 끝단, 팔레트 적재는 팔레트 자체 이동과 화물-팔레트 상대 이동을 함께 관찰',
    '실제 현장 포장재, 미끄럼방지재, 결박 방식, 팔레트 규격을 시뮬레이션 입력/운영 기준과 대조',
    '시뮬레이션 결과만으로 운송 안전을 확정하지 않고 회사·운송사·법규 기준으로 최종 검토',
  ].map(item => `<li>${escapeHtml(item)}</li>`).join('');

  return buildReportDocument({
    title: '관성 테스트 보완 보고서',
    subtitle: `${new Date().toLocaleString('ko-KR')} · ${target.mode === 'pallets' ? 'PALLET MODE' : 'BOX MODE'} · Rapier 3D 관성 애니메이션 결과 기반`,
    status: overallLabel,
    tone: worst.level === 'danger' ? 'danger' : tested < 3 ? 'neutral' : worst.level === 'warning' ? 'caution' : 'good',
    summary: `<section class="summary" aria-label="관성 검증 요약"><div><span>실행 시나리오</span><b>${tested} / 3</b></div><div><span>적재 화물</span><b>${target.result.placements.length} EA</b></div><div><span>팔레트</span><b>${target.supports?.length ?? 0} EA</b></div><div class="text-metric"><span>실행 결과 중 최악 조건</span><b>${worst.label}</b></div></section>`,
    sections: [
      { title: '종합 평가와 보완할 점', description: '현재 판정과 우선 조치사항을 먼저 확인하세요.',
        content: `<div class="overall"><b>${overallLabel}</b><span>${escapeHtml(worst.evaluation)}${tested < 3 ? ' · 미실행 시나리오는 평가에 포함되지 않았습니다.' : ''}</span></div><h3>보완할 점</h3><ol class="recommend">${recommendationHtml}</ol>` },
      { title: '시나리오별 평가', description: '출발 가속·급정거·급회전을 모두 실행한 결과인지 확인하세요.',
        content: reportTable('관성 시나리오별 평가표', `<table><colgroup><col style="width:13%"><col style="width:16%"><col style="width:13%"><col style="width:13%"><col style="width:12%"><col style="width:33%"></colgroup><thead><tr><th scope="col">상황</th><th scope="col">관성 조건</th><th scope="col">판정</th><th scope="col">최대 이동</th><th scope="col">최대 기울기</th><th scope="col">평가 내용</th></tr></thead><tbody>${scenarioRows}</tbody></table>`) },
      { title: '보완 후 재시험 체크', description: '보완 전후 수치를 대조한 뒤 검토 담당자가 확인하세요.',
        content: `<ul class="checklist">${retestHtml}</ul>${REPORT_SIGNOFF}<p class="technical-note">작업지시서는 3개 시나리오가 모두 실행되고 위험 판정이 없을 때 생성할 수 있습니다. 보완 권장 단계는 내부 PASS 기준을 일부 초과했지만 위험 기준 이내이므로 권장사항이 작업지시서에 함께 표시됩니다. 실제 운송 안전 판정은 차량, 노면, 화물 고정장치, 포장재 강도, 마찰계수 및 회사/법규 기준을 별도로 적용해야 합니다.</p>` },
    ],
    footer: `<span>관성 검증 ${tested} / 3 실행</span><span>${target.mode === 'pallets' ? '팔레트 적재' : '박스 적재'} · 내부 비교 결과</span>`,
  });
}

export function openInertiaImprovementReport(target: PhysicsTarget, results: InertiaResults) {
  const html = buildInertiaImprovementReportHtml(target, results);
  if (!html) return false;
  const popup = window.open('', '_blank', 'width=1100,height=900');
  if (!popup) return false;
  try { popup.opener = null; } catch { /* 일부 브라우저에서는 opener 변경이 제한될 수 있음 */ }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  return true;
}
