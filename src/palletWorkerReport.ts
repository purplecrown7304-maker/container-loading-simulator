import { cargoColor } from './cargoColors';
import type { OptimizedPalletPackingResult, PalletLoad, PalletSpec } from './engine/palletOptimization';
import type { CargoItem, ContainerSpec } from './engine/types';
import { confirmUnverifiedExport, hasCurrentPhysicsVerification } from './exportVerification';
import { createPhysicsTargetSignature, readLatestInertiaCertification, type InertiaCertification, type SecuringUsage } from './inertiaCertification';
import { readPhysicsTarget } from './physicsTarget';

export type PalletWorkSnapshot = { spec: PalletSpec; result: OptimizedPalletPackingResult };
type PalletWindow = Window & { __containerLoadingPalletSnapshot?: PalletWorkSnapshot };

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function readPalletSnapshot(): PalletWorkSnapshot | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as PalletWindow).__containerLoadingPalletSnapshot;
}

function matchingPalletCertification(): InertiaCertification | undefined {
  const target = readPhysicsTarget();
  const certification = readLatestInertiaCertification();
  if (!target || target.mode !== 'pallets') return undefined;
  if (!certification || certification.status !== 'passed' || certification.mode !== 'pallets') return undefined;
  return certification.targetSignature === createPhysicsTargetSignature(target) ? certification : undefined;
}

function cargoTop(pallet: PalletLoad) {
  return Math.max(pallet.z + pallet.height, ...pallet.cargoPlacements.map(item => item.z + item.height));
}

function cargoSummary(pallet: PalletLoad, cargo: CargoItem[]) {
  const labels = new Map(cargo.map(item => [item.id, item.name]));
  const counts = new Map<string, number>();
  pallet.cargoPlacements.forEach(item => counts.set(item.cargoId, (counts.get(item.cargoId) ?? 0) + 1));
  return [...counts.entries()]
    .map(([id, count]) => `${id}${labels.get(id) && labels.get(id) !== id ? `(${labels.get(id)})` : ''} ${count}EA`)
    .join(' · ');
}

function workOrder(pallets: PalletLoad[]) {
  return [...pallets].sort((a, b) =>
    a.x - b.x ||
    a.stackColumn - b.stackColumn ||
    a.stackLevel - b.stackLevel ||
    a.y - b.y ||
    a.palletIndex - b.palletIndex,
  );
}

function topViewSvg(container: ContainerSpec, snapshot: PalletWorkSnapshot, usage: SecuringUsage) {
  const width = 760;
  const height = 220;
  const padX = 42;
  const padY = 34;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const sx = innerW / container.length;
  const sy = innerH / container.width;
  const occupied = snapshot.result.pallets.length ? {
    minX: Math.min(...snapshot.result.pallets.map(p => p.x)),
    maxX: Math.max(...snapshot.result.pallets.map(p => p.x + p.length)),
  } : null;
  const strapsPerPallet = usage.palletCount ? Math.round(usage.bandingStraps / usage.palletCount) : 0;

  const palletShapes = workOrder(snapshot.result.pallets).map(pallet => {
    const x = padX + pallet.x * sx;
    const y = padY + pallet.y * sy;
    const w = pallet.length * sx;
    const h = pallet.width * sy;
    const mainCargo = pallet.cargoPlacements[0]?.cargoId ?? `P${pallet.palletIndex}`;
    const strapLines = Array.from({ length: strapsPerPallet }, (_, index) => {
      const px = x + w * (index + 1) / (strapsPerPallet + 1);
      return `<line x1="${px.toFixed(1)}" y1="${(y + 2).toFixed(1)}" x2="${px.toFixed(1)}" y2="${(y + h - 2).toFixed(1)}" stroke="#111827" stroke-width="3"/>`;
    }).join('');
    const corners = usage.cornerGuards > 0
      ? [[x,y],[x+w,y],[x,y+h],[x+w,y+h]].map(([cx,cy]) => `<rect x="${(cx-3).toFixed(1)}" y="${(cy-3).toFixed(1)}" width="6" height="6" fill="#b78650"/>`).join('')
      : '';
    const wrap = usage.wrappingLengthM > 0
      ? `<rect x="${(x+3).toFixed(1)}" y="${(y+3).toFixed(1)}" width="${Math.max(1,w-6).toFixed(1)}" height="${Math.max(1,h-6).toFixed(1)}" fill="none" stroke="#38a3d1" stroke-width="2" stroke-dasharray="6 4"/>`
      : '';
    return `<g><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="5" fill="${cargoColor(mainCargo)}" stroke="#334155" stroke-width="1.5"/>${wrap}${strapLines}${corners}<circle cx="${(x+w/2).toFixed(1)}" cy="${(y+h/2).toFixed(1)}" r="15" fill="#fff" stroke="#172033" stroke-width="1.5"/><text x="${(x+w/2).toFixed(1)}" y="${(y+h/2+4).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="800" fill="#172033">P${pallet.palletIndex}</text><text x="${(x+w/2).toFixed(1)}" y="${(y+h-7).toFixed(1)}" text-anchor="middle" font-size="8" font-weight="700" fill="#334155">C${pallet.stackColumn} · L${pallet.stackLevel}</text></g>`;
  }).join('');

  const loadBars = occupied && usage.loadBars > 0
    ? Array.from({ length: usage.loadBars }, (_, index) => {
      const xM = usage.loadBars === 1 ? occupied.maxX + 0.04 : index === 0 ? Math.max(0.02, occupied.minX - 0.04) : Math.min(container.length - 0.02, occupied.maxX + 0.04);
      const x = padX + xM * sx;
      return `<line x1="${x.toFixed(1)}" y1="${padY}" x2="${x.toFixed(1)}" y2="${(padY+innerH).toFixed(1)}" stroke="#e87924" stroke-width="5"/>`;
    }).join('')
    : '';

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="팔레트 위에서 본 적재도"><rect width="${width}" height="${height}" fill="#fff"/><text x="${padX}" y="18" font-size="12" font-weight="800" fill="#172033">위에서 본 배치 · P번호대로 확인</text><rect x="${padX}" y="${padY}" width="${innerW}" height="${innerH}" rx="7" fill="#f8fafc" stroke="#64748b" stroke-width="2"/>${palletShapes}${loadBars}<text x="${padX}" y="${height-5}" font-size="10" font-weight="800" fill="#1d4ed8">◀ 안쪽</text><text x="${width-padX}" y="${height-5}" text-anchor="end" font-size="10" font-weight="800" fill="#dc2626">문쪽 ▶</text></svg>`;
}

function sideViewSvg(container: ContainerSpec, snapshot: PalletWorkSnapshot, usage: SecuringUsage) {
  const width = 760;
  const height = 235;
  const padX = 42;
  const padY = 30;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2 - 12;
  const sx = innerW / container.length;
  const sz = innerH / container.height;
  const strapsPerPallet = usage.palletCount ? Math.round(usage.bandingStraps / usage.palletCount) : 0;

  const shapes = workOrder(snapshot.result.pallets).map(pallet => {
    const x = padX + pallet.x * sx;
    const top = cargoTop(pallet);
    const bottomY = padY + innerH - pallet.z * sz;
    const topY = padY + innerH - top * sz;
    const w = pallet.length * sx;
    const h = Math.max(6, bottomY - topY);
    const palletY = padY + innerH - (pallet.z + pallet.height) * sz;
    const palletH = Math.max(3, pallet.height * sz);
    const mainCargo = pallet.cargoPlacements[0]?.cargoId ?? `P${pallet.palletIndex}`;
    const straps = Array.from({ length: strapsPerPallet }, (_, index) => {
      const px = x + w * (index + 1) / (strapsPerPallet + 1);
      return `<line x1="${px.toFixed(1)}" y1="${topY.toFixed(1)}" x2="${px.toFixed(1)}" y2="${palletY.toFixed(1)}" stroke="#111827" stroke-width="3"/>`;
    }).join('');
    const wrap = usage.wrappingLengthM > 0 ? `<rect x="${(x+2).toFixed(1)}" y="${(topY+2).toFixed(1)}" width="${Math.max(1,w-4).toFixed(1)}" height="${Math.max(1,h-palletH-4).toFixed(1)}" fill="none" stroke="#38a3d1" stroke-width="2" stroke-dasharray="6 4"/>` : '';
    return `<g><rect x="${x.toFixed(1)}" y="${topY.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="4" fill="${cargoColor(mainCargo)}" fill-opacity=".78" stroke="#334155"/>${wrap}${straps}<rect x="${x.toFixed(1)}" y="${palletY.toFixed(1)}" width="${w.toFixed(1)}" height="${palletH.toFixed(1)}" fill="#9a6b3f" stroke="#704728"/><circle cx="${(x+w/2).toFixed(1)}" cy="${Math.max(topY+16,palletY-12).toFixed(1)}" r="14" fill="#fff" stroke="#172033"/><text x="${(x+w/2).toFixed(1)}" y="${Math.max(topY+20,palletY-8).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="800">P${pallet.palletIndex}</text><text x="${(x+w/2).toFixed(1)}" y="${(bottomY-4).toFixed(1)}" text-anchor="middle" font-size="8" font-weight="700">C${pallet.stackColumn} / ${pallet.stackLevel}단</text></g>`;
  }).join('');

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="팔레트 옆에서 본 적재도"><rect width="${width}" height="${height}" fill="#fff"/><text x="${padX}" y="16" font-size="12" font-weight="800" fill="#172033">옆에서 본 적층 · 1단을 먼저 놓고 같은 C번호의 2단/3단을 올리기</text><rect x="${padX}" y="${padY}" width="${innerW}" height="${innerH}" rx="7" fill="#f8fafc" stroke="#64748b" stroke-width="2"/>${shapes}<text x="${padX}" y="${height-5}" font-size="10" font-weight="800" fill="#1d4ed8">◀ 안쪽</text><text x="${width-padX}" y="${height-5}" text-anchor="end" font-size="10" font-weight="800" fill="#dc2626">문쪽 ▶</text></svg>`;
}

function palletRows(snapshot: PalletWorkSnapshot, cargo: CargoItem[], usage: SecuringUsage) {
  const strapsPerPallet = usage.palletCount ? Math.round(usage.bandingStraps / usage.palletCount) : 0;
  const guardPerPallet = usage.palletCount ? Math.round(usage.cornerGuards / usage.palletCount) : 0;
  return workOrder(snapshot.result.pallets).map((pallet, index) => {
    const securing = [
      strapsPerPallet > 0 ? `밴딩 ${strapsPerPallet}줄` : '',
      guardPerPallet > 0 ? `각대 ${guardPerPallet}개` : '',
      usage.wrappingLengthM > 0 ? '랩핑' : '',
      usage.antiSlipMats > 0 && pallet.stackLevel === 1 ? '미끄럼방지' : '',
    ].filter(Boolean).join(' + ') || '추가 보강 없음';
    const instruction = pallet.stackLevel === 1
      ? `컨테이너 안쪽부터 C${pallet.stackColumn} 위치에 바닥 배치`
      : `C${pallet.stackColumn}의 ${pallet.stackLevel - 1}단 위에 ${pallet.stackLevel}단 적층`;
    return `<tr><td class="seq"><b>${index+1}</b></td><td><b>P${pallet.palletIndex}</b><small>C${pallet.stackColumn} · ${pallet.stackLevel}단</small></td><td><b>${pallet.cargoPlacements.length} EA</b><small>${escapeHtml(cargoSummary(pallet,cargo))}</small></td><td><b>${pallet.totalWeightKg.toFixed(0)} kg</b><small>${escapeHtml(securing)}</small></td><td><b>${escapeHtml(instruction)}</b><small>X ${pallet.x.toFixed(2)}m · Y ${pallet.y.toFixed(2)}m</small></td><td class="check">□</td></tr>`;
  }).join('');
}

function materialCards(usage: SecuringUsage) {
  const items: Array<[string,string]> = [];
  if (usage.palletCount > 0) items.push(['팔레트', `${usage.palletCount} EA`]);
  if (usage.bandingStraps > 0) items.push(['밴딩', `${usage.bandingStraps}줄 · ${usage.bandingLengthM.toFixed(1)}m`]);
  if (usage.cornerGuards > 0) items.push(['각대', `${usage.cornerGuards}EA · ${usage.cornerGuardLengthM.toFixed(1)}m`]);
  if (usage.wrappingLengthM > 0) items.push(['랩핑', `${usage.wrappingLengthM.toFixed(0)}m`]);
  if (usage.antiSlipMats > 0) items.push(['미끄럼방지', `${usage.antiSlipMats} EA`]);
  if (usage.loadBars > 0) items.push(['고정바', `${usage.loadBars} EA`]);
  return items.map(([name,value]) => `<div><span>${name}</span><b>${value}</b><i>□ 준비/설치 확인</i></div>`).join('');
}

export function buildPalletLoadingReportHtml(
  container: ContainerSpec,
  cargo: CargoItem[],
  snapshot: PalletWorkSnapshot,
  certification: InertiaCertification,
): string {
  const usage = certification.securing;
  const generatedAt = new Date().toLocaleString('ko-KR');
  const top = topViewSvg(container,snapshot,usage);
  const side = sideViewSvg(container,snapshot,usage);
  const rows = palletRows(snapshot,cargo,usage);
  const materials = materialCards(usage);
  const physicsVerified = typeof window !== 'undefined' && hasCurrentPhysicsVerification();
  const remaining = snapshot.result.remaining.length ? snapshot.result.remaining.map(item => `${item.cargoId} ${item.quantity}EA`).join(' · ') : '없음';

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>팔레트 적재 작업지시서</title><style>@page{size:A4 portrait;margin:8mm}*{box-sizing:border-box}body{font-family:Arial,"Noto Sans KR",sans-serif;color:#172033;margin:0;font-size:10px}h1,h2,p{margin:0}.sheet{max-width:794px;margin:0 auto}.header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border-bottom:3px solid #172033;padding-bottom:8px}.header h1{font-size:23px}.header p{margin-top:4px;color:#64748b}.pass{padding:7px 11px;border:2px solid #16a34a;border-radius:10px;background:#f0fdf4;color:#166534;text-align:center}.pass b{display:block;font-size:15px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:8px 0}.summary div{padding:7px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc}.summary span{display:block;color:#64748b;font-size:8px}.summary b{display:block;margin-top:2px;font-size:12px}.direction{padding:7px;text-align:center;border-radius:8px;background:#eff6ff;color:#1d4ed8;font-size:12px;font-weight:900;margin-bottom:6px}.diagrams{display:grid;grid-template-columns:1fr;gap:6px}.diagrams svg{width:100%;height:auto;display:block;border:1px solid #e2e8f0;border-radius:9px}.title{display:flex;justify-content:space-between;align-items:end;margin:9px 0 4px}.title h2{font-size:14px}.title span{font-size:8px;color:#64748b}.work{width:100%;border-collapse:collapse}.work th,.work td{border:1px solid #cbd5e1;padding:5px;vertical-align:middle}.work th{background:#172033;color:#fff;font-size:8px}.work small{display:block;margin-top:2px;color:#64748b;font-size:7.5px}.seq{width:34px;text-align:center;background:#eff6ff;color:#1d4ed8}.seq b{font-size:15px}.check{width:32px;text-align:center;font-size:18px}.materials{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}.materials div{padding:6px;border:1px solid #cbd5e1;border-radius:7px}.materials span,.materials i{display:block;font-size:8px;color:#64748b}.materials b{display:block;margin:2px 0;font-size:11px}.materials i{font-style:normal;color:#166534}.final{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:7px}.final div{padding:7px;border:1px solid #f0b85f;border-radius:7px;background:#fff8e8;font-weight:800}.note{margin-top:7px;padding:7px;border-left:4px solid #2563eb;background:#eff6ff;font-size:9px;line-height:1.5}.technical{margin-top:5px;font-size:7.5px;color:#64748b;line-height:1.4}.footer{display:flex;justify-content:space-between;gap:7px;margin-top:7px;padding-top:5px;border-top:1px solid #cbd5e1;font-size:7.5px;color:#64748b}</style></head><body><main class="sheet"><header class="header"><div><h1>팔레트 적재 작업지시서</h1><p>${escapeHtml(generatedAt)} · 그림의 P번호와 아래 작업표의 P번호가 같습니다.</p></div><div class="pass"><span>관성 3종</span><b>PASS</b></div></header><section class="summary"><div><span>팔레트</span><b>${snapshot.result.palletCount} EA</b></div><div><span>화물</span><b>${snapshot.result.placements.length} EA</b></div><div><span>팔레트화 중량</span><b>${snapshot.result.totalPalletizedWeightKg.toFixed(0)} kg</b></div><div><span>미적재</span><b>${escapeHtml(remaining)}</b></div></section><div class="direction">◀ 안쪽부터 배치 · 1단 먼저 · 같은 C번호의 2단/3단은 그 위에 적층 · 문쪽 ▶</div><section class="diagrams">${top}${side}</section><div class="title"><h2>팔레트 투입 순서</h2><span>한 줄 완료할 때마다 □ 체크</span></div><table class="work"><thead><tr><th>순서</th><th>팔레트</th><th>박스 구성</th><th>중량/고정</th><th>놓을 위치</th><th>완료</th></tr></thead><tbody>${rows}</tbody></table><div class="title"><h2>필요 보조자재</h2><span>${escapeHtml(usage.levelLabel)}</span></div><section class="materials">${materials}</section><div class="final"><div>□ 밴딩/각대/랩핑 그림과 일치</div><div>□ 팔레트 흔들림·오버행 없음</div><div>□ 문 닫힘/고정바 간섭 없음</div></div><p class="note"><b>작업자가 기억할 것:</b> 팔레트는 P번호 순서로 넣고, 같은 C번호는 같은 수직 적층 위치입니다. <b>1단을 먼저 놓은 뒤 2단/3단을 올리세요.</b> 검은 선=밴딩, 갈색 모서리=각대, 파란 점선=랩핑, 주황선=고정바입니다.</p><p class="technical">관성 PASS는 시뮬레이터 내부 비교 기준이며 실제 운송 안전 인증을 의미하지 않습니다. 실제 팔레트 상태·밴딩 규격·각대 강도·필름·고정바 정격과 현장 안전기준을 작업 전에 확인하세요.</p><footer class="footer"><span>물리검증: ${physicsVerified ? '완료' : '별도 확인'}</span><span>관성: ${certification.maxHorizontalShiftM*1000 <= 0.1 ? (certification.maxHorizontalShiftM*1000).toFixed(2) : (certification.maxHorizontalShiftM*1000).toFixed(1)}mm / ${certification.maxTiltDeg.toFixed(1)}°</span><span>박스 제외 보조자재: 약 ${usage.estimatedNonCargoWeightKg.toFixed(1)}kg</span></footer></main></body></html>`;
}

export function openPalletLoadingReport(container: ContainerSpec, cargo: CargoItem[]): boolean {
  const snapshot = readPalletSnapshot();
  if (!snapshot?.result.pallets.length) {
    window.alert('팔레트 작업지시서를 만들 적재 결과가 없습니다. 팔레트 자동 적재를 먼저 실행하세요.');
    return true;
  }
  const certification = matchingPalletCertification();
  if (!certification) {
    window.alert('팔레트 작업지시서는 현재 팔레트 적재안이 출발 가속·급정거·급회전 관성 시뮬레이션 3종을 모두 통과한 뒤 출력할 수 있습니다. 먼저 결과 보기를 실행해 최종 관성검증을 완료하세요.');
    return true;
  }
  if (!confirmUnverifiedExport('팔레트 작업지시서')) return true;
  const popup = window.open('', '_blank');
  if (!popup) return false;
  try { popup.opener = null; } catch { /* opener 변경 제한 브라우저 */ }
  popup.document.open();
  popup.document.write(buildPalletLoadingReportHtml(container,cargo,snapshot,certification));
  popup.document.close();
  return true;
}
