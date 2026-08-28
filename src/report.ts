import { boxResultMatchesCertification } from './certifiedExport';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { confirmUnverifiedExport, hasCurrentPhysicsVerification } from './exportVerification';
import { readLatestInertiaCertification, type InertiaCertification } from './inertiaCertification';
import { readPhysicsTarget } from './physicsTarget';
import { requestDirectWorkOrder } from './directWorkOrderEvents';
import { readTransportEquipment } from './transportEquipment';
import { buildProgressSvgs, buildSideViewSvg, buildTopViewSvg, buildWorkerStepGroups } from './workerReportGraphics';

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
  return boxResultMatchesCertification({ container, cargo, result }, target, certification) ? certification : undefined;
}

function rangeText(min: number, max: number, prefix: string) {
  if (min <= 0 && max <= 0) return '-';
  return min === max ? `${prefix}${min}` : `${prefix}${min}~${max}`;
}

export function buildLoadingReportHtml(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult): string {
  const certification = matchingBoxCertification(container, cargo, result);
  const securing = certification?.securing;
  const physicsVerified = typeof window !== 'undefined' && hasCurrentPhysicsVerification();
  const equipment = readTransportEquipment();
  const equipmentKind = equipment.category === 'truck' ? '트럭' : '컨테이너';
  const title = `${equipmentKind} 적재 작업지시서`;
  const groups = buildWorkerStepGroups(container, cargo, result);
  const topView = buildTopViewSvg(container, cargo, result, groups);
  const sideView = buildSideViewSvg(container, cargo, result, groups);
  const progressViews = buildProgressSvgs(container, result, groups);
  const generatedAt = new Date().toLocaleString('ko-KR');

  const workRows = groups.map(group => {
    const steps = group.fromStep === group.toStep ? `${group.fromStep}` : `${group.fromStep}~${group.toStep}`;
    const rows = rangeText(group.minRow, group.maxRow, 'R');
    const columns = rangeText(group.minColumn, group.maxColumn, 'C');
    return `<tr>
      <td class="group-no"><b>${group.group}</b></td>
      <td><b>${escapeHtml(group.cargoId)}</b><small>${escapeHtml(group.label)}</small></td>
      <td><b>${group.quantity} EA</b><small>박스순서 ${steps}</small></td>
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

  const remainingText = result.remaining.length
    ? result.remaining.map(item => `${item.cargoId} ${item.quantity}EA`).join(' · ')
    : '없음';
  const openingCheck = equipment.geometry === 'platform' || equipment.geometry === 'flat-rack'
    ? '□ 장비 끝단·결박점 간섭 없음'
    : equipment.geometry === 'open-top'
      ? '□ 도어/상부 개방부 간섭 없음'
      : '□ 도어 닫힘 간섭 없음';

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    @page{size:A4 portrait;margin:8mm}*{box-sizing:border-box}body{font-family:Arial,"Noto Sans KR",sans-serif;color:#172033;margin:0;font-size:10px;background:#fff}h1,h2,p{margin:0}.sheet{max-width:794px;margin:0 auto;padding:4px}.header{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;border-bottom:3px solid #172033;padding-bottom:9px}.header h1{font-size:24px;letter-spacing:-.5px}.header p{margin-top:4px;color:#64748b}.pass{padding:8px 12px;border:2px solid #16a34a;border-radius:10px;background:#f0fdf4;color:#166534;text-align:center}.pass b{display:block;font-size:15px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:8px 0}.summary div{padding:8px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc}.summary span{display:block;color:#64748b;font-size:9px}.summary b{display:block;margin-top:2px;font-size:13px}.summary small{display:block;margin-top:2px;color:#64748b;font-size:8px}.direction{display:flex;align-items:center;justify-content:center;gap:16px;margin:6px 0;padding:7px;border-radius:8px;background:#eff6ff;color:#1d4ed8;font-size:13px;font-weight:900}.direction em{font-style:normal;color:#475569}.diagram-grid{display:grid;grid-template-columns:1fr;gap:7px}.diagram-grid svg{width:100%;height:auto;display:block;border:1px solid #e2e8f0;border-radius:10px}.section-title{display:flex;justify-content:space-between;align-items:end;margin:10px 0 5px}.section-title h2{font-size:15px}.section-title span{color:#64748b;font-size:9px}.progress{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.progress svg{width:100%;height:auto}.work-table{width:100%;border-collapse:collapse}.work-table th,.work-table td{border:1px solid #cbd5e1;padding:6px;vertical-align:middle}.work-table th{background:#172033;color:#fff;font-size:9px}.work-table small{display:block;margin-top:2px;color:#64748b;font-size:8px}.group-no{width:38px;text-align:center;background:#eff6ff;color:#1d4ed8}.group-no b{font-size:16px}.check{width:36px;text-align:center;font-size:19px}.materials{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.materials div{padding:7px;border:1px solid #cbd5e1;border-radius:8px}.materials span,.materials i{display:block;color:#64748b;font-size:8px}.materials b{display:block;margin:2px 0;font-size:12px}.materials i{font-style:normal;color:#166534}.final-check{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px}.final-check div{padding:8px;border:1px solid #f0b85f;border-radius:8px;background:#fff8e8;font-weight:800}.footer{display:flex;justify-content:space-between;gap:10px;margin-top:8px;padding-top:6px;border-top:1px solid #cbd5e1;color:#64748b;font-size:8px}.watermark{position:fixed;inset:42% 0 auto;text-align:center;transform:rotate(-18deg);font-size:48px;font-weight:900;color:rgba(185,28,28,.09);pointer-events:none;z-index:20}.worker-note{margin-top:7px;padding:7px;border-left:4px solid #2563eb;background:#eff6ff;font-size:9px;line-height:1.5}.technical-note{margin-top:6px;color:#64748b;font-size:7.5px;line-height:1.4}@media print{.watermark{display:${physicsVerified && certification ? 'none' : 'block'}}}
  </style></head><body>${physicsVerified && certification ? '' : '<div class="watermark">검증 확인 필요</div>'}<main class="sheet">
    <header class="header"><div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(generatedAt)} · 그림의 숫자 = 아래 작업순서 번호</p></div><div class="pass"><span>관성 3종</span><b>${certification ? 'PASS' : '확인 필요'}</b></div></header>
    <section class="summary"><div><span>운송 장비</span><b>${escapeHtml(equipment.shortName)}</b><small>${container.length}×${container.width}×${container.height}m</small></div><div><span>총 적재</span><b>${result.placements.length} EA</b></div><div><span>총 중량</span><b>${result.loadedWeightKg.toLocaleString()} kg</b></div><div><span>미적재</span><b>${escapeHtml(remainingText)}</b></div></section>
    <div class="direction"><em>◀ 적재공간 안쪽</em><span>① 안쪽부터 · ② 바닥부터 · ③ 번호 순서대로</span><strong>도어 방향 ▶</strong></div>
    <section class="diagram-grid">${topView}${sideView}</section>
    <div class="section-title"><h2>3단계 진행 그림</h2><span>작업 중 현재 위치 확인용</span></div><section class="progress">${progressViews.join('')}</section>
    <div class="section-title"><h2>작업 순서</h2><span>한 줄 끝날 때마다 □ 체크</span></div>
    <table class="work-table"><thead><tr><th>그림번호</th><th>품목</th><th>수량</th><th>넣을 위치</th><th>완료</th></tr></thead><tbody>${workRows}</tbody></table>
    <div class="section-title"><h2>필요 보조자재</h2><span>${escapeHtml(securing?.levelLabel ?? '보조 고정 없음')}</span></div><section class="materials">${materialCards}</section>
    <div class="final-check"><div>${openingCheck}</div><div>□ 흔들림/빈 공간 보강 확인</div><div>□ 작업지시 수량과 실물 수량 일치</div></div>
    <p class="worker-note"><b>작업자가 기억할 것:</b> 그림 번호가 바뀌기 전까지는 같은 묶음입니다. 같은 묶음 안에서는 <b>안쪽 → 도어 방향, 바닥 → 위</b> 순서로 채우고 임의로 가운데를 비우지 마세요.</p>
    <p class="technical-note">관성 PASS는 시뮬레이터 내부 비교 기준이며 실제 운송 안전 인증을 의미하지 않습니다. 작업 전 선택 장비의 실제 제원, 포장 강도, 현장 결박 기준과 보조자재 규격을 확인하세요. 장비 기준: ${escapeHtml(equipment.sourceLabel)}.</p>
    <footer class="footer"><span>장비: ${escapeHtml(equipment.shortName)}</span><span>물리검증: ${physicsVerified ? '완료' : '미검증'}</span><span>관성 최종검증: ${certification ? '통과' : '미완료'}</span><span>보조재 추정중량: ${securing ? `${securing.estimatedAddedWeightKg.toFixed(1)} kg` : '0 kg'}</span></footer>
  </main></body></html>`;
}

export function openLoadingReport(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult): boolean {
  const inertiaCertification = matchingBoxCertification(container, cargo, result);
  if (!inertiaCertification) {
    requestDirectWorkOrder(container, cargo, result);
    return true;
  }
  if (!confirmUnverifiedExport('작업지시서')) return true;
  const popup = window.open('', '_blank');
  if (!popup) return false;
  try { popup.opener = null; } catch { /* 일부 브라우저는 opener 변경을 제한할 수 있음 */ }
  popup.document.open();
  popup.document.write(buildLoadingReportHtml(container, cargo, result));
  popup.document.close();
  return true;
}
