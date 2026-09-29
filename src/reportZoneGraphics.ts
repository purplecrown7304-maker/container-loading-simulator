import type { CargoItem, ContainerSpec, Placement } from './engine/types';
import type { SecuringUsage } from './inertiaCertification';
import { reportEscape as esc, reportTable } from './reportLayout';
import { reportCargoCatalog, type ReportCargoCatalog } from './reportCargo';
import { reportBlocks, type ReportZone } from './reportZones';

const mm = (value: number) => Math.round(value * 1000).toLocaleString('ko-KR');
const identity = (catalog: ReportCargoCatalog, id: string) => catalog.get(id) ?? { code: id, name: id, partial: false, color: '#cbd5e1' };

export function buildZoneOverview(container: ContainerSpec, cargo: CargoItem[], placements: Placement[], zones: ReportZone[], level?: number) {
  const catalog = reportCargoCatalog(cargo);
  const sx = 664 / container.length, sy = 130 / container.width;
  const shapes = zones.flatMap(zone => reportBlocks(placements, zone.indices.filter(i => level === undefined || Math.abs(placements[i].z - level) < .00001))).sort((a, b) => a.z - b.z).map(p => {
    const item = identity(catalog, p.cargoId), x = 48 + p.x * sx, y = 54 + p.y * sy, w = p.length * sx, h = p.width * sy;
    const label = w > Math.max(75, item.code.length * 7) && h > 29 ? `<text x="${x + w / 2}" y="${y + h / 2 - 3}" text-anchor="middle" font-size="11" font-weight="700">${esc(item.code)}</text><text x="${x + w / 2}" y="${y + h / 2 + 12}" text-anchor="middle" font-size="10">${item.partial ? '잔량 ' : ''}${p.count}개</text>` : '';
    return `<g><title>${esc(item.code)}${item.partial ? ' 잔량' : ''} ${p.count}개 · 바닥 높이 ${mm(p.z)} mm</title><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${item.color}" stroke="${item.partial ? '#dc2626' : '#64748b'}" stroke-width="${item.partial ? 2.5 : .7}"/>${label}</g>`;
  }).join('');
  const boundaries = zones.map(zone => {
    const actualX = 48 + (zone.start + zone.end) / 2 * sx;
    // External labels have equal spacing, so narrow door-side zones remain readable.
    const labelX = 48 + (zone.number - .5) * 664 / zones.length;
    return `<line x1="${48 + zone.start * sx}" y1="54" x2="${48 + zone.start * sx}" y2="184" stroke="#334155" stroke-width="1.3"/><path d="M${labelX} 31 L${actualX} 50" stroke="#64748b" fill="none"/><text x="${labelX}" y="24" text-anchor="middle" font-size="12" font-weight="800">${zone.number} ${zone.label}</text>`;
  }).join('');
  const end = Math.max(0, ...placements.map(p => p.x + p.length));
  const doorGap = Math.max(0, container.length - end);
  return `<div class="zone-overview"><svg viewBox="0 0 760 225" role="img" aria-label="구역별 위에서 본 적재도"><rect x="48" y="54" width="664" height="130" fill="#f8fafc" stroke="#64748b"/>${shapes}${boundaries}<line x1="718" x2="718" y1="54" y2="184" stroke="#2563eb" stroke-width="3" stroke-dasharray="6 4"/><text x="48" y="207" font-size="11">안쪽 벽 0 m</text><text x="712" y="207" text-anchor="end" font-size="11" font-weight="700">문 ${container.length.toFixed(2)} m ▶</text></svg><p class="zone-caption">${level === undefined ? '위에서 보이는 최상단 배치' : `바닥 +${mm(level)} mm의 배치`} · 빈 공간은 흰색 · 빨간 테두리는 잔량박스 · 도어 앞 여유 ${mm(doorGap)} mm</p></div>`;
}

export function buildZoneTable(cargo: CargoItem[], placements: Placement[], zones: ReportZone[]) {
  const catalog = reportCargoCatalog(cargo);
  const rows = zones.map(zone => {
    const levels = zone.levels.map((z, index) => {
      const counts = new Map<string, { quantity: number }>();
      for (const i of zone.indices) {
        const p = placements[i];
        if (Math.abs(p.z - z) > .00001) continue;
        const current = counts.get(p.cargoId) ?? { quantity: 0 };
        current.quantity++;
        counts.set(p.cargoId, current);
      }
      return `<div class="zone-level"><b>${index + 1}단 <small>바닥 +${mm(z)} mm</small></b><div>${[...counts].map(([id, value]) => {
        const item = identity(catalog, id);
        return `<span class="zone-item"><i style="background:${item.color}"></i>${esc(item.code)}${item.partial ? ' <em>잔량</em>' : ''} <strong>${value.quantity}개</strong></span>`;
      }).join('')}</div></div>`;
    }).join('');
    const directions = [...new Set(zone.indices.map(i => `${mm(placements[i].length)}×${mm(placements[i].width)}`))];
    return `<tr data-zone="${zone.label}"><td class="zone-number"><b>${zone.number} ${zone.label}</b><small>${zone.start.toFixed(2)} ~ ${zone.end.toFixed(2)} m</small><small>길이×폭 ${directions.join(' / ')} mm</small></td><td>${levels}</td><td><b>${zone.indices.length}개</b><small>${zone.levels.length}단 · 높이 ${mm(zone.height)} mm</small></td><td class="check">□</td></tr>`;
  }).join('');
  return reportTable('구역별 적재 작업 순서', `<table class="zone-table"><colgroup><col style="width:20%"><col style="width:58%"><col style="width:16%"><col style="width:6%"></colgroup><thead><tr><th>구역 · 안쪽 벽 기준</th><th>아래단부터 · 품목 / 수량 / 놓을 방향</th><th>구역 합계</th><th>완료</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><th colspan="2">실제 배치 합계</th><th colspan="2">${placements.length}개</th></tr></tfoot></table>`);
}

export function buildReportLegend(cargo: CargoItem[], placements: Placement[]) {
  const catalog = reportCargoCatalog(cargo);
  const grouped = new Map<string, { color: string; total: number; partial: number; name: string }>();
  for (const p of placements) {
    const item = identity(catalog, p.cargoId);
    const row = grouped.get(item.code) ?? { color: item.color, total: 0, partial: 0, name: item.name };
    row.total++; if (item.partial) row.partial++;
    grouped.set(item.code, row);
  }
  return `<ul class="zone-legend">${[...grouped].map(([code, row]) => `<li><i style="background:${row.color}"></i><b>${esc(code)}</b><span>${row.total}개${row.partial ? ` (잔량 ${row.partial} 포함)` : ''}</span><small>${esc(row.name)}</small></li>`).join('')}</ul>`;
}

export function buildZone3d(container: ContainerSpec, cargo: CargoItem[], placements: Placement[], zones: ReportZone[], active?: number) {
  const catalog = reportCargoCatalog(cargo);
  const scale = 580 / (container.length + container.width * .65);
  const project = (x: number, y: number, z: number) => [65 + (x + y * .65) * scale, 105 + (x * .28 - y * .5 - z * .8) * scale];
  const points = (coords: number[][]) => coords.map(([x, y, z]) => project(x, y, z).map(n => n.toFixed(1)).join(',')).join(' ');
  const floor = points([[0, 0, 0], [container.length, 0, 0], [container.length, container.width, 0], [0, container.width, 0]]);
  const blocks = zones.filter(zone => active === undefined || zone.number <= active).flatMap(zone => reportBlocks(placements, zone.indices).map(p => ({ ...p, zone: zone.number })));
  // Painter order from the far side to the +X/-Y door-side camera.
  blocks.sort((a, b) => a.z - b.z || a.x - b.x || b.y - a.y);
  const shapes = blocks.map(p => {
    const item = identity(catalog, p.cargoId), color = active !== undefined && p.zone < active ? '#cbd5e1' : item.color;
    const { x, y, z, length: l, width: w, height: h } = p;
    const faces = [
      points([[x, y, z], [x + l, y, z], [x + l, y, z + h], [x, y, z + h]]),
      points([[x + l, y, z], [x + l, y + w, z], [x + l, y + w, z + h], [x + l, y, z + h]]),
      points([[x, y, z + h], [x + l, y, z + h], [x + l, y + w, z + h], [x, y + w, z + h]]),
    ];
    return `<g fill="${color}" stroke="${item.partial ? '#dc2626' : '#475569'}" stroke-width="${item.partial ? 2 : .65}"><title>${esc(item.code)} ${p.count}개${item.partial ? ' 잔량' : ''}</title>${faces.map((face, i) => `<polygon points="${face}" fill-opacity="${[.72, .9, 1][i]}"/>`).join('')}</g>`;
  }).join('');
  const loadHeight = Math.max(.1, ...placements.map(p => p.z + p.height));
  const minY = Math.min(...[0, container.length].flatMap(x => [0, container.width].map(y => project(x, y, loadHeight)[1]))) - 22;
  const maxY = project(container.length, 0, 0)[1] + 35;
  const label = active === undefined ? '3D 완료 모습' : `${active} ${zones[active - 1].label} 구역 적재`;
  return `<svg viewBox="30 ${minY} 680 ${maxY - minY}" role="img" aria-label="${label}"><polygon points="${floor}" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.4"/>${shapes}<text x="65" y="${minY + 14}" font-size="13" font-weight="700">${label}</text><text x="65" y="${project(0, 0, 0)[1] + 20}" font-size="11">안쪽 벽</text><text x="${project(container.length, 0, 0)[0]}" y="${maxY - 9}" font-size="12" fill="#1d4ed8" font-weight="700">문 ▶</text></svg>`;
}

export function buildPartialLocations(cargo: CargoItem[], placements: Placement[], zones: ReportZone[]) {
  const catalog = reportCargoCatalog(cargo);
  const rows = zones.flatMap(zone => zone.indices.filter(i => identity(catalog, placements[i].cargoId).partial).map(i => {
    const p = placements[i], item = identity(catalog, p.cargoId);
    return `<li><b>${esc(item.code)} 잔량 1개</b> · ${zone.label} 구역 · 바닥 +${mm(p.z)} mm · 안쪽 벽 ${p.x.toFixed(2)} m / 도면 위쪽 벽 ${p.y.toFixed(2)} m</li>`;
  }));
  return rows.length ? `<div class="partial-locations"><b>잔량박스 위치 · 빨간 테두리</b><ul>${rows.join('')}</ul></div>` : '';
}

export function buildSecuringLocationGuide(container: ContainerSpec, placements: Placement[], securing?: SecuringUsage) {
  if (!securing) return '<p class="technical-note">보조자재 설치 계획 미확인 · 실제 고정 위치는 현장 책임자가 확인하세요.</p>';
  const end = Math.max(0, ...placements.map(p => p.x + p.length));
  const sx = 664 / container.length, sy = 140 / container.width;
  const floor = reportBlocks(placements, placements.flatMap((p, i) => p.z < .00001 ? [i] : [])).map(p => `<rect x="${48 + p.x * sx}" y="${36 + p.y * sy}" width="${p.length * sx}" height="${p.width * sy}" fill="#dbeafe" stroke="#94a3b8"/>`).join('');
  return `<div class="securing-locations"><svg viewBox="0 0 760 218" role="img" aria-label="보조자재 설치 영역 안내"><rect x="48" y="36" width="664" height="140" fill="#fff" stroke="#64748b"/>${floor}${securing.antiSlipMats ? '<text x="50" y="22" font-size="12" fill="#1d4ed8">① 파란 영역: 바닥 화물 접촉면 · 적재 전에 미끄럼방지재</text>' : ''}${securing.dunnageBlocks ? `<rect x="48" y="36" width="664" height="140" fill="none" stroke="#a16207" stroke-width="3" stroke-dasharray="8 5"/><text x="48" y="201" font-size="11">② 벽·화물 사이 및 내부 빈 칸: 유격 확인 후 블로킹</text>` : ''}${securing.loadBars ? `<line x1="${48 + end * sx}" y1="36" x2="${48 + end * sx}" y2="176" stroke="#ea580c" stroke-width="4"/><text x="710" y="201" text-anchor="end" font-size="11" fill="#c2410c">③ 문쪽 끝단 ${end.toFixed(2)} m · 고정바</text>` : ''}</svg><p class="technical-note">표시는 설치 대상 영역입니다. 자재별 치수·정격·결박점 정보가 없어 개별 배치와 높이는 확정하지 않습니다. 블로킹은 잔량 주변의 상단 빈 칸도 확인하고, 현장 책임자가 수량·간섭·고정점을 대조하세요.</p></div>`;
}
