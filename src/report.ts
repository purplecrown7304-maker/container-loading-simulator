import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { assessWeightBalance } from './engine/weightBalance';
import { explainLoading } from './engine/explanation';
import { analyzeFloorLoad } from './engine/floorLoad';
import { analyzeConstraints } from './engine/constraintAnalysis';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function pointText(point?: { x: number; y: number; z: number }) {
  if (!point) return '-';
  return `X ${point.x.toFixed(2)} / Y ${point.y.toFixed(2)} / Z ${point.z.toFixed(2)}m`;
}

export function buildLoadingReportHtml(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult): string {
  const quality = assessWeightBalance(container, result);
  const explanation = explainLoading(container, cargo, result);
  const floor = analyzeFloorLoad(container, result, 12, 4);
  const checks = analyzeConstraints(container, cargo, result, floor);
  const totalVolume = container.length * container.width * container.height;
  const fillRate = totalVolume > 0 ? result.usedVolumeM3 / totalVolume * 100 : 0;
  const requested = new Map(cargo.map(item => [item.id, item.quantity]));
  const loadedByCargo = new Map<string, number>();
  result.placements.forEach(p => loadedByCargo.set(p.cargoId, (loadedByCargo.get(p.cargoId) ?? 0) + 1));
  const generatedAt = new Date().toLocaleString('ko-KR');

  const cargoRows = cargo.map(item => {
    const loaded = loadedByCargo.get(item.id) ?? 0;
    return `<tr><td>${escapeHtml(item.id)}</td><td>${escapeHtml(item.name)}</td><td>${item.quantity}</td><td>${loaded}</td><td>${Math.max(0, item.quantity - loaded)}</td><td>${item.weightKg}</td></tr>`;
  }).join('');

  const explanationRows = explanation.cargo.map(item => `<tr><td>${escapeHtml(item.cargoId)}</td><td>${escapeHtml(item.zone)}</td><td>${item.rotated}</td><td>${item.priorityScore.toFixed(3)}</td><td>${item.reasons.map(escapeHtml).join('<br>')}</td></tr>`).join('');
  const ruleSummary = explanation.summary.map(item => `<li>${escapeHtml(item)}</li>`).join('');
  const checkRows = checks.map(item => `<tr><td>${escapeHtml(item.label)}</td><td class="status-${item.status}">${item.status === 'pass' ? '통과' : item.status === 'warn' ? '확인' : '실패'}</td><td>${escapeHtml(item.detail)}</td></tr>`).join('');
  const floorRows = floor.cells.map(cell => `<tr><td>${cell.row + 1}</td><td>${cell.column + 1}</td><td>${cell.loadKg.toFixed(1)}</td><td>${cell.kgPerM2.toFixed(0)}</td></tr>`).join('');

  const correctionRows = result.autoCorrections?.length
    ? result.autoCorrections.map(item => `<tr><td>${escapeHtml(item.label)}</td><td>${escapeHtml(item.cargoId ?? '-')}</td><td>${escapeHtml(item.description)}</td><td>${escapeHtml(pointText(item.from))}</td><td>${escapeHtml(pointText(item.to))}</td><td>${item.beforeScore !== undefined && item.afterScore !== undefined ? `${item.beforeScore.toFixed(2)} → ${item.afterScore.toFixed(2)}` : '-'}</td></tr>`).join('')
    : '<tr><td colspan="6">자동 재배치 없음</td></tr>';

  const remainingRows = result.remaining.length
    ? result.remaining.map(item => `<tr><td>${escapeHtml(item.cargoId)}</td><td>${item.quantity}</td><td>${escapeHtml(item.reason)}</td></tr>`).join('')
    : '<tr><td colspan="3">미적재 화물 없음</td></tr>';

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>컨테이너 적재 작업지시서</title><style>
  body{font-family:Arial,"Noto Sans KR",sans-serif;color:#172033;margin:28px;font-size:12px}h1{font-size:22px;margin:0 0 5px}h2{font-size:15px;margin:22px 0 8px}.sub{color:#687286;margin-bottom:18px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.card{border:1px solid #dfe4eb;border-radius:8px;padding:10px}.card span{display:block;color:#687286;font-size:10px;margin-bottom:4px}.card b{font-size:14px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #dfe4eb;padding:7px;text-align:left;vertical-align:top}th{background:#f3f5f8}.rules{padding:10px 14px;background:#f6f8fb;border:1px solid #e3e7ee;border-radius:8px}.rules li{margin:4px 0}.warn{margin-top:18px;padding:10px;border:1px solid #f2c46d;background:#fff8e8}.footer{margin-top:24px;color:#687286;font-size:10px}.status-pass{color:#238636;font-weight:700}.status-warn{color:#a15c00;font-weight:700}.status-fail{color:#b42318;font-weight:700}.floor-table{font-size:10px}@media print{body{margin:12mm}.no-print{display:none}}
  </style></head><body><h1>컨테이너 적재 작업지시서</h1><div class="sub">생성: ${escapeHtml(generatedAt)}</div>
  <div class="grid"><div class="card"><span>컨테이너</span><b>${container.length} × ${container.width} × ${container.height} m</b></div><div class="card"><span>적재 수량</span><b>${result.placements.length} EA</b></div><div class="card"><span>적재 중량</span><b>${result.loadedWeightKg.toLocaleString()} kg</b></div><div class="card"><span>체적 적재율</span><b>${fillRate.toFixed(1)}%</b></div><div class="card"><span>품질 점수</span><b>${quality.loadingQualityScore.toFixed(0)}점 · ${quality.grade}</b></div><div class="card"><span>좌우 편차</span><b>${quality.lateralDeviationPct.toFixed(1)}%</b></div><div class="card"><span>바닥 평균 하중</span><b>${floor.averageKgPerM2.toFixed(0)} kg/m²</b></div><div class="card"><span>바닥 최대 하중</span><b>${floor.maxKgPerM2.toFixed(0)} kg/m²</b></div></div>
  <h2>제약조건 검사</h2><table><thead><tr><th>항목</th><th>상태</th><th>상세</th></tr></thead><tbody>${checkRows}</tbody></table>
  <h2>적재 판단 기준</h2><ul class="rules">${ruleSummary}</ul>
  <h2>품목별 적재 현황</h2><table><thead><tr><th>코드</th><th>품명</th><th>요청</th><th>적재</th><th>잔량</th><th>개당 중량(kg)</th></tr></thead><tbody>${cargoRows}</tbody></table>
  <h2>품목별 배치 사유</h2><table><thead><tr><th>코드</th><th>주 배치 구역</th><th>회전 수량</th><th>우선순위 점수</th><th>설명</th></tr></thead><tbody>${explanationRows}</tbody></table>
  <h2>자동 보정 이력</h2><table><thead><tr><th>보정</th><th>품목</th><th>내용</th><th>이동 전</th><th>이동 후</th><th>점수 변화</th></tr></thead><tbody>${correctionRows}</tbody></table>
  <h2>바닥 하중 격자 (12×4)</h2><table class="floor-table"><thead><tr><th>행</th><th>열</th><th>분배 하중(kg)</th><th>kg/m²</th></tr></thead><tbody>${floorRows}</tbody></table>
  <h2>미적재 사유</h2><table><thead><tr><th>코드</th><th>수량</th><th>사유</th></tr></thead><tbody>${remainingRows}</tbody></table>
  <div class="warn"><b>현장 확인 필수</b><br>본 결과는 작업 의사결정 보조용입니다. 바닥 하중은 적재 화물의 중량을 바닥 투영면적에 분배한 계산값이며, 실제 컨테이너 제조사 바닥 집중하중·축중·박스 압축강도·팔레트 허용하중·결박 및 현장 안전 기준을 대체하지 않습니다.</div>
  <div class="footer">요청 총수량: ${[...requested.values()].reduce((a,b)=>a+b,0)} EA · 자동 보정: ${result.autoCorrections?.length ?? 0}건 · 검증 이슈: ${result.validationIssues.length}건</div></body></html>`;
}

export function openLoadingReport(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult): boolean {
  const popup = window.open('', '_blank');
  if (!popup) return false;
  try { popup.opener = null; } catch { /* 일부 브라우저는 opener 변경을 제한할 수 있음 */ }
  popup.document.open();
  popup.document.write(buildLoadingReportHtml(container, cargo, result));
  popup.document.close();
  return true;
}
