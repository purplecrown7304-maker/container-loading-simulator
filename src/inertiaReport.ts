import type { InertiaAnimationResult } from './engine/inertiaSimulation';
import type { PhysicsScenario } from './engine/physicsValidation';
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

function assessLevel(result: InertiaAnimationResult): AssessmentLevel {
  if (result.maxHorizontalShiftM > 0.03 || result.maxTiltDeg > 4.5) return 'danger';
  if (result.maxHorizontalShiftM > 0.012 || result.maxTiltDeg > 1.8) return 'warning';
  return 'stable';
}

function levelLabel(level: AssessmentLevel) {
  return level === 'danger' ? '위험' : level === 'warning' ? '보완 권장' : '안정';
}

function mm(value: number) {
  const raw = value * 1000;
  return `${raw.toFixed(raw >= 10 ? 0 : 1)} mm`;
}

function buildEvaluation(result: InertiaAnimationResult, level: AssessmentLevel) {
  const shift = mm(result.maxHorizontalShiftM);
  const tilt = `${result.maxTiltDeg.toFixed(1)}°`;
  if (level === 'stable') return `최대 이동 ${shift}, 최대 기울기 ${tilt}로 기본 비교 시나리오에서 큰 미끄러짐·전도 징후가 확인되지 않았습니다.`;
  const issues: string[] = [];
  if (result.maxHorizontalShiftM > 0.03) issues.push(`수평 이동이 ${shift}로 위험 기준을 넘음`);
  else if (result.maxHorizontalShiftM > 0.012) issues.push(`수평 이동이 ${shift}로 재확인 범위`);
  if (result.maxTiltDeg > 4.5) issues.push(`기울기가 ${tilt}로 전도 위험 범위`);
  else if (result.maxTiltDeg > 1.8) issues.push(`기울기가 ${tilt}로 재확인 범위`);
  return issues.join(' · ') || `최대 이동 ${shift}, 최대 기울기 ${tilt}로 추가 확인이 필요합니다.`;
}

function buildRecommendations(scenario: InertiaScenario, result: InertiaAnimationResult, mode: PhysicsTarget['mode']) {
  const items: string[] = [];
  if (result.maxHorizontalShiftM > 0.012) {
    items.push('바닥·팔레트 접촉면의 미끄럼 방지 상태를 확인하고 필요 시 미끄럼방지재를 적용합니다.');
    items.push('화물 사이의 큰 빈 공간을 줄이고 빈 공간은 적절한 완충·고정재로 채워 이동 여유를 줄입니다.');
  }
  if (result.maxTiltDeg > 1.8) {
    items.push('높은 적층은 낮추고 무거운 화물을 하부에 배치해 무게중심을 낮춥니다.');
    items.push('열 또는 블록 단위의 랩핑·밴딩·결박 필요성을 검토하고 상단 돌출 적재를 줄입니다.');
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
  const level = assessLevel(result);
  return {
    scenario,
    label: info.label,
    forceLabel: info.forceLabel,
    level,
    levelLabel: levelLabel(level),
    result,
    evaluation: buildEvaluation(result, level),
    recommendations: buildRecommendations(scenario, result, mode),
  };
}

export function openInertiaImprovementReport(target: PhysicsTarget, results: InertiaResults) {
  const assessments = SCENARIOS
    .map(info => results[info.id] ? assessScenario(info.id, results[info.id]!, target.mode) : null)
    .filter((item): item is ScenarioAssessment => Boolean(item));
  if (!assessments.length) return false;

  const worst = [...assessments].sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || b.result.maxHorizontalShiftM - a.result.maxHorizontalShiftM || b.result.maxTiltDeg - a.result.maxTiltDeg)[0];
  const tested = assessments.length;
  const overallLabel = worst.level === 'danger' ? '재배치/고정 보완 후 재시험 권장' : worst.level === 'warning' ? '일부 보완 후 재시험 권장' : '기본 시나리오 안정 범위';
  const commonRecommendations = [...new Set(assessments.flatMap(item => item.recommendations))];
  const popup = window.open('', '_blank', 'width=1100,height=900');
  if (!popup) return false;
  try { popup.opener = null; } catch { /* 일부 브라우저에서는 opener 변경이 제한될 수 있음 */ }

  const scenarioRows = SCENARIOS.map(info => {
    const assessment = assessments.find(item => item.scenario === info.id);
    if (!assessment) return `<tr class="untested"><td>${info.label}</td><td>${info.forceLabel}</td><td colspan="4">미실행</td></tr>`;
    return `<tr class="${assessment.level}"><td>${assessment.label}</td><td>${assessment.forceLabel}</td><td><b>${assessment.levelLabel}</b></td><td>${mm(assessment.result.maxHorizontalShiftM)}</td><td>${assessment.result.maxTiltDeg.toFixed(1)}°</td><td>${escapeHtml(assessment.evaluation)}</td></tr>`;
  }).join('');

  const recommendationHtml = commonRecommendations.map((item, index) => `<li><b>${index + 1}</b><span>${escapeHtml(item)}</span></li>`).join('');
  const retestHtml = [
    '보완 조치 후 같은 3개 시나리오를 다시 실행해 최대 이동량과 기울기가 감소했는지 비교',
    '상자 적재는 상단 블록과 문쪽/안쪽 끝단, 팔레트 적재는 팔레트 자체 이동과 화물-팔레트 상대 이동을 함께 관찰',
    '실제 현장 포장재, 미끄럼방지재, 결박 방식, 팔레트 규격을 시뮬레이션 입력/운영 기준과 대조',
    '시뮬레이션 결과만으로 운송 안전을 확정하지 않고 회사·운송사·법규 기준으로 최종 검토',
  ].map(item => `<li>${escapeHtml(item)}</li>`).join('');

  popup.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>관성 테스트 보완 보고서</title><style>
    *{box-sizing:border-box}body{margin:0;font-family:Arial,'Noto Sans KR',sans-serif;color:#172033;background:#eef2f7}.page{max-width:1050px;margin:24px auto;padding:28px;background:#fff}.head{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #172033;padding-bottom:16px}.head h1{margin:0 0 6px;font-size:25px}.head p{margin:0;color:#64748b;font-size:12px}.badge{align-self:flex-start;padding:9px 12px;border-radius:9px;background:${worst.level === 'danger' ? '#fff1f1' : worst.level === 'warning' ? '#fff8e8' : '#effaf3'};color:${worst.level === 'danger' ? '#b42318' : worst.level === 'warning' ? '#9a6700' : '#16803c'};font-weight:800}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin:18px 0}.summary div{padding:12px;border:1px solid #dfe6ef;border-radius:9px;background:#f8fafc}.summary span{display:block;color:#64748b;font-size:10px;margin-bottom:4px}.summary b{font-size:14px}h2{font-size:16px;margin:22px 0 10px}.overall{padding:14px;border-radius:10px;background:#f4f7fb;border:1px solid #dbe3ee}.overall b{display:block;margin-bottom:5px}.overall span{font-size:12px;line-height:1.55;color:#52617a}table{width:100%;border-collapse:collapse;font-size:11px}th,td{padding:9px;border:1px solid #dfe6ef;text-align:left;vertical-align:top}th{background:#f2f5f9;color:#52617a}.stable td:nth-child(3){color:#16803c}.warning td:nth-child(3){color:#9a6700}.danger td:nth-child(3){color:#b42318}.untested{color:#94a3b8}.recommend{display:grid;grid-template-columns:1fr 1fr;gap:10px}.recommend li{list-style:none;display:grid;grid-template-columns:26px 1fr;gap:8px;padding:10px;border:1px solid #e1e7ef;border-radius:8px;font-size:11px;line-height:1.5}.recommend li b{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:#eaf2ff;color:#2563eb}.check li{margin:7px 0;font-size:11px;line-height:1.5}.notice{margin-top:18px;padding:11px;border-radius:8px;background:#fff7ed;color:#9a5b00;font-size:10px;line-height:1.55}.actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}.actions button{border:0;border-radius:8px;padding:10px 14px;font-weight:700;cursor:pointer}.actions .print{background:#2563eb;color:#fff}@media print{body{background:#fff}.page{margin:0;max-width:none;padding:12mm}.actions{display:none}}
  </style></head><body><main class="page"><section class="head"><div><h1>관성 테스트 보완 보고서</h1><p>${target.mode === 'pallets' ? 'PALLET MODE' : 'BOX MODE'} · Rapier 3D 관성 애니메이션 결과 기반</p></div><div class="badge">${overallLabel}</div></section>
  <section class="summary"><div><span>실행 시나리오</span><b>${tested} / 3</b></div><div><span>적재 화물</span><b>${target.result.placements.length} EA</b></div><div><span>팔레트</span><b>${target.supports?.length ?? 0} EA</b></div><div><span>최악 조건</span><b>${worst.label}</b></div></section>
  <h2>종합 평가</h2><div class="overall"><b>${overallLabel}</b><span>${escapeHtml(worst.evaluation)}${tested < 3 ? ' · 미실행 시나리오는 평가에 포함되지 않았습니다.' : ''}</span></div>
  <h2>시나리오별 평가</h2><table><thead><tr><th>상황</th><th>관성 조건</th><th>판정</th><th>최대 이동</th><th>최대 기울기</th><th>평가 내용</th></tr></thead><tbody>${scenarioRows}</tbody></table>
  <h2>보완할 점</h2><ol class="recommend">${recommendationHtml}</ol>
  <h2>보완 후 재시험 체크</h2><ul class="check">${retestHtml}</ul>
  <div class="notice">본 보고서는 0.30g 출발, 0.50g 급제동, 0.35g 횡가속 비교 시나리오와 시뮬레이터 내부 이동·기울기 경고 기준을 사용한 보조 평가입니다. 실제 운송 안전 판정은 차량, 노면, 화물 고정장치, 포장재 강도, 마찰계수 및 회사/법규 기준을 별도로 적용해야 합니다.</div>
  <div class="actions"><button onclick="window.close()">닫기</button><button class="print" onclick="window.print()">인쇄 / PDF 저장</button></div></main></body></html>`);
  popup.document.close();
  return true;
}
