import { buildReportDocument, reportTable, REPORT_SIGNOFF } from './reportLayout';
import { cargoColor } from './cargoColors';
import { palletSnapshotMatchesCertification, physicsTargetFromPalletSnapshot } from './certifiedExport';
import type { OptimizedPalletPackingResult, PalletLoad, PalletSpec } from './engine/palletOptimization';
import type { CargoItem, ContainerSpec } from './engine/types';
import { confirmUnverifiedExport, hasCurrentPhysicsVerification } from './exportVerification';
import { readLatestInertiaCertification, type InertiaCertification } from './inertiaCertification';
import {
  assessWorkOrderCertification,
  buildWorkOrderRecommendations,
  canCreateWorkOrder,
  workOrderApprovalLabel,
} from './inertiaWorkOrderPolicy';
import { buildPalletSecuringPlan, type PalletSecuringPlan } from './palletSecuringPlan';
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

function matchingPalletCertification(snapshot: PalletWorkSnapshot | undefined): InertiaCertification | undefined {
  const target = readPhysicsTarget();
  const certification = readLatestInertiaCertification();
  return palletSnapshotMatchesCertification(snapshot, target, certification) ? certification : undefined;
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

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="팔레트 옆에서 본 적재도"><rect width="${width}" height="${height}" fill="#fff"/><text x="${padX}" y="16" font-size="12" font-weight="800" fill="#172033">옆에서 본 적층 · 1단 먼저 · 같은 C번호의 상단 팔레트를 위에 적층</text><rect x="${padX}" y="${padY}" width="${innerW}" height="${innerH}" rx="7" fill="#f8fafc" stroke="#64748b" stroke-width="2"/>${shapes}<text x="${padX}" y="${height - 5}" font-size="10" font-weight="800" fill="#1d4ed8">◀ 안쪽</text><text x="${width - padX}" y="${height - 5}" text-anchor="end" font-size="10" font-weight="800" fill="#dc2626">문쪽 ▶</text></svg>`;
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
    : '<div><span>추가 보강</span><b>없음</b><i>기본 적재안</i></div>';
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
          ? `${failed.scenario === 'acceleration' ? '출발 가속' : failed.scenario === 'braking' ? '급정거' : '급회전'} PASS 기준 초과 · 전체 ${(failed.maxHorizontalShiftM * 1000).toFixed(1)}mm · 화물↔팔레트 ${((failed.maxCargoRelativeSlipM ?? 0) * 1000).toFixed(1)}mm · 팔레트 ${((failed.maxSupportShiftM ?? 0) * 1000).toFixed(1)}mm · 기울기 ${failed.maxTiltDeg.toFixed(1)}°`
          : '검증 미완료';
    return `<span class="${attempt.passed ? 'pass-step' : 'fail-step'}"><b>${index + 1}. ${escapeHtml(attempt.level === 0 ? '기본 적재안' : attempt.levelLabel)}</b>${escapeHtml(result)}</span>`;
  }).join('');
}

function inertiaMetrics(certification: InertiaCertification) {
  const metrics: Array<[string, string]> = [
    ['전체 최대 이동', `${(certification.maxHorizontalShiftM * 1000).toFixed(1)} mm`],
    ['화물↔팔레트 미끄럼', `${((certification.maxCargoRelativeSlipM ?? 0) * 1000).toFixed(1)} mm`],
    ['팔레트 상대 이동', `${((certification.maxSupportShiftM ?? 0) * 1000).toFixed(1)} mm`],
    ['최대 기울기', `${certification.maxTiltDeg.toFixed(1)}°`],
  ];
  if ((certification.maxCargoRestraintForceN ?? 0) > 0) metrics.push(['최대 화물 구속력', `${((certification.maxCargoRestraintForceN ?? 0) / 1000).toFixed(1)} kN`]);
  if ((certification.maxSupportRestraintForceN ?? 0) > 0) metrics.push(['최대 고정바 구속력', `${((certification.maxSupportRestraintForceN ?? 0) / 1000).toFixed(1)} kN`]);
  return metrics.map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`).join('');
}

export function buildPalletLoadingReportHtml(container: ContainerSpec, cargo: CargoItem[], snapshot: PalletWorkSnapshot, certification: InertiaCertification): string {
  const target = physicsTargetFromPalletSnapshot(container, cargo, snapshot);
  const plan = buildPalletSecuringPlan(target, certification.securing);
  const generatedAt = new Date().toLocaleString('ko-KR');
  const top = topViewSvg(container, snapshot, plan);
  const side = sideViewSvg(container, snapshot, plan);
  const rows = palletRows(snapshot, cargo, plan);
  const sequence = securingSequence(snapshot, plan);
  const materials = materialCards(certification);
  const history = attemptTrail(certification);
  const inertia = inertiaMetrics(certification);
  const approval = assessWorkOrderCertification(certification);
  const approvalLabel = workOrderApprovalLabel(certification);
  const recommendations = buildWorkOrderRecommendations(certification);
  const recommendationItems = recommendations.map((item, index) => `<li><b>${index + 1}</b><span>${escapeHtml(item)}</span></li>`).join('');
  const physicsVerified = typeof window !== 'undefined' && hasCurrentPhysicsVerification();
  const remaining = snapshot.result.remaining.length ? snapshot.result.remaining.map((item) => `${item.cargoId} ${item.quantity}EA`).join(' · ') : '없음';
  return buildReportDocument({
    title: '팔레트 적재 작업지시서',
    subtitle: `${generatedAt} · 그림 / 작업 표 / 결속 카드의 P번호를 맞춰 확인하세요.`,
    status: `관성 3종 · ${approvalLabel}`,
    tone: approval === 'caution' ? 'caution' : approval === 'danger' ? 'danger' : approval === 'incomplete' ? 'neutral' : 'good',
    summary: `<section class="summary" aria-label="팔레트 적재 요약"><div><span>팔레트</span><b>${snapshot.result.palletCount} EA</b><small>${container.length} × ${container.width} × ${container.height} m 장비</small></div><div><span>실제 적재 화물</span><b>${snapshot.result.placements.length} EA</b></div><div><span>팔레트화 중량</span><b>${snapshot.result.totalPalletizedWeightKg.toFixed(0)} kg</b></div><div class="text-metric"><span>미적재 · 별도 확인</span><b>${escapeHtml(remaining)}</b></div></section>`,
    sections: [
      {
        title: '작업 준비', description: '필요 보조자재를 먼저 준비하고 팔레트 번호와 적층 위치를 확인하세요.',
        content: `<div class="section-title"><h3>필요 보조자재 총량</h3><span>${escapeHtml(certification.securing.levelLabel)}</span></div><section class="materials">${materials}</section><p class="note"><b>번호 읽는 법:</b> P번호는 개별 팔레트, C번호는 같은 수직 적층 위치, 단수는 바닥부터의 높이 순서입니다. 투입은 아래 작업 표의 <b>순서</b>를 따르세요.</p>`,
      },
      {
        title: '배치도 확인', description: '1단을 먼저 놓고 같은 C번호의 상단 팔레트를 순서대로 올리세요.',
        content: `<div class="direction"><span>◀ 안쪽부터 · 1단 먼저</span><span>같은 C번호 위에 적층 · 문쪽 ▶</span></div><section class="diagrams">${top}${side}</section><p class="legend">검은 선=밴딩 · 갈색 모서리=각대 · 파란 점선=랩핑 · 주황선=고정바</p>`,
      },
      {
        title: '투입 및 결속 작업', description: '작업 표 순서대로 배치한 후 같은 P번호의 결속 카드를 확인하세요.',
        content: `<h3>팔레트 투입 순서</h3>${reportTable('팔레트 투입 순서 표', `<table class="work"><colgroup><col style="width:8%"><col style="width:12%"><col style="width:19%"><col style="width:23%"><col style="width:30%"><col style="width:8%"></colgroup><thead><tr><th scope="col">순서</th><th scope="col">팔레트</th><th scope="col">박스 구성</th><th scope="col">중량 / 고정</th><th scope="col">놓을 위치</th><th scope="col">완료</th></tr></thead><tbody>${rows}</tbody></table>`)}<div class="title"><h3>팔레트별 결속 작업 순서</h3><span>미끄럼방지 → 배치 → 각대 → 밴딩 → 랩핑 → 확인</span></div><section class="sequence">${sequence}</section>`,
      },
      {
        title: '출고 전 최종 확인', description: approval === 'caution' ? '주의 승인 · 출고 전 보완 확인이 필요합니다.' : '고정 상태를 대조한 뒤 담당자가 확인하세요.',
        content: `<h3>관성 테스트 권장 사항</h3><ol class="recommendations">${recommendationItems}</ol><div class="final"><div>□ 밴딩/각대/랩핑 그림과 일치</div><div>□ 팔레트 흔들림·오버행 없음</div><div>□ 문 닫힘/고정바 간섭 없음</div></div>${REPORT_SIGNOFF}`,
      },
      {
        title: '검증 근거', description: '현장 작업을 마친 뒤 상세 수치와 자동 보강 이력을 대조하세요.',
        content: `<h3>관성 안전 지표</h3><section class="inertia-metrics">${inertia}</section>${history ? `<h3>자동 보강 이력</h3><section class="history">${history}</section>` : ''}<p class="technical">관성 판정(${escapeHtml(approvalLabel)})은 시뮬레이터 내부 비교 결과이며 실제 운송 안전 인증을 의미하지 않습니다. ‘주의 승인’은 내부 PASS 기준을 일부 초과했지만 위험 기준은 넘지 않았다는 뜻입니다. 화물↔팔레트 미끄럼과 적층 팔레트 상대 이동을 함께 확인하고 표시된 권장사항을 출고 전 점검하세요. 표시된 kN은 내부 물리모델 비교값이며 실제 자재 정격을 대체하지 않습니다.</p>`,
      },
    ],
    footer: `<span>물리검증: ${physicsVerified ? '완료' : '별도 확인'}</span><span>관성: ${escapeHtml(approvalLabel)} · 전체 ${(certification.maxHorizontalShiftM * 1000).toFixed(1)} mm · 화물 ${((certification.maxCargoRelativeSlipM ?? 0) * 1000).toFixed(1)} mm · 팔레트 ${((certification.maxSupportShiftM ?? 0) * 1000).toFixed(1)} mm · ${certification.maxTiltDeg.toFixed(1)}°</span><span>보조자재 약 ${certification.securing.estimatedNonCargoWeightKg.toFixed(1)} kg</span>`,
  });
}

export function openPalletLoadingReport(container: ContainerSpec, cargo: CargoItem[]): boolean {
  const snapshot = readPalletSnapshot();
  if (!snapshot?.result.pallets.length) {
    window.alert('팔레트 작업지시서를 만들 적재 결과가 없습니다. 팔레트 자동 적재를 먼저 실행하세요.');
    return true;
  }
  const certification = matchingPalletCertification(snapshot);
  if (!certification) {
    window.alert('팔레트 작업지시서는 현재 팔레트 적재안의 출발 가속·급정거·급회전 관성 시뮬레이션 3종을 먼저 완료해야 합니다.');
    return true;
  }
  if (!canCreateWorkOrder(certification)) {
    window.alert('현재 팔레트 적재안은 관성 테스트에서 위험으로 판정되었거나 3종 검증이 완료되지 않았습니다. 재배치 또는 보강 후 다시 검증하세요.');
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
