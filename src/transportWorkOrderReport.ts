import { palletTruckAxleAssessment, readPalletSnapshot } from './engine/palletAdaptiveSearch';
import { assessTruckAxleLoad } from './engine/truckAxleLoad';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { readLatestInertiaCertification } from './inertiaCertification';

const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const mm = (m: number) => `${Math.round(m * 1000)} mm`;
const kg = (value: number) => `${Math.round(value).toLocaleString()} kg`;

function truckName(container: ContainerSpec) {
  if (container.transportType === 'tautliner') return 'TAUTLINER (CURTAINSIDER)';
  if (container.transportType === 'mega-trailer') return 'MEGA-TRAILER';
  if (container.transportType === 'refrigerated-truck') return 'REFRIGERATED TRUCK';
  if (container.transportType === 'isotherm-truck') return 'ISOTHERM TRUCK';
  return 'CUSTOM TRUCK';
}

function shellDescription(container: ContainerSpec) {
  const side = container.sideWallModel === 'curtain' ? '측면 커튼 · 비지지' : '강체 측벽';
  const roof = container.roofModel === 'rigid' ? '강체 지붕' : container.roofModel === 'open' ? '개방 지붕' : '연성 지붕 · 비지지';
  return `${side} / ${roof}`;
}

function certificationHtml(container: ContainerSpec) {
  const certification = readLatestInertiaCertification();
  if (!certification) return '<div class="warning"><b>관성 인증 기록 없음</b><span>작업지시서 승인 루프에서 관성 3종 검증을 다시 수행하세요.</span></div>';
  const usage = certification.securing;
  const barWarning = container.transportKind === 'truck' && usage.loadBars > 0 && container.loadBarAnchors !== true
    ? '<div class="danger"><b>고정바 사용 금지</b><span>정격 레일/앵커 확인 없이 고정바 수량이 존재합니다. 작업을 중단하고 재검증하세요.</span></div>'
    : '';
  return `<section><h2>관성검증 · 보강재</h2><div class="cards">
    <div><span>상태</span><b>${certification.status === 'passed' ? 'PASS' : 'FAIL'}</b></div>
    <div><span>최대 이동</span><b>${mm(certification.maxHorizontalShiftM)}</b></div>
    <div><span>최대 기울기</span><b>${certification.maxTiltDeg.toFixed(1)}°</b></div>
    <div><span>보강 단계</span><b>${escapeHtml(usage.levelLabel)}</b></div>
  </div><table><tbody>
    <tr><th>밴딩</th><td>${usage.bandingStraps} EA / ${usage.bandingLengthM.toFixed(1)} m</td><th>각대</th><td>${usage.cornerGuards} EA</td></tr>
    <tr><th>랩핑</th><td>${usage.wrappingLengthM.toFixed(1)} m</td><th>미끄럼방지재</th><td>${usage.antiSlipMats} EA</td></tr>
    <tr><th>블로킹재</th><td>${usage.dunnageBlocks} EA</td><th>고정바</th><td>${usage.loadBars} EA</td></tr>
  </tbody></table>${barWarning}</section>`;
}

function axleHtml(container: ContainerSpec, result: LoadingResult) {
  const axle = assessTruckAxleLoad(container, result);
  if (!axle) return '<div class="warning"><b>축하중 모델 미설정</b><span>실제 차량 축 위치/허용하중이 없으므로 작업 전 현장 계근과 차량 제원을 확인하세요.</span></div>';
  const cls = axle.severity === 'over' || axle.severity === 'invalid' ? 'danger' : axle.severity === 'warning' ? 'warning' : 'ok';
  return `<section><h2>트럭 축하중 확인</h2><div class="cards">
    <div><span>화물 COG X</span><b>${axle.cargoCogX.toFixed(2)} m</b></div>
    <div><span>앞축/축군</span><b>${kg(axle.frontTotalKg)}</b><small>${axle.frontUtilization === undefined ? '허용치 미입력' : `허용치 대비 ${(axle.frontUtilization * 100).toFixed(1)}%`}</small></div>
    <div><span>뒤축/축군</span><b>${kg(axle.rearTotalKg)}</b><small>${axle.rearUtilization === undefined ? '허용치 미입력' : `허용치 대비 ${(axle.rearUtilization * 100).toFixed(1)}%`}</small></div>
  </div><div class="${cls}"><b>${axle.severity === 'over' ? '축하중 초과 · 작업 금지' : axle.severity === 'invalid' ? '축 설정 오류' : axle.severity === 'warning' ? '축하중 주의' : '축하중 입력 범위 내'}</b><span>${escapeHtml(axle.messages.join(' / '))}</span></div></section>`;
}

function commonHead(title: string, container: ContainerSpec) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
  @page{size:A4;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,'Noto Sans KR',sans-serif;color:#172033;margin:0;font-size:11px}h1{font-size:22px;margin:0 0 5px}h2{font-size:14px;margin:16px 0 7px;border-bottom:2px solid #2563eb;padding-bottom:5px}.meta{color:#64748b;margin-bottom:12px}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.cards>div{border:1px solid #dbe4ee;border-radius:7px;padding:7px}.cards span,.cards small{display:block;color:#64748b;font-size:9px}.cards b{display:block;margin-top:2px;font-size:12px}table{width:100%;border-collapse:collapse;margin-top:7px}th,td{border:1px solid #dbe4ee;padding:6px;text-align:left}th{background:#f8fafc}.warning,.danger,.ok{display:flex;flex-direction:column;gap:3px;margin-top:8px;padding:8px;border-radius:7px}.warning{background:#fffbeb;border:1px solid #fcd34d}.danger{background:#fef2f2;border:1px solid #fca5a5}.ok{background:#ecfdf5;border:1px solid #86efac}.work{page-break-inside:avoid}.checks{display:grid;grid-template-columns:1fr 1fr;gap:5px}.checks div{border-bottom:1px solid #cbd5e1;padding:6px}.footer{margin-top:16px;color:#64748b;font-size:9px;line-height:1.5}.no-print{position:fixed;right:14px;top:12px}@media print{.no-print{display:none}}
  </style></head><body><button class="no-print" onclick="window.print()">인쇄 / PDF</button><h1>${escapeHtml(title)}</h1><div class="meta">${escapeHtml(truckName(container))} · 적재공간 ${container.length.toFixed(2)}×${container.width.toFixed(2)}×${container.height.toFixed(2)}m · 허용 적재중량 ${kg(container.maxPayloadKg)} · ${escapeHtml(shellDescription(container))}</div>`;
}

function commonTail(container: ContainerSpec) {
  return `<section><h2>현장 최종 확인</h2><div class="checks">
    <div>□ 실제 차량 내부치수와 시뮬레이션 값 일치</div><div>□ 화물 수량·품번·중량 확인</div>
    <div>□ 전방→후방 배치 위치와 현장 표시 일치</div><div>□ 좌우 무게 편중 및 통로 간섭 없음</div>
    <div>□ 모든 밴딩·랩핑·각대·블로킹 실제 시공</div><div>□ 고정바는 정격 레일/앵커 확인 시에만 사용</div>
    <div>□ 커튼/후문/도어 닫힘 및 장비 간섭 없음</div><div>□ 출발 전 실제 축중/총중량 법규 및 계근 확인</div>
  </div></section><div class="footer">좌표 기준: X=0은 적재공간 전방, X 증가 방향은 후방/하역구 방향입니다. 시뮬레이터의 축하중 계산은 배치 비교용 단순보 모델이며 법적 계근값을 대체하지 않습니다. 커튼사이더의 커튼과 연성 지붕은 구조 화물 지지면으로 간주하지 않습니다. 생성 시각 ${new Date().toLocaleString('ko-KR')}</div></body></html>`;
}

export function openTruckLoadingReport(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult) {
  const popup = window.open('', '_blank', 'noopener,noreferrer');
  if (!popup) return false;
  const counts = new Map<string, number>();
  result.placements.forEach(item => counts.set(item.cargoId, (counts.get(item.cargoId) ?? 0) + 1));
  const rows = cargo.filter(item => (counts.get(item.id) ?? 0) > 0).map(item => `<tr><td>${escapeHtml(item.id)}</td><td>${escapeHtml(item.name)}</td><td>${counts.get(item.id) ?? 0} EA</td><td>${kg(item.weightKg)}</td><td>${Math.round(item.length * 1000)}×${Math.round(item.width * 1000)}×${Math.round(item.height * 1000)} mm</td></tr>`).join('');
  const ordered = [...result.placements].sort((a, b) => a.x - b.x || a.y - b.y || a.z - b.z);
  const steps = ordered.map((item, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(item.cargoId)}</td><td>X ${item.x.toFixed(2)}m</td><td>Y ${item.y.toFixed(2)}m</td><td>Z ${item.z.toFixed(2)}m</td><td>${item.rotated ? '90° 회전' : '정방향'}</td></tr>`).join('');
  const html = commonHead('트럭 직접 적재 작업지시서', container)
    + `<section><h2>화물 요약</h2><div class="cards"><div><span>적재수량</span><b>${result.placements.length} EA</b></div><div><span>화물중량</span><b>${kg(result.loadedWeightKg)}</b></div><div><span>잔여 SKU</span><b>${result.remaining.length}</b></div><div><span>고정바 앵커</span><b>${container.loadBarAnchors ? '확인됨' : '미확인'}</b></div></div><table><thead><tr><th>품번</th><th>품명</th><th>수량</th><th>개당중량</th><th>박스치수</th></tr></thead><tbody>${rows}</tbody></table></section>`
    + axleHtml(container, result)
    + certificationHtml(container)
    + `<section class="work"><h2>직접 적재 순서 · 전방 → 후방</h2><table><thead><tr><th>#</th><th>품번</th><th>X</th><th>Y</th><th>Z</th><th>방향</th></tr></thead><tbody>${steps}</tbody></table></section>`
    + commonTail(container);
  popup.document.open(); popup.document.write(html); popup.document.close();
  return true;
}

export function openTruckPalletLoadingReport(container: ContainerSpec, cargo: CargoItem[]) {
  const snapshot = readPalletSnapshot();
  if (!snapshot) return false;
  const popup = window.open('', '_blank', 'noopener,noreferrer');
  if (!popup) return false;
  const result = snapshot.result;
  const axle = palletTruckAxleAssessment(container, result);
  const axleSection = !axle
    ? '<div class="warning"><b>축하중 모델 미설정</b><span>실제 차량 축 위치/허용하중을 확인하세요.</span></div>'
    : `<section><h2>트럭 축하중 확인 · 팔레트 자중 포함</h2><div class="cards"><div><span>총 COG X</span><b>${axle.cargoCogX.toFixed(2)}m</b></div><div><span>앞축/축군</span><b>${kg(axle.frontTotalKg)}</b></div><div><span>뒤축/축군</span><b>${kg(axle.rearTotalKg)}</b></div><div><span>판정</span><b>${axle.severity.toUpperCase()}</b></div></div><div class="${axle.severity === 'over' || axle.severity === 'invalid' ? 'danger' : axle.severity === 'warning' ? 'warning' : 'ok'}"><span>${escapeHtml(axle.messages.join(' / '))}</span></div></section>`;
  const rows = [...result.pallets].sort((a, b) => a.x - b.x || a.y - b.y || a.stackLevel - b.stackLevel).map(pallet => {
    const bySku = new Map<string, number>();
    pallet.cargoPlacements.forEach(item => bySku.set(item.cargoId, (bySku.get(item.cargoId) ?? 0) + 1));
    const sku = [...bySku.entries()].map(([id, qty]) => `${escapeHtml(id)} ${qty}EA`).join(' / ');
    return `<tr><td>P${pallet.palletIndex}</td><td>${pallet.stackLevel}단</td><td>X ${pallet.x.toFixed(2)}m / Y ${pallet.y.toFixed(2)}m</td><td>${sku}</td><td>${kg(pallet.totalWeightKg)}</td></tr>`;
  }).join('');
  const html = commonHead('트럭 팔레트 적재 작업지시서', container)
    + `<section><h2>팔레트 최종안</h2><div class="cards"><div><span>팔레트</span><b>${result.palletCount} EA</b></div><div><span>화물</span><b>${result.placements.length} EA</b></div><div><span>팔레트 포함중량</span><b>${kg(result.totalPalletizedWeightKg)}</b></div><div><span>최대 팔레트 적층</span><b>${result.maxUsedStackLevel}단</b></div></div><table><thead><tr><th>팔레트</th><th>적층</th><th>위치</th><th>구성</th><th>총중량</th></tr></thead><tbody>${rows}</tbody></table></section>`
    + axleSection
    + certificationHtml(container)
    + commonTail(container);
  popup.document.open(); popup.document.write(html); popup.document.close();
  return true;
}
