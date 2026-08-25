import { cargoColor } from './cargoColors';
import type { OptimizedPalletPackingResult, PalletLoad, PalletSpec } from './engine/palletOptimization';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { confirmUnverifiedExport, hasCurrentPhysicsVerification } from './exportVerification';
import { createPhysicsTargetSignature, readLatestInertiaCertification, type InertiaCertification } from './inertiaCertification';
import { buildPalletSecuringPlan, type PalletSecuringPlan } from './palletSecuringPlan';
import { readPhysicsTarget, type PhysicsTarget } from './physicsTarget';

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

function snapshotTarget(container: ContainerSpec, cargo: CargoItem[], snapshot: PalletWorkSnapshot): PhysicsTarget {
  const result: LoadingResult = {
    placements: snapshot.result.placements,
    remaining: snapshot.result.remaining,
    loadedWeightKg: snapshot.result.totalPalletizedWeightKg,
    usedVolumeM3: snapshot.result.placements.reduce((sum, placement) => sum + placement.length * placement.width * placement.height, 0),
    validationIssues: [],
  };
  const supports = snapshot.result.pallets.map((pallet) => ({
    id: `PALLET-${String(pallet.palletIndex).padStart(2, '0')}`,
    x: pallet.x,
    y: pallet.y,
    z: pallet.z,
    length: pallet.length,
    width: pallet.width,
    height: pallet.height,
    weightKg: Math.max(0.01, pallet.totalWeightKg - pallet.cargoWeightKg),
    dynamic: true,
  }));
  return { mode: 'pallets', container, cargo, result, supports };
}

function matchingPalletCertification(): InertiaCertification | undefined {
  const target = readPhysicsTarget();
  const certification = readLatestInertiaCertification();
  if (!target || target.mode !== 'pallets') return undefined;
  if (!certification || certification.status !== 'passed' || certification.mode !== 'pallets') return undefined;
  return certification.targetSignature === createPhysicsTargetSignature(target) ? certification : undefined;
}

function cargoTop(pallet: PalletLoad) {
  return Math.max(pallet.z + pallet.height, ...pallet.cargoPlacements.map((item) => item.z + item.height));
}

function cargoSummary(pallet: PalletLoad, cargo: CargoItem[]) {
  const labels = new Map(cargo.map((item) => [item.id, item.name]));
  const counts = new Map<string, number>();
  pallet.cargoPlacements.forEach((item) => counts.set(item.cargoId, (counts.get(item.cargoId) ?? 0) + 1));
  return [...counts.entries()]
    .map(([id, count]) => `${id}${labels.get(id) && labels.get(id) !== id ? `(${labels.get(id)})` : ''} ${count}EA`)
    .join(' · ');
}

function workOrder(pallets: PalletLoad[]) {
  return [...pallets].sort((a, b) => a.x - b.x || a.stackColumn - b.stackColumn || a.stackLevel - b.stackLevel || a.y - b.y || a.palletIndex - b.palletIndex);
}

function stackColumns(pallets: PalletLoad[]) {
  const map = new Map<number, PalletLoad[]>();
  pallets.forEach((pallet) => {
    const list = map.get(pallet.stackColumn) ?? [];
    list.push(pallet);
    map.set(pallet.stackColumn, list);
  });
  return [...map.entries()]
    .map(([column, loads]) => ({ column, loads: loads.sort((a, b) => a.stackLevel - b.stackLevel) }))
    .sort((a, b) => (a.loads[0]?.x ?? 0) - (b.loads[0]?.x ?? 0) || a.column - b.column);
}

function topViewSvg(container: ContainerSpec, snapshot: PalletWorkSnapshot, plan: PalletSecuringPlan) {
  const width = 760;
  const height = 220;
  const padX = 42;
  const padY = 34;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const sx = innerW / container.length;
  const sy = innerH / container.width;
  const planMap = new Map(plan.items.map((item) => [item.palletIndex, item]));

  const shapes = stackColumns(snapshot.result.pallets).map(({ column, loads }) => {
    const base = loads[0];
    if (!base) return '';
    const x = padX + base.x * sx;
    const y = padY + base.y * sy;
    const w = base.length * sx;
    const h = base.width * sy;
    const topLoad = loads[loads.length - 1];
    const mainCargo = topLoad?.cargoPlacements[0]?.cargoId ?? base.cargoPlacements[0]?.cargoId ?? `C${column}`;
    const sequence = loads.map((load) => `P${load.palletIndex}`).join('→');
    const maxStraps = Math.max(0, ...loads.map((load) => planMap.get(load.palletIndex)?.bandingStraps ?? 0));
    const straps = Array.from({ length: maxStraps }, (_, index) => {
      const px = x + w * (index + 1) / (maxStraps + 1);
      return `<line x1="${px.toFixed(1)}" y1="${(y + 2).toFixed(1)}" x2="${px.toFixed(1)}" y2="${(y + h - 2).toFixed(1)}" stroke="#111827" stroke-width="3"/>`;
    }).join('');
    const hasGuards = loads.some((load) => (planMap.get(load.palletIndex)?.cornerGuards ?? 0) > 0);
    const corners = hasGuards
      ? [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([cx, cy]) => `<rect x="${(cx - 3).toFixed(1)}" y="${(cy - 3).toFixed(1)}" width="6" height="6" fill="#b78650"/>`).join('')
      : '';
    const hasWrap = loads.some((load) => (planMap.get(load.palletIndex)?.wrappingLengthM ?? 0) > 0);
    const wrap = hasWrap ? `<rect x="${(x + 3).toFixed(1)}" y="${(y + 3).toFixed(1)}" width="${Math.max(1, w - 6).toFixed(1)}" height="${Math.max(1, h - 6).toFixed(1)}" fill="none" stroke="#38a3d1" stroke-width="2" stroke-dasharray="6 4"/>` : '';
    return `<g><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="5" fill="${cargoColor(mainCargo)}" stroke="#334155" stroke-width="1.5"/>${wrap}${straps}${corners}<circle cx="${(x + w / 2).toFixed(1)}" cy="${(y + h / 2 - 7).toFixed(1)}" r="14" fill="#fff" stroke="#172033"/><text x="${(x + w / 2).toFixed(1)}" y="${(y + h / 2 - 3).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="900">C${column}</text><text x="${(x + w / 2).toFixed(1)}" y="${(y + h / 2 + 15).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="800">${sequence}</text></g>`;
  }).join('');

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="팔레트 위에서 본 적재도"><rect width="${width}" height="${height}" fill="#fff"/><text x="${padX}" y="18" font-size="12" font-weight="800" fill="#172033">위에서 본 바닥 위치 · C=수직 적층 자리 · P1→P2 순서로 위로 적층</text><rect x="${padX}" y="${padY}" width="${innerW}" height="${innerH}" rx="7" fill="#f8fafc" stroke="#64748b" stroke-width="2"/>${shapes}<text x="${padX}" y="${height - 5}" font-size="10" font-weight="800" fill="#1d4ed8">◀ 안쪽</text><text x="${width - padX}" y="${height - 5}" text-anchor="end" font-size="10" font-weight="800" fill="#dc2626">문쪽 ▶</text></svg>`;
}

function sideViewSvg(container: ContainerSpec, snapshot: PalletWorkSnapshot, plan: PalletSecuringPlan) {
  const width = 760;
  const height = 235;
  const padX = 42;
  const padY = 30;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2 - 12;
  const sx = innerW / container.length;
  const sz = innerH / container.height;
  const planMap = new Map(plan.items.map((item) => [item.palletIndex, item]));

  const shapes = workOrder(snapshot.result.pallets).map((pallet) => {
    const item = planMap.get(pallet.palletIndex);
    const x = padX + pallet.x * sx;
    const top = cargoTop(pallet);
    const bottomY = padY + innerH - pallet.z * sz;
    const topY = padY + innerH - top * sz;
    const w = pallet.length * sx;
    const h = Math.max(6, bottomY - topY);
    const palletY = padY + innerH - (pallet.z + pallet.height) * sz;
    const palletH = Math.max(3, pallet.height * sz);
    const mainCargo = pallet.cargoPlacements[0]?.cargoId ?? `P${pallet.palletIndex}`;
    const straps = Array.from({ length: item?.bandingStraps ?? 0 }, (_, index) => {
      const px = x + w * (index + 1) / ((item?.bandingStraps ?? 0) + 1);
      return `<line x1="${px.toFixed(1)}" y1="${topY.toFixed(1)}" x2="${px.toFixed(1)}" y2="${palletY.toFixed(1)}" stroke="#111827" stroke-width="3"/>`;
    }).join('');
    const wrap = (item?.wrappingLengthM ?? 0) > 0 ? `<rect x="${(x + 2).toFixed(1)}" y="${(topY + 2).toFixed(1)}" width="${Math.max(1, w - 4).toFixed(1)}" height="${Math.max(1, h - palletH - 4).toFixed(1)}" fill="none" stroke="#38a3d1" stroke-width="2" stroke-dasharray="6 4"/>` : '';
    return `<g><rect x="${x.toFixed(1)}" y="${topY.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="4" fill="${cargoColor(mainCargo)}" fill-opacity=".78" stroke="#334155"/>${wrap}${straps}<rect x="${x.toFixed(1)}" y="${palletY.toFixed(1)}" width="${w.toFixed(1)}" height="${palletH.toFixed(1)}" fill="#9a6b3f" stroke="#704728"/><circle cx="${(x + w / 2).toFixed(1)}" cy="${Math.max(topY + 16, palletY - 12).toFixed(1)}" r="14" fill="#fff" stroke="#172033"/><text x="${(x + w / 2).toFixed(1)}" y="${Math.max(topY + 20, palletY - 8).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="800">P${pallet.palletIndex}</text><text x="${(x + w / 2).toFixed(1)}" y="${(bottomY - 4).toFixed(1)}" text-anchor="middle" font-size="8" font-weight="700">C${pallet.stackColumn} / ${pallet.stackLevel}단</text></g>`;
  }).join('');

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="팔레트 옆에서 본 적재도"><rect width="${width}" height="${height}" fill="#fff"/><text x="${padX}" y="16" font-size="12" font-weight="800" fill="#172033">옆에서 본 적층 · 1단 먼저 · 같은 C번호의 2단/3단을 위에 적층</text><rect x="${padX}" y="${padY}" width="${innerW}" height="${innerH}" rx="7" fill="#f8fafc" stroke="#64748b" stroke-width="2"/>${shapes}<text x="${padX}" y="${height - 5}" font-size="10" font-weight="800" fill="#1d4ed8">◀ 안쪽</text><text x="${width - padX}" y="${height - 5}" text-anchor="end" font-size="10" font-weight="800" fill="#dc2626">문쪽 ▶</text></svg>`;
}

function palletRows(snapshot: PalletWorkSnapshot, cargo: CargoItem[], plan: PalletSecuringPlan) {
  const planMap = new Map(plan.items.map((item) => [item.palletIndex, item]));
  return workOrder(snapshot.result.pallets).map((pallet, index) => {
    const item = planMap.get(pallet.palletIndex);
    const securing = item
      ? [`밴딩 ${item.bandingStraps}줄/${item.bandingLengthM.toFixed(1)}m`, `각대 ${item.cornerGuards}EA/${item.cornerGuardLengthM.toFixed(1)}m`, item.wrappingLengthM > 0 ? `랩핑 ${item.wrappingLengthM.toFixed(1)}m` : '', item.antiSlipMats > 0 ? `미끄럼방지 ${item.antiSlipMats}EA` : ''].filter(Boolean).join(' · ')
      : '추가 보강 없음';
    const instruction = pallet.stackLevel === 1
      ? `컨테이너 안쪽부터 C${pallet.stackColumn} 위치에 바닥 배치`
      : `C${pallet.stackColumn}의 ${pallet.stackLevel - 1}단 위에 ${pallet.stackLevel}단 적층`;
    return `<tr><td class="seq"><b>${index + 1}</b></td><td><b>P${pallet.palletIndex}</b><small>C${pallet.stackColumn} · ${pallet.stackLevel}단</small></td><td><b>${pallet.cargoPlacements.length} EA</b><small>${escapeHtml(cargoSummary(pallet, cargo))}</small></td><td><b>${pallet.totalWeightKg.toFixed(0)} kg</b><small>${escapeHtml(securing)}</small></td><td><b>${escapeHtml(instruction)}</b><small>X ${pallet.x.toFixed(2)}m · Y ${pallet.y.toFixed(2)}m</small></td><td class="check">□</td></tr>`;
  }).join('');
}

function securingSequence(snapshot: PalletWorkSnapshot, plan: PalletSecuringPlan) {
  const planMap = new Map(plan.items.map((item) => [item.palletIndex, item]));
  const cards = workOrder(snapshot.result.pallets).map((pallet) => {
    const item = planMap.get(pallet.palletIndex);
    const steps = [
      item && item.antiSlipMats > 0 ? `□ ① ${pallet.stackLevel === 1 ? '바닥' : '적층 접촉면'} 미끄럼방지재 ${item.antiSlipMats}EA 설치` : '',
      `□ ② P${pallet.palletIndex} → C${pallet.stackColumn} ${pallet.stackLevel}단 배치`,
      item && item.cornerGuards > 0 ? `□ ③ 각대 ${item.cornerGuards}EA 설치 · 총 ${item.cornerGuardLengthM.toFixed(1)}m` : '',
      item && item.bandingStraps > 0 ? `□ ④ 밴딩 ${item.bandingStraps}줄 결속 · 총 ${item.bandingLengthM.toFixed(1)}m` : '',
      item && item.wrappingLengthM > 0 ? `□ ⑤ 랩핑 ${item.wrappingLengthM.toFixed(1)}m 적용` : '',
      '□ ⑥ 흔들림 · 오버행 · 결속 풀림 확인',
    ].filter(Boolean);
    return `<article><header><b>P${pallet.palletIndex}</b><span>C${pallet.stackColumn} · ${pallet.stackLevel}단 · 적재높이 ${Math.round((item?.loadHeightM ?? 0) * 1000)}mm</span></header>${steps.map((step) => `<p>${escapeHtml(step)}</p>`).join('')}<footer>추가 보강재 약 ${(item?.estimatedAddedWeightKg ?? 0).toFixed(2)}kg</footer></article>`;
  });
  if (plan.sharedLoadBars > 0) cards.push(`<article class="shared"><header><b>최종 공통 고정</b><span>모든 팔레트 배치 완료 후</span></header><p>□ ⑦ 고정바 ${plan.sharedLoadBars}EA 설치</p><p>□ ⑧ 문 닫힘 · 고정바 간섭 · 최종 흔들림 확인</p><footer>고정바 약 ${plan.sharedLoadBarWeightKg.toFixed(2)}kg</footer></article>`);
  return cards.join('');
}

function materialCards(certification: InertiaCertification) {
  const usage = certification.securing;
  const items: Array<[string, string]> = [];
  if (usage.palletCount > 0) items.push(['팔레트', `${usage.palletCount} EA`]);
  if (usage.bandingStraps > 0) items.push(['밴딩', `${usage.bandingStraps}줄 · ${usage.bandingLengthM.toFixed(1)}m`]);
  if (usage.cornerGuards > 0) items.push(['각대', `${usage.cornerGuards}EA · ${usage.cornerGuardLengthM.toFixed(1)}m`]);
  if (usage.wrappingLengthM > 0) items.push(['랩핑', `${usage.wrappingLengthM.toFixed(0)}m`]);
  if (usage.antiSlipMats > 0) items.push(['미끄럼방지', `${usage.antiSlipMats} EA`]);
  if (usage.loadBars > 0) items.push(['고정바', `${usage.loadBars} EA`]);
  return items.length
    ? items.map(([name, value]) => `<div><span>${name}</span><b>${value}</b><i>□ 준비 수량 확인</i></div>`).join('')
    : '<div><span>추가 보강</span><b>없음</b><i>기본 적재안 PASS</i></div>';
}

function attemptTrail(certification: InertiaCertification) {
  const attempts = certification.attempts ?? [];
  if (!attempts.length) return '';
  return attempts.map((attempt, index) => {
    const failed = attempt.scenarios.find((scenario) => !scenario.passed);
    const result = attempt.passed
      ? '3종 PASS'
      : !attempt.payloadWithinLimit
        ? '보조재 포함 최대중량 초과'
        : failed
          ? `${failed.scenario === 'acceleration' ? '출발 가속' : failed.scenario === 'braking' ? '급정거' : '급회전'} FAIL · ${(failed.maxHorizontalShiftM * 1000).toFixed(1)}mm / ${failed.maxTiltDeg.toFixed(1)}°`
          : '검증 미완료';
    return `<span class="${attempt.passed ? 'pass-step' : 'fail-step'}"><b>${index + 1}. ${escapeHtml(attempt.level === 0 ? '기본 적재안' : attempt.levelLabel)}</b>${escapeHtml(result)}</span>`;
  }).join('');
}

export function buildPalletLoadingReportHtml(container: ContainerSpec, cargo: CargoItem[], snapshot: PalletWorkSnapshot, certification: InertiaCertification): string {
  const target = snapshotTarget(container, cargo, snapshot);
  const plan = buildPalletSecuringPlan(target, certification.securing);
  const generatedAt = new Date().toLocaleString('ko-KR');
  const top = topViewSvg(container, snapshot, plan);
  const side = sideViewSvg(container, snapshot, plan);
  const rows = palletRows(snapshot, cargo, plan);
  const sequence = securingSequence(snapshot, plan);
  const materials = materialCards(certification);
  const history = attemptTrail(certification);
  const physicsVerified = typeof window !== 'undefined' && hasCurrentPhysicsVerification();
  const remaining = snapshot.result.remaining.length ? snapshot.result.remaining.map((item) => `${item.cargoId} ${item.quantity}EA`).join(' · ') : '없음';

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>팔레트 적재 작업지시서</title><style>
  @page{size:A4 portrait;margin:8mm}*{box-sizing:border-box}body{font-family:Arial,"Noto Sans KR",sans-serif;color:#172033;margin:0;font-size:10px}h1,h2,p{margin:0}.sheet{max-width:794px;margin:0 auto}.header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border-bottom:3px solid #172033;padding-bottom:8px}.header h1{font-size:23px}.header p{margin-top:4px;color:#64748b}.pass{padding:7px 11px;border:2px solid #16a34a;border-radius:10px;background:#f0fdf4;color:#166534;text-align:center}.pass b{display:block;font-size:15px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:8px 0}.summary div{padding:7px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc}.summary span{display:block;color:#64748b;font-size:8px}.summary b{display:block;margin-top:2px;font-size:12px}.direction{padding:7px;text-align:center;border-radius:8px;background:#eff6ff;color:#1d4ed8;font-size:12px;font-weight:900;margin-bottom:6px}.diagrams{display:grid;grid-template-columns:1fr;gap:6px}.diagrams svg{width:100%;height:auto;display:block;border:1px solid #e2e8f0;border-radius:9px}.title{display:flex;justify-content:space-between;align-items:end;margin:9px 0 4px}.title h2{font-size:14px}.title span{font-size:8px;color:#64748b}.work{width:100%;border-collapse:collapse}.work th,.work td{border:1px solid #cbd5e1;padding:5px;vertical-align:middle}.work th{background:#172033;color:#fff;font-size:8px}.work small{display:block;margin-top:2px;color:#64748b;font-size:7.5px}.seq{width:34px;text-align:center;background:#eff6ff;color:#1d4ed8}.seq b{font-size:15px}.check{width:32px;text-align:center;font-size:18px}.sequence{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}.sequence article{padding:7px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;break-inside:avoid}.sequence article.shared{border-color:#fed7aa;background:#fff7ed}.sequence header{display:flex;justify-content:space-between;gap:6px;border-bottom:1px solid #e2e8f0;padding-bottom:4px}.sequence header b{font-size:11px;color:#1d4ed8}.sequence header span{font-size:7.5px;color:#64748b}.sequence p{padding:3px 0;border-bottom:1px dotted #dbe3ee;font-size:8px}.sequence footer{margin-top:4px;text-align:right;font-size:7.5px;font-weight:800;color:#52617a}.materials{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}.materials div{padding:6px;border:1px solid #cbd5e1;border-radius:7px}.materials span,.materials i{display:block;font-size:8px;color:#64748b}.materials b{display:block;margin:2px 0;font-size:11px}.materials i{font-style:normal;color:#166534}.history{display:flex;gap:5px;flex-wrap:wrap}.history span{display:flex;flex-direction:column;gap:2px;padding:5px 7px;border-radius:7px;font-size:7.5px;border:1px solid #e2e8f0;background:#f8fafc}.history .pass-step{border-color:#bbf7d0;background:#f0fdf4}.history .fail-step{border-color:#fecaca;background:#fff7f7}.history b{font-size:8px}.final{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:7px}.final div{padding:7px;border:1px solid #f0b85f;border-radius:7px;background:#fff8e8;font-weight:800}.note{margin-top:7px;padding:7px;border-left:4px solid #2563eb;background:#eff6ff;font-size:9px;line-height:1.5}.technical{margin-top:5px;font-size:7.5px;color:#64748b;line-height:1.4}.footer{display:flex;justify-content:space-between;gap:7px;margin-top:7px;padding-top:5px;border-top:1px solid #cbd5e1;font-size:7.5px;color:#64748b}
  </style></head><body><main class="sheet"><header class="header"><div><h1>팔레트 적재 작업지시서</h1><p>${escapeHtml(generatedAt)} · 그림/표/결속카드의 P번호가 모두 같습니다.</p></div><div class="pass"><span>관성 3종</span><b>PASS</b></div></header><section class="summary"><div><span>팔레트</span><b>${snapshot.result.palletCount} EA</b></div><div><span>화물</span><b>${snapshot.result.placements.length} EA</b></div><div><span>팔레트화 중량</span><b>${snapshot.result.totalPalletizedWeightKg.toFixed(0)} kg</b></div><div><span>미적재</span><b>${escapeHtml(remaining)}</b></div></section><div class="direction">◀ 안쪽부터 · 1단 먼저 · 같은 C번호의 상단 팔레트 적층 · 결속카드 순서대로 작업 · 문쪽 ▶</div><section class="diagrams">${top}${side}</section><div class="title"><h2>팔레트 투입 순서</h2><span>한 줄 완료할 때마다 □ 체크</span></div><table class="work"><thead><tr><th>순서</th><th>팔레트</th><th>박스 구성</th><th>중량/고정</th><th>놓을 위치</th><th>완료</th></tr></thead><tbody>${rows}</tbody></table><div class="title"><h2>팔레트별 결속 작업 순서</h2><span>미끄럼방지 → 배치 → 각대 → 밴딩 → 랩핑 → 확인</span></div><section class="sequence">${sequence}</section>${history ? `<div class="title"><h2>자동 보강 이력</h2><span>기본안부터 PASS까지</span></div><section class="history">${history}</section>` : ''}<div class="title"><h2>필요 보조자재 총량</h2><span>${escapeHtml(certification.securing.levelLabel)}</span></div><section class="materials">${materials}</section><div class="final"><div>□ 밴딩/각대/랩핑 그림과 일치</div><div>□ 팔레트 흔들림·오버행 없음</div><div>□ 문 닫힘/고정바 간섭 없음</div></div><p class="note"><b>작업자가 기억할 것:</b> 팔레트는 P번호 순서로 넣고, 같은 C번호는 같은 수직 적층 위치입니다. <b>1단을 먼저 놓은 뒤 2단/3단을 올리세요.</b> 검은 선=밴딩, 갈색 모서리=각대, 파란 점선=랩핑, 주황선=고정바입니다.</p><p class="technical">관성 PASS는 시뮬레이터 내부 비교 기준이며 실제 운송 안전 인증을 의미하지 않습니다. 실제 팔레트 상태·밴딩 규격·각대 강도·필름·고정바 정격과 현장 안전기준을 작업 전에 확인하세요.</p><footer class="footer"><span>물리검증: ${physicsVerified ? '완료' : '별도 확인'}</span><span>관성: ${(certification.maxHorizontalShiftM * 1000).toFixed(certification.maxHorizontalShiftM * 1000 <= 0.1 ? 2 : 1)}mm / ${certification.maxTiltDeg.toFixed(1)}°</span><span>박스 제외 보조자재: 약 ${certification.securing.estimatedNonCargoWeightKg.toFixed(1)}kg</span></footer></main></body></html>`;
}

export function openPalletLoadingReport(container: ContainerSpec, cargo: CargoItem[]): boolean {
  const snapshot = readPalletSnapshot();
  if (!snapshot?.result.pallets.length) {
    window.alert('팔레트 작업지시서를 만들 적재 결과가 없습니다. 팔레트 자동 적재를 먼저 실행하세요.');
    return true;
  }
  const certification = matchingPalletCertification();
  if (!certification) {
    window.alert('팔레트 작업지시서는 현재 팔레트 적재안이 출발 가속·급정거·급회전 관성 시뮬레이션 3종을 모두 통과한 뒤 출력할 수 있습니다. 먼저 자동 적재의 최종 관성검증을 완료하세요.');
    return true;
  }
  if (!confirmUnverifiedExport('팔레트 작업지시서')) return true;
  const popup = window.open('', '_blank');
  if (!popup) return false;
  try { popup.opener = null; } catch { /* opener 변경 제한 브라우저 */ }
  popup.document.open();
  popup.document.write(buildPalletLoadingReportHtml(container, cargo, snapshot, certification));
  popup.document.close();
  return true;
}
