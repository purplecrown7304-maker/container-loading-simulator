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
  const color = cargoColor(item.id, item.displayColor);
  const max = Math.max(item.length, item.width, item.height, 0.001);
  const frontW = 50 + 22 * (item.length / max);
  const frontH = 28 + 20 * (item.height / max);
  const depth = 10 + 12 * (item.width / max);
  const x = 17;
  const y = 18 + depth;
  const top = `${x},${y} ${x + depth},${y - depth} ${x + frontW + depth},${y - depth} ${x + frontW},${y}`;
  const side = `${x + frontW},${y} ${x + frontW + depth},${y - depth} ${x + frontW + depth},${y + frontH - depth} ${x + frontW},${y + frontH}`;
  return `<svg viewBox="0 0 112 82" aria-label="${escapeHtml(item.id)} 적재단위 이미지" role="img">
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
  return `<section class="cargo-intake"><div class="cargo-intake-title"><h3>투입 적재단위</h3><span>실제 최종 적재 수량 기준</span></div><div class="cargo-intake-grid">${cards}</div></section>`;
}
