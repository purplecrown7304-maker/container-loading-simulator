import type { OptimizedPalletPackingResult, PalletSpec } from './engine/palletOptimization';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { buildLoadingReportHtml } from './report';

export type PalletWorkOrderSnapshot = {
  spec: PalletSpec;
  result: OptimizedPalletPackingResult;
};

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function openHtml(html: string): boolean {
  const popup = globalThis.open('', '_blank');
  if (!popup) return false;
  try { popup.opener = null; } catch { /* 브라우저 정책에 따라 제한될 수 있음 */ }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  return true;
}

export function openBoxWorkOrderV3(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult): boolean {
  // UX v3 규칙: 작업지시서 생성은 관성/무게중심 평가와 분리한다.
  // 기존 HTML은 검증 상태를 워터마크와 경고로 표시하므로 그대로 재사용하되,
  // 기존 openLoadingReport()의 인증 선행 게이트는 통과하지 않는다.
  return openHtml(buildLoadingReportHtml(container, cargo, result));
}

export function buildPalletWorkOrderHtmlV3(
  container: ContainerSpec,
  cargo: CargoItem[],
  snapshot: PalletWorkOrderSnapshot | null,
): string {
  const result = snapshot?.result;
  const generatedAt = new Date().toLocaleString('ko-KR');
  const cargoMap = new Map(cargo.map(item => [item.id, item]));
  const pallets = result?.pallets ?? [];
  const remaining = result?.remaining ?? cargo
    .filter(item => item.quantity > 0)
    .map(item => ({ cargoId: item.id, quantity: item.quantity, reason: '팔레트 적재 결과 없음' }));
  const validationWarnings = result
    ? [
        result.totalPalletizedWeightKg > container.maxPayloadKg
          ? `총 팔레트화 중량 ${result.totalPalletizedWeightKg.toFixed(0)}kg이 장비 최대중량 ${container.maxPayloadKg.toFixed(0)}kg을 초과합니다.`
          : '',
        result.remaining.length > 0 ? `미적재 화물 ${result.remaining.reduce((sum, item) => sum + item.quantity, 0)}EA가 있습니다.` : '',
      ].filter(Boolean)
    : ['아직 팔레트 적재 결과가 없습니다. 현재 화물 목록 기준으로 빈 작업지시서를 생성했습니다.'];

  const rows = pallets.length
    ? [...pallets]
        .sort((a, b) => a.x - b.x || a.stackColumn - b.stackColumn || a.stackLevel - b.stackLevel || a.palletIndex - b.palletIndex)
        .map((pallet, index) => {
          const counts = new Map<string, number>();
          pallet.cargoPlacements.forEach(box => counts.set(box.cargoId, (counts.get(box.cargoId) ?? 0) + 1));
          const contents = [...counts.entries()]
            .map(([id, qty]) => `${id}${cargoMap.get(id)?.name ? ` ${cargoMap.get(id)!.name}` : ''} ${qty}EA`)
            .join(' · ');
          return `<tr><td>${index + 1}</td><td><b>P${pallet.palletIndex}</b><small>C${pallet.stackColumn} · ${pallet.stackLevel}단</small></td><td>${escapeHtml(contents || '빈 팔레트')}</td><td>${pallet.totalWeightKg.toFixed(0)} kg</td><td>X ${pallet.x.toFixed(2)}m · Y ${pallet.y.toFixed(2)}m · Z ${pallet.z.toFixed(2)}m</td><td class="check">□</td></tr>`;
        }).join('')
    : '<tr><td colspan="6" class="empty">배치된 팔레트가 없습니다.</td></tr>';

  const remainingRows = remaining.length
    ? remaining.map(item => `<tr><td>${escapeHtml(item.cargoId)}</td><td>${item.quantity} EA</td><td>${escapeHtml(item.reason)}</td></tr>`).join('')
    : '<tr><td colspan="3" class="empty">미적재 화물 없음</td></tr>';

  const warningList = validationWarnings.length
    ? validationWarnings.map(item => `<li>${escapeHtml(item)}</li>`).join('')
    : '<li>현재 팔레트 적재 결과에서 즉시 확인할 중량/잔량 경고는 없습니다.</li>';

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>팔레트 적재 작업지시서</title><style>
    @page{size:A4 portrait;margin:9mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,"Noto Sans KR",sans-serif;color:#1d1d1f;font-size:10px}.sheet{max-width:794px;margin:0 auto}.head{display:flex;justify-content:space-between;gap:16px;border-bottom:3px solid #1d1d1f;padding-bottom:10px}.head h1{font-size:24px;margin:0}.head p{margin:5px 0 0;color:#6e6e73}.badge{padding:8px 12px;border:1px solid #f2b35d;border-radius:10px;background:#fff3e2;color:#9a5300;text-align:center}.badge b{display:block;font-size:14px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:9px 0}.summary div{border:1px solid #d2d2d7;border-radius:8px;padding:8px;background:#fbfbfd}.summary span{display:block;color:#6e6e73;font-size:8px}.summary b{display:block;margin-top:3px;font-size:12px}.notice{padding:9px 11px;border-left:4px solid #c86400;background:#fff3e2;line-height:1.5;margin:8px 0}.notice b{display:block;margin-bottom:3px}.direction{text-align:center;padding:7px;border-radius:8px;background:#edf4fe;color:#005bb8;font-weight:800;margin-bottom:8px}h2{font-size:14px;margin:12px 0 5px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #d2d2d7;padding:6px;vertical-align:middle}th{background:#1d1d1f;color:white;font-size:9px}td small{display:block;color:#6e6e73;margin-top:2px}.check{text-align:center;font-size:17px}.empty{text-align:center;color:#98989d;padding:14px}.warnings{margin:0;padding:8px 8px 8px 24px;border:1px solid #ffd7a3;border-radius:8px;background:#fffaf2;line-height:1.5}.footer{margin-top:10px;padding-top:7px;border-top:1px solid #d2d2d7;display:flex;justify-content:space-between;color:#6e6e73;font-size:8px}.sign{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}.sign div{height:45px;border:1px solid #d2d2d7;border-radius:8px;padding:6px;color:#6e6e73}
  </style></head><body><main class="sheet"><header class="head"><div><h1>팔레트 적재 작업지시서</h1><p>${escapeHtml(generatedAt)} · 작업지시서는 적재 품질/관성 평가와 별개로 항상 생성됩니다.</p></div><div class="badge"><span>안전/관성 평가</span><b>현장 확인</b></div></header><section class="summary"><div><span>장비</span><b>${container.length.toFixed(2)} × ${container.width.toFixed(2)} × ${container.height.toFixed(2)}m</b></div><div><span>팔레트</span><b>${result?.palletCount ?? 0} EA</b></div><div><span>적재 화물</span><b>${result?.placements.length ?? 0} EA</b></div><div><span>총 팔레트화 중량</span><b>${result ? `${result.totalPalletizedWeightKg.toFixed(0)} kg` : '-'}</b></div></section><div class="notice"><b>작업 전 확인</b>무게중심·관성 평가는 경고/품질 평가 항목이며 작업지시서 생성을 차단하지 않습니다. 다만 경계, 충돌, 최대중량, 적층 및 포장 강도 같은 실제 안전 제한은 현장에서 반드시 확인해야 합니다.</div><div class="direction">◀ 안쪽부터 · 바닥 1단 먼저 · 같은 C번호는 아래에서 위로 · 문쪽 ▶</div><h2>팔레트 투입 순서</h2><table><thead><tr><th>순서</th><th>팔레트</th><th>내용</th><th>중량</th><th>위치</th><th>완료</th></tr></thead><tbody>${rows}</tbody></table><h2>미적재/잔량</h2><table><thead><tr><th>코드</th><th>수량</th><th>사유</th></tr></thead><tbody>${remainingRows}</tbody></table><h2>안전 확인 메모</h2><ul class="warnings">${warningList}</ul><section class="sign"><div>작업자 확인 / 서명</div><div>검수자 확인 / 서명</div><div>출고 전 최종 확인 / 서명</div></section><footer class="footer"><span>팔레트 규격: ${snapshot ? `${snapshot.spec.length.toFixed(2)} × ${snapshot.spec.width.toFixed(2)}m · 최대 ${snapshot.spec.maxStackLevels}단` : '-'}</span><span>Container Loading Simulator UX v3</span></footer></main></body></html>`;
}

export function openPalletWorkOrderV3(
  container: ContainerSpec,
  cargo: CargoItem[],
  snapshot: PalletWorkOrderSnapshot | null,
): boolean {
  return openHtml(buildPalletWorkOrderHtmlV3(container, cargo, snapshot));
}
