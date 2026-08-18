import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { assessWeightBalance } from './engine/weightBalance';
import { explainLoading } from './engine/explanation';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function buildLoadingReportHtml(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult): string {
  const quality = assessWeightBalance(container, result);
  const explanation = explainLoading(container, cargo, result);
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

  const remainingRows = result.remaining.length
    ? result.remaining.map(item => `<tr><td>${escapeHtml(item.cargoId)}</td><td>${item.quantity}</td><td>${escapeHtml(item.reason)}</td></tr>`).join('')
    : '<tr><td colspan="3">미적재 화물 없음</td></tr>';

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>컨테이너 적재 작업지시서</title><style>
  body{font-family:Arial,"Noto Sans KR",sans-serif;color:#172033;margin:28px;font-size:12px}h1{font-size:22px;margin:0 0 5px}h2{font-size:15px;margin:22px 0 8px}.sub{color:#687286;margin-bottom:18px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.card{border:1px solid #dfe4eb;border-radius:8px;padding:10px}.card span{display:block;color:#687286;font-size:10px;margin-bottom:4px}.card b{font-size:14px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #dfe4eb;padding:7px;text-align:left;vertical-align:top}th{background:#f3f5f8}.rules{padding:10px 14px;background:#f6f8fb;border:1px solid #e3e7ee;border-radius:8px}.rules li{margin:4px 0}.warn{margin-top:18px;padding:10px;border:1px solid #f2c46d;background:#fff8e8}.footer{margin-top:24px;color:#687286;font-size:10px}@media print{body{margin:12mm}.no-print{display:none}}
  </style></head><body><h1>컨테이너 적재 작업지시서</h1><div class="sub">생성: ${escapeHtml(generatedAt)}</div>
  <div class="grid"><div class="card"><span>컨테이너</span><b>${container.length} × ${container.width} × ${container.height} m</b></div><div class="card"><span>적재 수량</span><b>${result.placements.length} EA</b></div><div class="card"><span>적재 중량</span><b>${result.loadedWeightKg.toLocaleString()} kg</b></div><div class="card"><span>체적 적재율</span><b>${fillRate.toFixed(1)}%</b></div><div class="card"><span>품질 점수</span><b>${quality.loadingQualityScore.toFixed(0)}점 · ${quality.grade}</b></div><div class="card"><span>좌우 편차</span><b>${quality.lateralDeviationPct.toFixed(1)}%</b></div><div class="card"><span>앞뒤 편차</span><b>${quality.longitudinalDeviationPct.toFixed(1)}%</b></div><div class="card"><span>최대 적재중량</span><b>${container.maxPayloadKg.toLocaleString()} kg</b></div></div>
  <h2>적재 판단 기준</h2><ul class="rules">${ruleSummary}</ul>
  <h2>품목별 적재 현황</h2><table><thead><tr><th>코드</th><th>품명</th><th>요청</th><th>적재</th><th>잔량</th><th>개당 중량(kg)</th></tr></thead><tbody>${cargoRows}</tbody></table>
  <h2>품목별 배치 사유</h2><table><thead><tr><th>코드</th><th>주 배치 구역</th><th>회전 수량</th><th>우선순위 점수</th><th>설명</th></tr></thead><tbody>${explanationRows}</tbody></table>
  <h2>미적재 사유</h2><table><thead><tr><th>코드</th><th>수량</th><th>사유</th></tr></thead><tbody>${remainingRows}</tbody></table>
  <div class="warn"><b>현장 확인 필수</b><br>본 결과는 작업 의사결정 보조용입니다. 실제 박스 압축강도, 팔레트 허용하중, 컨테이너 바닥 집중하중, 축중, 결박·고정 및 작업 안전 기준은 현장에서 별도 검증해야 합니다.</div>
  <div class="footer">요청 총수량: ${[...requested.values()].reduce((a,b)=>a+b,0)} EA · 검증 이슈: ${result.validationIssues.length}건</div></body></html>`;
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
