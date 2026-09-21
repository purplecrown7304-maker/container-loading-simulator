import { buildReportDocument, reportTable, REPORT_SIGNOFF } from './reportLayout';
import { boxResultMatchesWorkOrderCertification } from './certifiedExport';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { confirmUnverifiedExport, hasCurrentPhysicsVerification } from './exportVerification';
import { readLatestInertiaCertification, type InertiaCertification } from './inertiaCertification';
import {
  assessWorkOrderCertification,
  buildWorkOrderRecommendations,
  canCreateWorkOrder,
  workOrderApprovalLabel,
} from './inertiaWorkOrderPolicy';
import { readPhysicsTarget } from './physicsTarget';
import { requestDirectWorkOrder } from './directWorkOrderEvents';
import { buildShipmentInstructionSection } from './shipmentInstruction';
import { readTransportEquipment } from './transportEquipment';
import { buildProgressSvgs, buildSideViewSvg, buildTopViewSvg, buildWorkerStepGroups } from './workerReportGraphics';
import { buildWorkOrderCargoSummary, loadedCargoCounts } from './workOrderCargoSummary';

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

function rangeText(min: number, max: number, prefix: string) {
  if (min <= 0 && max <= 0) return '-';
  return min === max ? `${prefix}${min}` : `${prefix}${min}~${max}`;
}

export function buildLoadingReportHtml(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult): string {
  const certification = matchingBoxCertification(container, cargo, result);
  const securing = certification?.securing;
  const approval = certification ? assessWorkOrderCertification(certification) : 'incomplete';
  const approvalLabel = certification ? workOrderApprovalLabel(certification) : '확인 필요';
  const workOrderApproved = Boolean(certification && canCreateWorkOrder(certification));
  const physicsVerified = typeof window !== 'undefined' && hasCurrentPhysicsVerification();
  const equipment = readTransportEquipment();
  const equipmentKind = equipment.category === 'truck' ? '트럭' : '컨테이너';
  const title = `${equipmentKind} 통합 출하·적재 작업지시서`;
  const groups = buildWorkerStepGroups(container, cargo, result);
  const topView = buildTopViewSvg(container, cargo, result, groups);
  const sideView = buildSideViewSvg(container, cargo, result, groups);
  const progressViews = buildProgressSvgs(container, result, groups);
  const generatedAt = new Date().toLocaleString('ko-KR');
  const cargoIntake = buildWorkOrderCargoSummary(cargo, loadedCargoCounts(result.placements));
  const shipmentInstruction = buildShipmentInstructionSection(cargo, result);

  const workRows = groups.map(group => {
    const steps = group.fromStep === group.toStep ? `${group.fromStep}` : `${group.fromStep}~${group.toStep}`;
    const rows = rangeText(group.minRow, group.maxRow, 'R');
    const columns = rangeText(group.minColumn, group.maxColumn, 'C');
    return `<tr>
      <td class="group-no"><b>${group.group}</b></td>
      <td><b>${escapeHtml(group.cargoId)}</b><small>${escapeHtml(group.label)}</small></td>
      <td><b>${group.quantity} EA</b><small>적재순서 ${steps}</small></td>
      <td><b>${escapeHtml(group.zone)} · ${group.layer}단</b><small>${rows} / ${columns}</small></td>
      <td class="check">□</td>
    </tr>`;
  }).join('');

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
    : '<div><span>추가 보강재</span><b>없음</b><i>기본 적재안</i></div>';

  const recommendations = certification
    ? buildWorkOrderRecommendations(certification)
    : ['관성 3종 검증을 완료하고 위험 여부를 확인한 뒤 작업을 진행하세요.'];
  const recommendationItems = recommendations.map((item, index) => `<li><b>${index + 1}</b><span>${escapeHtml(item)}</span></li>`).join('');

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
    subtitle: `${generatedAt} · 출하지시 수량과 실제 적재 결과를 대조하는 현장 작업용 문서`,
    status: `관성 3종 · ${approvalLabel}`,
    tone: approval === 'caution' ? 'caution' : approval === 'danger' ? 'danger' : approval === 'incomplete' ? 'neutral' : 'good',
    watermark: physicsVerified && workOrderApproved ? undefined : '검증 확인 필요',
    summary: `<section class="summary" aria-label="적재 요약"><div class="text-metric"><span>운송 장비</span><b>${escapeHtml(equipment.shortName)}</b><small>${container.length} × ${container.width} × ${container.height} m</small></div><div><span>실제 적재단위</span><b>${result.placements.length} EA</b></div><div><span>화물 중량</span><b>${result.loadedWeightKg.toLocaleString()} kg</b></div><div class="text-metric"><span>미적재 · 별도 확인</span><b>${escapeHtml(remainingText)}</b></div></section>`,
    sections: [
      {
        title: '작업 준비', description: '출하 수량을 확인하고 화물과 보조자재를 준비하세요.',
        content: `${shipmentInstruction}${cargoIntake}<div class="section-title"><h3>필요 보조자재</h3><span>${escapeHtml(securing?.levelLabel ?? '보조 고정 없음')}</span></div><section class="materials">${materialCards}</section>`,
      },
      {
        title: '배치도 확인', description: '안쪽과 도어 방향을 먼저 확인한 뒤 그림 번호를 작업 순서 표와 맞추세요.',
        content: `<div class="direction"><em>◀ 적재공간 안쪽</em><span>① 안쪽부터 · ② 바닥부터 · ③ 번호 순서대로</span><strong>도어 방향 ▶</strong></div><section class="diagram-grid">${topView}${sideView}</section><p class="legend">그림번호 = 작업 묶음 · R = 길이 방향 행 · C = 폭 방향 열 · 단 = 바닥부터의 적층 단계</p><h3>3단계 진행 그림</h3><section class="progress">${progressViews.join('')}</section>`,
      },
      {
        title: '적재 작업 순서', description: '위에서 아래로 진행하고 한 줄을 완료할 때마다 확인 칸에 표시하세요.',
        content: `${reportTable('적재 작업 순서 표', `<table class="work-table"><colgroup><col style="width:9%"><col style="width:28%"><col style="width:19%"><col style="width:35%"><col style="width:9%"></colgroup><thead><tr><th scope="col">그림번호</th><th scope="col">품목 / 적재단위</th><th scope="col">수량</th><th scope="col">넣을 위치</th><th scope="col">완료</th></tr></thead><tbody>${workRows}</tbody></table>`)}<p class="worker-note"><b>작업자가 기억할 것:</b> 그림 번호가 바뀌기 전까지는 같은 묶음입니다. 같은 묶음 안에서는 <b>안쪽 → 도어 방향, 바닥 → 위</b> 순서로 채우고 임의로 가운데를 비우지 마세요.</p>`,
      },
      {
        title: '출고 전 최종 확인', description: approval === 'caution' ? '주의 승인 상태입니다. 권장사항을 보완하고 담당자가 확인하세요.' : '고정 상태와 실물 수량을 대조한 뒤 담당자가 확인하세요.',
        content: `<h3>관성 테스트 권장 사항</h3><ol class="recommendations">${recommendationItems}</ol><div class="final-check"><div>${openingCheck}</div><div>□ 흔들림/빈 공간 보강 확인</div><div>□ 출하지시 수량과 실물 수량 일치</div></div>${REPORT_SIGNOFF}<p class="technical-note">관성 판정(${escapeHtml(approvalLabel)})은 시뮬레이터 내부 비교 결과입니다. ‘주의 승인’은 내부 PASS 기준을 일부 초과했지만 위험 기준은 넘지 않았다는 뜻이며 실제 운송 안전 인증을 의미하지 않습니다. 작업 전 선택 장비의 실제 제원, 포장 강도, 현장 결박 기준과 보조자재 규격을 확인하세요. 장비 기준: ${escapeHtml(equipment.sourceLabel)}.</p>`,
      },
    ],
    footer: `<span>장비: ${escapeHtml(equipment.shortName)}</span><span>물리검증: ${physicsVerified ? '완료' : '미검증'}</span><span>관성 최종검증: ${escapeHtml(approvalLabel)}</span><span>보조재 추정중량: ${securing ? `${securing.estimatedAddedWeightKg.toFixed(1)} kg` : '0 kg'}</span>`,
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
