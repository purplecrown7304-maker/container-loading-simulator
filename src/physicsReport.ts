import { physicsReasonText } from './inspectionPresentation';
import { uiText as uiT, readUiLanguage } from './uiLanguage';
import { buildLimitReviewHtml, isLimitReviewTarget, LIMIT_REVIEW_WARNING } from './limitReviewPresentation';
import type { PhysicsScenario, PhysicsValidationSuite } from './engine/physicsValidation';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { buildReportDocument, reportEscape as escapeHtml, reportTable, reportSignoff } from './reportLayout';

const scenarioLabel = (scenario: PhysicsScenario) => scenario === 'settle' ? uiT("정적 중력") : scenario === 'acceleration' ? uiT("출발 가속 0.3g") : scenario === 'braking' ? uiT("급제동 0.5g") : uiT("횡가속 0.35g");
const mm = (value: number) => `${(value * 1000).toFixed(value * 1000 >= 10 ? 0 : 1)} mm`;
const severityBadge = (severity: string) => `<span class="report-pill ${severity === 'unstable' ? 'danger' : 'caution'}">${severity === 'unstable' ? uiT("불안정") : uiT("주의")}</span>`;

export function buildPhysicsReportHtml(container: ContainerSpec, cargo: CargoItem[], loading: LoadingResult, physics: PhysicsValidationSuite) {
  const target = { container, cargo, result: loading };
  const review = isLimitReviewTarget(target);
  const cargoMap = new Map(cargo.map(item => [item.id, item]));
  const issues = physics.placements.filter(item => item.severity !== 'stable').sort((a, b) => Number(b.severity === 'unstable') - Number(a.severity === 'unstable'));
  const supportIssues = physics.supports.filter(item => item.severity !== 'stable').sort((a, b) => Number(b.severity === 'unstable') - Number(a.severity === 'unstable'));
  const unstable = physics.unstableCount + physics.supportUnstableCount;
  const warning = physics.warningCount + physics.supportWarningCount;
  const status = unstable > 0 ? uiT("불안정 위치 확인 필요") : warning > 0 ? uiT("주의 위치 확인 필요") : uiT("주의·불안정 항목 없음");
  const scenarioRows = physics.scenarios.map(row => `<tr><td><b>${scenarioLabel(row.scenario)}</b></td><td>${row.score}/100</td><td>${uiT("안정")} ${row.stableCount}<br>${uiT("주의")} ${row.warningCount} ${uiT("· 불안정")} ${row.unstableCount}</td><td>${uiT("안정")} ${row.supportStableCount}<br>${uiT("주의")} ${row.supportWarningCount} ${uiT("· 불안정")} ${row.supportUnstableCount}</td><td>${mm(row.maxHorizontalShiftM)}</td><td>${row.maxTiltDeg.toFixed(1)}°</td></tr>`).join('');
  const issueRows = issues.map(item => {
    const placement = loading.placements[item.index];
    const spec = cargoMap.get(item.cargoId);
    return `<tr><td><b>#${item.index + 1} · ${escapeHtml(item.cargoId)}</b><small>${escapeHtml(spec?.name ?? item.cargoId)}</small><small>XYZ(m) ${placement ? `${placement.x.toFixed(2)}, ${placement.y.toFixed(2)}, ${placement.z.toFixed(2)}` : '-'}</small></td><td>${severityBadge(item.severity)}</td><td>${uiT("수평")} ${mm(item.horizontalShiftM)}<br>${uiT("높이")} ${mm(Math.abs(item.verticalShiftM))}<br>${uiT("기울기")} ${item.tiltDeg.toFixed(1)}°</td><td>${escapeHtml(physicsReasonText(item.reason))}</td><td class="check">□</td></tr>`;
  }).join('');
  const supportRows = supportIssues.map(item => `<tr><td><b>${escapeHtml(item.id)}</b></td><td>${severityBadge(item.severity)}</td><td>${uiT("수평")} ${mm(item.horizontalShiftM)}<br>${uiT("높이")} ${mm(Math.abs(item.verticalShiftM))}<br>${uiT("기울기")} ${item.tiltDeg.toFixed(1)}°</td><td>${escapeHtml(physicsReasonText(item.reason))}</td><td class="check">□</td></tr>`).join('');
  const issueTable = (rows: string, label: string) => reportTable(label, `<table><colgroup><col style="width:27%"><col style="width:12%"><col style="width:22%"><col style="width:31%"><col style="width:8%"></colgroup><thead><tr><th scope="col">${uiT("재확인 위치")}</th><th scope="col">${uiT("판정")}</th><th scope="col">${uiT("측정값")}</th><th scope="col">${uiT("확인 사유")}</th><th scope="col">${uiT("확인")}</th></tr></thead><tbody>${rows}</tbody></table>`);

  return buildReportDocument({
    title: uiT("컨테이너 물리 안정성 검증 리포트"),
    subtitle: uiT("{0} · 정적 중력 / 급제동 / 횡가속 종합검증", [new Date().toLocaleString({ ko: 'ko-KR', en: 'en-US', vi: 'vi-VN' }[readUiLanguage()])]),
    watermark: review ? uiT("WHAT-IF REVIEW · 출고 승인 아님") : undefined,
    status: review ? `${uiT(LIMIT_REVIEW_WARNING)} · ${status}` : status, tone: unstable > 0 ? 'danger' : warning > 0 || review ? 'caution' : 'good',
    summary: `${buildLimitReviewHtml(target)}<section class="summary" aria-label="${uiT("물리 검증 요약")}"><div><span>${uiT("종합점수")}</span><b>${physics.score}/100</b></div><div><span>${uiT("불안정 박스 / 팔레트")}</span><b>${physics.unstableCount} / ${physics.supportUnstableCount}</b></div><div><span>${uiT("주의 박스 / 팔레트")}</span><b>${physics.warningCount} / ${physics.supportWarningCount}</b></div><div class="text-metric"><span>${uiT("최악 조건")}</span><b>${scenarioLabel(physics.worstScenario)}</b></div></section>`,
    sections: [
      { title: uiT("우선 재확인 위치"), description: uiT("불안정 항목을 먼저 표시합니다. 사유와 위치를 대조하고 조치 후 확인 칸에 표시하세요."),
        content: `<h3>${uiT("박스 재확인 위치 ·")} ${issues.length}${uiT("건")}</h3>${issues.length ? issueTable(issueRows, uiT("박스 재확인 위치 표")) : `<p class="empty-state">${uiT("주의 또는 불안정 박스가 없습니다.")}</p>`}${physics.supports.length ? `<h3>${uiT("팔레트/지지체 재확인 ·")} ${supportIssues.length}${uiT("건")}</h3>${supportIssues.length ? issueTable(supportRows, uiT("팔레트 지지체 재확인 표")) : `<p class="empty-state">${uiT("주의 또는 불안정 팔레트가 없습니다.")}</p>`}` : ''}` },
      { title: uiT("시나리오별 결과"), description: uiT("점수와 함께 주의·불안정 개수, 최대 이동량, 기울기를 비교하세요."),
        content: `${reportTable(uiT("시나리오별 물리 검증 결과"), `<table><colgroup><col style="width:17%"><col style="width:11%"><col style="width:23%"><col style="width:23%"><col style="width:14%"><col style="width:12%"></colgroup><thead><tr><th scope="col">${uiT("조건")}</th><th scope="col">${uiT("점수")}</th><th scope="col">${uiT("박스 판정")}</th><th scope="col">${uiT("팔레트 판정")}</th><th scope="col">${uiT("최대 수평 이동")}</th><th scope="col">${uiT("최대 기울기")}</th></tr></thead><tbody>${scenarioRows}</tbody></table>`)}<p class="note">${uiT("높이 변화는 위·아래 이동의 절댓값입니다. XYZ는 적재안의 배치 좌표(m)이며, 박스 번호는 적재 결과의 개별 배치 번호입니다.")}</p>` },
      { title: uiT("검증 대상 및 최종 확인"), description: uiT("실제 장비와 포장·고정 조건을 대조하고, 보완한 적재안은 다시 검증하세요."),
        content: `<section class="summary"><div><span>${uiT("적재 박스")}</span><b>${loading.placements.length.toLocaleString()} EA</b></div><div><span>${uiT("팔레트/지지체")}</span><b>${physics.supports.length.toLocaleString()} EA</b></div><div><span>${uiT("적재중량")}</span><b>${loading.loadedWeightKg.toLocaleString()} kg</b></div><div class="text-metric"><span>${uiT("장비 내부 규격")}</span><b>${container.length} × ${container.width} × ${container.height} m</b></div></section><ul class="checklist"><li>${uiT("표시된 박스와 팔레트의 재확인 위치를 현장 배치와 대조")}</li><li>${uiT("실제 포장 강도·마찰·고정장치 조건을 확인")}</li><li>${uiT("재배치 또는 보강 후 같은 조건으로 재검증")}</li></ul>${reportSignoff()}<p class="technical-note">${uiT("본 결과는 적재안 비교와 위험 위치 탐색을 위한 보조 시뮬레이션입니다. 실제 운송 안전 판정에는 박스 압축강도, 팔레트/고정장치, 실제 마찰계수, 차량 가감속, 진동, 도로조건 및 관련 법규·사내 기준을 별도로 적용해야 합니다.")}</p>` },
    ],
    footer: `<span>Rapier 3D deterministic</span><span>${uiT("최대 수평 이동")} ${mm(physics.maxHorizontalShiftM)} ${uiT("· 최대 기울기")} ${physics.maxTiltDeg.toFixed(1)}°</span><span>${uiT("장비 최대 적재중량")} ${container.maxPayloadKg.toLocaleString()} kg</span>`,
  });
}

export function openPhysicsReport(container: ContainerSpec, cargo: CargoItem[], loading: LoadingResult, physics: PhysicsValidationSuite) {
  const popup = window.open('', '_blank');
  if (!popup) return false;
  try { popup.opener = null; } catch { /* 일부 브라우저는 opener 변경을 제한할 수 있음 */ }
  popup.document.open(); popup.document.write(buildPhysicsReportHtml(container, cargo, loading, physics)); popup.document.close();
  return true;
}
