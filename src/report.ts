import { buildLimitReviewHtml, isLimitReviewTarget, LIMIT_REVIEW_WARNING } from './limitReviewPresentation';
import { buildReportDocument, REPORT_SIGNOFF } from './reportLayout';
import { boxResultMatchesWorkOrderCertification } from './certifiedExport';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { confirmUnverifiedExport } from './exportVerification';
import { readLatestInertiaCertification, type InertiaCertification } from './inertiaCertification';
import {
  assessWorkOrderCertification,
  buildWorkOrderRecommendations,
  canCreateWorkOrder,
  isInertiaCertificationComplete,
  isPhysicsTargetVerified,
  physicsTargetHardFailureReasons,
  workOrderTargetApprovalLabel,
} from './inertiaWorkOrderPolicy';
import { readPhysicsTarget } from './physicsTarget';
import { requestDirectWorkOrder } from './directWorkOrderEvents';
import { buildShipmentInstructionSection } from './shipmentInstruction';
import { readTransportEquipment } from './transportEquipment';
import { buildReportZones } from './reportZones';
import { buildZoneOverview, buildZoneTable, buildReportLegend, buildZone3d, buildPartialLocations, buildSecuringLocationGuide } from './reportZoneGraphics';
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
  const approval = hardFailures.length ? 'danger' : certification ? assessWorkOrderCertification(certification) : 'incomplete';
  const review = isLimitReviewTarget(reportTarget);
  const approvalLabel = certification ? workOrderTargetApprovalLabel(reportTarget, certification) : review ? LIMIT_REVIEW_WARNING : hardFailures.length ? '적재 제약 실패' : '확인 필요';
  // Use this document's matching certification, never another live result's PASS.
  const physicsVerified = isPhysicsTargetVerified(reportTarget, certification);
  const physicsComplete = Boolean(certification && isInertiaCertificationComplete(certification));
  const equipment = readTransportEquipment();
  const equipmentKind = equipment.category === 'truck' ? '트럭' : '컨테이너';
  const title = `${equipmentKind} 통합 출하·적재 작업지시서`;
  const zones = buildReportZones(result.placements);
  const overview = buildZoneOverview(container, cargo, result.placements, zones);
  const zoneTable = buildZoneTable(cargo, result.placements, zones);
  const legend = buildReportLegend(cargo, result.placements);
  const layerPlans = [...new Set(result.placements.map(p => Math.round(p.z * 100000) / 100000))].sort((a, b) => a - b).map(z => `<article><h3>바닥 +${Math.round(z * 1000)} mm · 단별 평면 배치</h3>${buildZoneOverview(container, cargo, result.placements, zones, z)}</article>`).join('');
  const completed = buildZone3d(container, cargo, result.placements, zones);
  const partials = buildPartialLocations(cargo, result.placements, zones);
  const progress = zones.map(zone => `<article><h3>${zone.number} ${zone.label} 구역 · ${zone.start.toFixed(2)} ~ ${zone.end.toFixed(2)} m</h3>${buildZone3d(container, cargo, result.placements, zones, zone.number)}<p>${zone.indices.length}개 · ${zone.levels.length}단 · 높이 ${Math.round(zone.height * 1000)} mm</p></article>`).join('');
  const generatedAt = new Date().toLocaleString('ko-KR');
  const cargoIntake = buildWorkOrderCargoSummary(cargo, loadedCargoCounts(result.placements), reportCargoCatalog(cargo));
  const shipmentInstruction = buildShipmentInstructionSection(cargo, result);
  const voidRows = voidFillRows(result);
  const voidTotal = voidFillTotal(result);
  const voidFillTable = voidRows.length ? `<div class="section-title"><h3>메움재 상세</h3><span>총 ${voidTotal.quantity} EA · ${voidTotal.weightKg.toFixed(2)} kg</span></div><div class="report-table-scroll"><table><thead><tr><th>유형</th><th>자재</th><th>수량</th><th>중량</th><th>위치 X/Y/Z</th><th>크기 L/W/H</th><th>적용</th></tr></thead><tbody>${voidRows.map(row => `<tr><td>${escapeHtml(row.gapType)}</td><td>${escapeHtml(row.material)}</td><td>${row.quantity} EA</td><td>${row.weightKg.toFixed(2)} kg</td><td>${row.xM}/${row.yM}/${row.zM} m</td><td>${row.lengthM}/${row.widthM}/${row.heightM} m</td><td>${row.fixedSupportEligible === 'Y' ? '계획 적용' : '범위 밖 · 미확정'}</td></tr>`).join('')}</tbody></table></div><p class="technical-note">${escapeHtml(VOID_FILL_DISCLAIMER)}</p>` : '';

  const materialItems: Array<[string, string]> = [];
  if (securing) {
    if (securing.antiSlipMats > 0) materialItems.push(['미끄럼방지재', `${securing.antiSlipMats} EA`]);
    if (securing.dunnageBlocks > 0) materialItems.push(['블로킹재', `${securing.dunnageBlocks} EA`]);
    if (securing.loadBars > 0) materialItems.push(['고정바', `${securing.loadBars} EA`]);
    if (securing.bandingStraps > 0) materialItems.push(['밴딩', `${securing.bandingStraps} 줄 / ${securing.bandingLengthM.toFixed(1)} m`]);
    if (securing.cornerGuards > 0) materialItems.push(['각대', `${securing.cornerGuards} EA / ${securing.cornerGuardLengthM.toFixed(1)} m`]);
    if (securing.wrappingLengthM > 0) materialItems.push(['랩핑', `${securing.wrappingLengthM.toFixed(0)} m`]);
  }
  const materialCards = materialItems.length
    ? materialItems.map(([name, value]) => `<div><span>${escapeHtml(name)}</span><b>${escapeHtml(value)}</b><i>□ 설치 확인</i></div>`).join('')
    : `<div><span>추가 보강재</span><b>${securing ? '없음' : '미확인'}</b><i>${securing ? '기본 적재안' : '보강 계획을 확인하세요'}</i></div>`;

  const recommendations = hardFailures.length ? ['적재 제약 위반이 있어 출고할 수 없습니다. 이 문서는 검토용입니다.', ...hardFailures] : certification
    ? buildWorkOrderRecommendations(certification)
    : ['관성 3종 검증을 완료하고 위험 여부를 확인한 뒤 작업을 진행하세요.'];
  const actions = [
    approval === 'danger' ? '위험 기준을 초과했습니다. 출고 전 재배치·고정 보강 후 책임자의 확인을 받으세요.'
      : approval === 'incomplete' ? '출발·제동·회전 검증을 완료하고 미확인 항목을 책임자와 점검하세요.'
      : '설치 영역 안내에 따라 미끄럼방지재·블로킹·고정바를 대조하고 흔들림을 확인하세요.',
    '잔량박스의 구역·높이와 출하 수량을 맞추고, 상단 빈 칸·측벽·끝단 유격을 보강하세요.',
    '포장 강도·장비 제원·결박장치 정격과 문 닫힘 간섭을 확인하고 담당자가 서명하세요.',
  ];
  const recommendationItems = actions.map((item, index) => `<li><b>${index + 1}</b><span>${escapeHtml(item)}</span></li>`).join('');


  const remainingText = result.remaining.length
    ? result.remaining.map(item => `${item.cargoId} ${item.quantity}EA`).join(' · ')
    : '없음';
  const openingCheck = equipment.geometry === 'platform' || equipment.geometry === 'flat-rack'
    ? '□ 장비 끝단·결박점 간섭 없음'
    : equipment.geometry === 'open-top'
      ? '□ 도어/상부 개방부 간섭 없음'
      : '□ 도어 닫힘 간섭 없음';
  return buildReportDocument({
    title,
    shipmentFields: true, compact: true,
    subtitle: `${generatedAt} · 출하지시 수량과 실제 적재 결과를 대조하는 현장 작업용 문서`,
    status: `${review ? 'WHAT-IF REVIEW · 출고 승인 아님 · ' : ''}출고 전 확인 ${actions.length}건${approval === 'danger' ? ' · 위험' : approval === 'incomplete' ? ' · 검증 미완료' : ''}`,
    tone: review && approval !== 'danger' ? 'caution' : approval === 'caution' ? 'caution' : approval === 'danger' ? 'danger' : approval === 'incomplete' ? 'neutral' : 'good',
    watermark: review ? 'WHAT-IF REVIEW · 출고 승인 아님' : physicsVerified ? undefined : '검토용 · 검증 확인 필요',
    summary: `${buildLimitReviewHtml(reportTarget, certification)}<section class="summary" aria-label="적재 요약"><div class="text-metric"><span>운송 장비</span><b>${escapeHtml(equipment.shortName)}</b><small>${container.length} × ${container.width} × ${container.height} m</small></div><div><span>실제 적재단위</span><b>${result.placements.length} EA</b></div><div><span>화물 중량</span><b>${result.loadedWeightKg.toLocaleString()} kg</b></div><div class="text-metric"><span>미적재 · 별도 확인</span><b>${escapeHtml(remainingText)}</b></div></section>`,
    sections: [
      {
        title: '한눈에 보는 적재 배치', description: '안쪽부터 구역 번호순으로, 한 구역 안에서는 바닥부터 위로 쌓으세요. 위치는 안쪽 벽 기준입니다.',
        content: `${overview}${legend}<h3>구역별 작업 순서</h3>${zoneTable}<p class="zone-caption">길이×폭은 놓은 상태의 방향입니다. 도면의 위·아래는 위에서 본 좌·우 벽이며, 서로 다른 바닥 높이는 별도 단으로 표시합니다.</p>`,
      },
      {
        title: '3D 완료 모습과 구역별 진행', description: '회색은 이미 쌓은 구역, 품목 색은 이번 구역입니다. 빈 공간과 빨간 테두리 잔량박스를 대조하세요.',
        content: `<div class="zone-completed">${completed}</div><div class="zone-progress">${progress}</div>`,
      },
      {
        title: '단별 배치 상세', description: '구역별 작업표의 바닥 높이와 맞춰 확인하세요. 각 단의 서로 다른 품목 위치와 빈 칸을 표시합니다.',
        content: `${partials}<div class="zone-layer-plans">${layerPlans}</div>`,
      },
      {
        title: '출하 수량과 보조자재', description: '품목별 수량과 준비 자재를 대조하고 설치 대상 영역을 확인하세요.',
        content: `${shipmentInstruction}${cargoIntake}<div class="section-title"><h3>필요 보조자재</h3><span>${escapeHtml(securing?.levelLabel ?? '보조 고정 미확인')}</span></div><section class="materials">${materialCards}</section>${buildSecuringLocationGuide(container, result.placements, securing)}${voidFillTable}`,
      },
      {
        title: '현장 작업 체크리스트', description: '계산으로 확인할 수 없는 현장 항목입니다. 작업자가 직접 확인하고 표시하세요.',
        content: buildFieldChecklistHtml(equipment.category),
      },
      {
        title: '출고 전 최종 확인', description: '아래 3개 작업을 확인한 뒤 담당자가 서명하세요.',
        content: `<ol class="recommendations">${recommendationItems}</ol><div class="final-check"><div>${openingCheck}</div><div>□ 흔들림/빈 공간 보강 확인</div><div>□ 출하지시 수량과 실물 수량 일치</div></div>${REPORT_SIGNOFF}<aside class="technical-note"><b>검증 판정: ${escapeHtml(approvalLabel)}</b><p>${recommendations.map(item => escapeHtml(item)).join('<br>')}</p><p>관성 판정은 시뮬레이터 내부 비교 결과이며 실제 운송 안전 인증을 의미하지 않습니다. ‘주의 · 검토용’은 내부 PASS 기준 일부 초과·위험 기준 이내인 결과이며 출고 승인을 의미하지 않습니다. 장비 기준: ${escapeHtml(equipment.sourceLabel)}.</p></aside>`,
      },
    ],
    footer: `<span>장비: ${escapeHtml(equipment.shortName)}</span><span>관성 검증 조건: 출발 ${INERTIA_SCENARIO_ACCELERATION_G.acceleration.toFixed(2)}g · 제동 ${INERTIA_SCENARIO_ACCELERATION_G.braking.toFixed(2)}g · 회전 ${INERTIA_SCENARIO_ACCELERATION_G.cornering.toFixed(2)}g (앱 내부 비교 기준)</span><span>물리검증: ${physicsVerified ? '완료 · PASS' : physicsComplete ? '검사 완료 · 미통과' : '미완료'}</span><span>관성 최종검증: ${escapeHtml(approvalLabel)}</span><span>보조재 추정중량: ${securing ? `${securing.estimatedAddedWeightKg.toFixed(1)} kg` : '0 kg'}</span>`,
  });
}

export function openLoadingReport(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult): boolean {
  const inertiaCertification = matchingBoxCertification(container, cargo, result);
  if (!inertiaCertification || !canCreateWorkOrder(inertiaCertification)) {
    requestDirectWorkOrder(container, cargo, result);
    return true;
  }
  if (!confirmUnverifiedExport('통합 출하·적재 작업지시서')) return true;
  const popup = window.open('', '_blank');
  if (!popup) return false;
  try { popup.opener = null; } catch { /* 일부 브라우저는 opener 변경을 제한할 수 있음 */ }
  popup.document.open();
  popup.document.write(buildLoadingReportHtml(container, cargo, result));
  popup.document.close();
  return true;
}
