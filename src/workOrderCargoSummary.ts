import { cargoColor } from './cargoColors';
import type { CargoItem, Placement } from './engine/types';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function loadedCargoCounts(placements: Array<Pick<Placement, 'cargoId'>>): Map<string, number> {
  const counts = new Map<string, number>();
  placements.forEach((placement) => counts.set(placement.cargoId, (counts.get(placement.cargoId) ?? 0) + 1));
  return counts;
}

function boxSvg(item: CargoItem) {
  const color = cargoColor(item.id);
  const max = Math.max(item.length, item.width, item.height, 0.001);
  const frontW = 50 + 22 * (item.length / max);
  const frontH = 28 + 20 * (item.height / max);
  const depth = 10 + 12 * (item.width / max);
  const x = 17;
  const y = 18 + depth;
  const top = `${x},${y} ${x + depth},${y - depth} ${x + frontW + depth},${y - depth} ${x + frontW},${y}`;
  const side = `${x + frontW},${y} ${x + frontW + depth},${y - depth} ${x + frontW + depth},${y + frontH - depth} ${x + frontW},${y + frontH}`;
  return `<svg viewBox="0 0 112 82" aria-label="${escapeHtml(item.id)} 상자 이미지" role="img">
    <polygon points="${top}" fill="${color}" fill-opacity=".72" stroke="#475569" stroke-width="1.4"/>
    <polygon points="${side}" fill="${color}" fill-opacity=".50" stroke="#475569" stroke-width="1.4"/>
    <rect x="${x}" y="${y}" width="${frontW}" height="${frontH}" rx="2" fill="${color}" stroke="#475569" stroke-width="1.4"/>
    <rect x="${x + frontW * .28}" y="${y + frontH * .25}" width="${frontW * .44}" height="${frontH * .36}" rx="2" fill="#fff" fill-opacity=".9" stroke="#cbd5e1"/>
    <text x="${x + frontW / 2}" y="${y + frontH * .49}" text-anchor="middle" dominant-baseline="middle" font-size="7" font-weight="800" fill="#334155">${escapeHtml(item.id)}</text>
  </svg>`;
}

export function buildWorkOrderCargoSummary(cargo: CargoItem[], counts: Map<string, number>): string {
  const items = cargo.filter((item) => (counts.get(item.id) ?? 0) > 0);
  if (!items.length) return '';
  const cards = items.map((item) => {
    const quantity = counts.get(item.id) ?? 0;
    const size = `${Math.round(item.length * 1000).toLocaleString()} × ${Math.round(item.width * 1000).toLocaleString()} × ${Math.round(item.height * 1000).toLocaleString()} mm`;
    return `<article class="cargo-intake-card">
      <div class="cargo-intake-image">${boxSvg(item)}</div>
      <div class="cargo-intake-info"><b>${escapeHtml(item.id)}</b><span>${escapeHtml(item.name)}</span><strong>${quantity.toLocaleString()} EA</strong><small>${escapeHtml(size)}</small></div>
    </article>`;
  }).join('');
  return `<section class="cargo-intake"><div class="cargo-intake-title"><h2>투입 상자</h2><span>실제 최종 적재 수량 기준</span></div><div class="cargo-intake-grid">${cards}</div></section>`;
}

export const WORK_ORDER_CARGO_SUMMARY_CSS = `
.cargo-intake{margin:8px 0 9px}.cargo-intake-title{display:flex;align-items:end;justify-content:space-between;gap:8px;margin-bottom:5px}.cargo-intake-title h2{font-size:14px}.cargo-intake-title span{font-size:8px;color:#64748b}.cargo-intake-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}.cargo-intake-card{display:grid;grid-template-columns:72px minmax(0,1fr);align-items:center;gap:6px;min-width:0;padding:5px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;break-inside:avoid}.cargo-intake-image{display:grid;place-items:center;height:58px;border-radius:6px;background:#f8fafc;overflow:hidden}.cargo-intake-image svg{width:72px;height:54px;display:block}.cargo-intake-info{display:flex;flex-direction:column;min-width:0;gap:1px}.cargo-intake-info b{font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cargo-intake-info span{font-size:7.5px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cargo-intake-info strong{margin-top:1px;font-size:11px;color:#1d4ed8}.cargo-intake-info small{font-size:7px;color:#475569;line-height:1.25}@media(max-width:700px){.cargo-intake-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}`;
