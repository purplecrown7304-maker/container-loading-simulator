import { buildNumberedZone3d } from './reportZone3dDimensions';
import { inspectionProgressText } from './inspectionPresentation';
import { uiText, uiMessage, uiLocale } from './uiLanguage';
import { assessPhysicsVerification } from './physicsVerificationPolicy';
import { buildLimitReviewHtml, isLimitReviewTarget, LIMIT_REVIEW_WARNING } from './limitReviewPresentation';
import { buildReportDocument, reportSignoff } from './reportLayout';
import { boxResultMatchesWorkOrderCertification } from './certifiedExport';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { confirmUnverifiedExport } from './exportVerification';
import { readLatestInertiaCertification, type InertiaCertification } from './inertiaCertification';
import {
  assessWorkOrderCertification,
  buildWorkOrderRecommendations,
  canCreateWorkOrder,
  isPhysicsTargetVerified,
  physicsTargetHardFailureReasons,
  workOrderTargetApprovalLabel,
} from './inertiaWorkOrderPolicy';
import { readPhysicsTarget } from './physicsTarget';
import { requestDirectWorkOrder } from './directWorkOrderEvents';
import { buildShipmentInstructionSection } from './shipmentInstruction';
import { readTransportEquipment } from './transportEquipment';
import { equipmentDisplayText } from './transportEquipmentPresentation';
import { buildReportZones } from './reportZones';
import { buildZoneOverview, buildZoneTable, buildReportLegend, buildPartialLocations, buildSecuringLocationGuide, buildNumberedZonePlans, buildZone3dInstructions } from './reportZoneGraphics';
import { reportCargoCatalog } from './reportCargo';
import { buildWorkOrderCargoSummary, loadedCargoCounts } from './workOrderCargoSummary';
import { VOID_FILL_DISCLAIMER, voidFillRows, voidFillTotal } from './voidFillPresentation';
import { buildFieldChecklistHtml } from './reportFieldChecklist';
import { INERTIA_SCENARIO_ACCELERATION_G } from './engine/inertiaSimulation';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function matchingBoxCertification(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult): InertiaCertification | undefined {
  const target = readPhysicsTarget();
  const certification = readLatestInertiaCertification();
  return boxResultMatchesWorkOrderCertification({ container, cargo, result }, target, certification) ? certification : undefined;
}

export function buildLoadingReportHtml(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult): string {
  const certification = matchingBoxCertification(container, cargo, result);
  const securing = certification?.securing;
  const reportTarget = { mode: 'boxes' as const, container, cargo, result };
  const hardFailures = physicsTargetHardFailureReasons(reportTarget);
  const physicsState = assessPhysicsVerification(reportTarget, certification);
  const inertiaApproval = certification ? assessWorkOrderCertification(certification) : 'incomplete';
  const approval = hardFailures.length || physicsState.status === 'failed' || inertiaApproval === 'danger' ? 'danger'
    : physicsState.status !== 'passed' ? 'incomplete' : inertiaApproval;
  const review = isLimitReviewTarget(reportTarget);
  const approvalLabel = certification ? workOrderTargetApprovalLabel(reportTarget, certification) : review ? uiText(LIMIT_REVIEW_WARNING) : hardFailures.length ? uiText("적재 제약 실패") : uiText("확인 필요");
  // Use this document's matching certification, never another live result's PASS.
  const physicsVerified = isPhysicsTargetVerified(reportTarget, certification);
  const physicsComplete = physicsState.status === 'passed' || physicsState.status === 'failed';
  const equipment = readTransportEquipment();
  const equipmentKind = equipment.category === 'truck' ? uiText("트럭") : uiText("컨테이너");
  const title = uiText("{0} 통합 출하·적재 작업지시서", [equipmentKind]);
  const zones = buildReportZones(result.placements);
  const overview = buildZoneOverview(container, cargo, result.placements, zones);
  const zoneTable = buildZoneTable(cargo, result.placements, zones);
  const legend = buildReportLegend(cargo, result.placements);
  const layerPlans = buildNumberedZonePlans(container, cargo, result.placements, zones);
  const completed = buildNumberedZone3d(container, cargo, result.placements, zones);
  const partials = buildPartialLocations(cargo, result.placements, zones);
  const progress = zones.map(zone => `<article><h3>${uiText("{0} {1} 구역 · {2}개", [zone.number, zone.label, zone.indices.length])}</h3>${buildNumberedZone3d(container, cargo, result.placements, zones, zone.number)}${buildZone3dInstructions(cargo, result.placements, zone)}<p class="zone-3d-reference">${uiText("{0}개 · {1}단 · 높이 {2} mm", [zone.indices.length, zone.levels.length, Math.round(zone.height * 1000)])}</p></article>`).join('');
  const generatedAt = new Date().toLocaleString(uiLocale());
  const cargoIntake = buildWorkOrderCargoSummary(cargo, loadedCargoCounts(result.placements), reportCargoCatalog(cargo));
  const shipmentInstruction = buildShipmentInstructionSection(cargo, result);
  const voidRows = voidFillRows(result);
  const voidTotal = voidFillTotal(result);
  const voidFillTable = voidRows.length ? `<div class="section-title"><h3>${uiText("메움재 상세")}</h3><span>${uiText("총 {0} EA · {1} kg", [voidTotal.quantity, voidTotal.weightKg.toFixed(2)])}</span></div><div class="report-table-scroll"><table><thead><tr><th>${uiText("유형")}</th><th>${uiText("자재")}</th><th>${uiText("수량")}</th><th>${uiText("중량")}</th><th>${uiText("위치 X/Y/Z")}</th><th>${uiText("크기 L/W/H")}</th><th>${uiText("적용")}</th></tr></thead><tbody>${voidRows.map(row => `<tr><td>${escapeHtml(uiText(row.gapType))}</td><td>${escapeHtml(uiText(row.material))}</td><td>${row.quantity} EA</td><td>${row.weightKg.toFixed(2)} kg</td><td>${row.xM}/${row.yM}/${row.zM} m</td><td>${row.lengthM}/${row.widthM}/${row.heightM} m</td><td>${row.fixedSupportEligible === 'Y' ? uiText("계획 적용") : uiText("범위 밖 · 미확정")}</td></tr>`).join('')}</tbody></table></div><p class="technical-note">${escapeHtml(uiText(VOID_FILL_DISCLAIMER))}</p>` : '';

  const materialItems: Array<[string, string]> = [];
  if (securing) {
    if (securing.antiSlipMats > 0) materialItems.push([uiText("미끄럼방지재"), `${securing.antiSlipMats} EA`]);
    if (securing.dunnageBlocks > 0) materialItems.push([uiText("블로킹재"), `${securing.dunnageBlocks} EA`]);
    if (securing.loadBars > 0) materialItems.push([uiText("고정바"), `${securing.loadBars} EA`]);
    if (securing.bandingStraps > 0) materialItems.push([uiText("밴딩"), uiText("{0} 줄 / {1} m", [securing.bandingStraps, securing.bandingLengthM.toFixed(1)])]);
    if (securing.cornerGuards > 0) materialItems.push([uiText("각대"), `${securing.cornerGuards} EA / ${securing.cornerGuardLengthM.toFixed(1)} m`]);
    if (securing.wrappingLengthM > 0) materialItems.push([uiText("랩핑"), `${securing.wrappingLengthM.toFixed(0)} m`]);
  }
  const materialCards = materialItems.length
    ? materialItems.map(([name, value]) => `<div><span>${escapeHtml(name)}</span><b>${escapeHtml(value)}</b><i>${uiText("□ 설치 확인")}</i></div>`).join('')
    : `<div><span>${uiText("추가 보강재")}</span><b>${securing ? uiText("없음") : uiText("미확인")}</b><i>${securing ? uiText("기본 적재안") : uiText("보강 계획을 확인하세요")}</i></div>`;

  const recommendations = hardFailures.length ? [uiText("적재 제약 위반이 있어 출고할 수 없습니다. 이 문서는 검토용입니다."), ...hardFailures] : certification
    ? [...physicsState.reasons, ...buildWorkOrderRecommendations(certification)]
    : [uiText("관성 3종 검증을 완료하고 위험 여부를 확인한 뒤 작업을 진행하세요.")];
  const actions = [
    approval === 'danger' ? uiText("위험 기준을 초과했습니다. 출고 전 재배치·고정 보강 후 책임자의 확인을 받으세요.")
      : approval === 'incomplete' ? uiText("출발·제동·회전 검증을 완료하고 미확인 항목을 책임자와 점검하세요.")
      : uiText("설치 영역 안내에 따라 미끄럼방지재·블로킹·고정바를 대조하고 흔들림을 확인하세요."),
    uiText("잔량박스의 구역·높이와 출하 수량을 맞추고, 상단 빈 칸·측벽·끝단 유격을 보강하세요."),
    uiText("포장 강도·장비 제원·결박장치 정격과 문 닫힘 간섭을 확인하고 담당자가 서명하세요."),
  ];
  const recommendationItems = actions.map((item, index) => `<li><b>${index + 1}</b><span>${escapeHtml(uiMessage(item))}</span></li>`).join('');


  const remainingText = result.remaining.length
    ? result.remaining.map(item => `${item.cargoId} ${item.quantity}EA`).join(' · ')
    : uiText("없음");
  const openingCheck = equipment.geometry === 'platform' || equipment.geometry === 'flat-rack'
    ? uiText("□ 장비 끝단·결박점 간섭 없음")
    : equipment.geometry === 'open-top'
      ? uiText("□ 도어/상부 개방부 간섭 없음")
      : uiText("□ 도어 닫힘 간섭 없음");
  return buildReportDocument({
    title,
    shipmentFields: true, compact: true,
    subtitle: uiText("{0} · 출하지시 수량과 실제 적재 결과를 대조하는 현장 작업용 문서", [generatedAt]),
    status: uiText("{0}출고 전 확인 {1}건{2}", [review ? uiText("WHAT-IF REVIEW · 출고 승인 아님 · ") : '', actions.length, approval === 'danger' ? uiText(" · 위험") : approval === 'incomplete' ? uiText(" · 검증 미완료") : '']),
    tone: review && approval !== 'danger' ? 'caution' : approval === 'caution' ? 'caution' : approval === 'danger' ? 'danger' : approval === 'incomplete' ? 'neutral' : 'good',
    watermark: review ? uiText("WHAT-IF REVIEW · 출고 승인 아님") : physicsVerified ? undefined : uiText("검토용 · 검증 확인 필요"),
    summary: `${buildLimitReviewHtml(reportTarget, certification)}<section class="summary" aria-label="${uiText("적재 요약")}"><div class="text-metric"><span>${uiText("운송 장비")}</span><b>${escapeHtml(equipmentDisplayText(equipment, 'shortName'))}</b><small>${container.length} × ${container.width} × ${container.height} m</small></div><div><span>${uiText("실제 적재단위")}</span><b>${result.placements.length} EA</b></div><div><span>${uiText("화물 중량")}</span><b>${result.loadedWeightKg.toLocaleString()} kg</b></div><div class="text-metric"><span>${uiText("미적재 · 별도 확인")}</span><b>${escapeHtml(remainingText)}</b></div></section>`,
    sections: [
      {
        title: uiText("한눈에 보는 적재 배치"), description: uiText("구역 순서와 그림 번호를 따라 열·행·단별 수량을 놓으세요. 각 구역은 낮은 단부터 작업합니다."),
        content: `${overview}${legend}<h3>${uiText("구역별 작업 순서")}</h3>${zoneTable}<p class="zone-caption">${uiText("길이·폭·높이는 놓을 방향을 확인하는 보조 치수입니다. 열·행 범위는 같은 규격의 실제 박스가 빠짐없이 있는 경우에만 묶습니다.")}</p>`,
      },
      {
        title: uiText("3D 완료 모습과 구역별 진행"), description: uiText("회색은 이미 쌓은 구역, 품목 색은 이번 구역입니다. 빈 공간과 빨간 테두리 잔량박스를 대조하세요."),
        content: `<div class="zone-completed">${completed}</div><div class="zone-progress">${progress}</div>`,
      },
      {
        title: uiText("단별 배치 상세"), description: uiText("작업표와 같은 그림 번호·열·행·단입니다. 팔레트 없이 직접 싣는 박스의 위치를 표시합니다."),
        content: `${partials}<div class="zone-layer-plans">${layerPlans}</div>`,
      },
      {
        title: uiText("출하 수량과 보조자재"), description: uiText("품목별 수량과 준비 자재를 대조하고 설치 대상 영역을 확인하세요."),
        content: `${shipmentInstruction}${cargoIntake}<div class="section-title"><h3>${uiText("필요 보조자재")}</h3><span>${escapeHtml(securing ? uiText(securing.levelLabel) : uiText("보조 고정 미확인"))}</span></div><section class="materials">${materialCards}</section>${buildSecuringLocationGuide(container, result.placements, securing)}${voidFillTable}`,
      },
      {
        title: uiText("현장 작업 체크리스트"), description: uiText("계산으로 확인할 수 없는 현장 항목입니다. 작업자가 직접 확인하고 표시하세요."),
        content: buildFieldChecklistHtml(equipment.category),
      },
      {
        title: uiText("출고 전 최종 확인"), description: uiText("아래 3개 작업을 확인한 뒤 담당자가 서명하세요."),
        content: `<ol class="recommendations">${recommendationItems}</ol><div class="final-check"><div>${openingCheck}</div><div>${uiText("□ 흔들림/빈 공간 보강 확인")}</div><div>${uiText("□ 출하지시 수량과 실물 수량 일치")}</div></div>${reportSignoff()}<aside class="technical-note"><b>${uiText("검증 판정: {0}", [escapeHtml(inspectionProgressText(approvalLabel))])}</b><p>${recommendations.map(item => escapeHtml(uiMessage(item))).join('<br>')}</p><p>${uiText("관성 판정은 시뮬레이터 내부 비교 결과이며 실제 운송 안전 인증을 의미하지 않습니다. ‘주의 · 검토용’은 내부 PASS 기준 일부 초과·위험 기준 이내인 결과이며 출고 승인을 의미하지 않습니다. 장비 기준: {0}.", [escapeHtml(equipmentDisplayText(equipment, 'sourceLabel'))])}</p></aside>`,
      },
    ],
    footer: `<span>${uiText("장비: {0}", [escapeHtml(equipmentDisplayText(equipment, 'shortName'))])}</span><span>${uiText("관성 검증 조건: 출발 {0}g · 제동 {1}g · 회전 {2}g (앱 내부 비교 기준)", [INERTIA_SCENARIO_ACCELERATION_G.acceleration.toFixed(2), INERTIA_SCENARIO_ACCELERATION_G.braking.toFixed(2), INERTIA_SCENARIO_ACCELERATION_G.cornering.toFixed(2)])}</span><span>${uiText("물리검증: {0}", [physicsVerified ? uiText("완료 · PASS") : physicsComplete ? uiText("검사 완료 · 미통과") : uiText("미완료")])}</span><span>${uiText("관성 최종검증: {0}", [escapeHtml(inspectionProgressText(approvalLabel))])}</span><span>${uiText("보조재 추정중량: {0}", [securing ? `${securing.estimatedAddedWeightKg.toFixed(1)} kg` : '0 kg'])}</span>`,
  });
}

export function openLoadingReport(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult): boolean {
  const inertiaCertification = matchingBoxCertification(container, cargo, result);
  if (!inertiaCertification || !canCreateWorkOrder(inertiaCertification)) {
    requestDirectWorkOrder(container, cargo, result);
    return true;
  }
  if (!confirmUnverifiedExport(uiText("통합 출하·적재 작업지시서"))) return true;
  const popup = window.open('', '_blank');
  if (!popup) return false;
  try { popup.opener = null; } catch { /* 일부 브라우저는 opener 변경을 제한할 수 있음 */ }
  popup.document.open();
  popup.document.write(buildLoadingReportHtml(container, cargo, result));
  popup.document.close();
  return true;
}
