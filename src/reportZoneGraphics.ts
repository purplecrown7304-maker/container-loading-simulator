import { buildWorkInstructionAddresses, buildWorkInstructionRuns, formatWorkAddress, formatWorkRun, workInstructionLegend } from './workInstructionGrid';
import { uiText, uiLocale } from './uiLanguage';
import type { CargoItem, ContainerSpec, Placement } from './engine/types';
import type { SecuringUsage } from './inertiaCertification';
import { reportEscape as esc, reportTable } from './reportLayout';
import { reportCargoCatalog, type ReportCargoCatalog } from './reportCargo';
import { reportBlocks, type ReportZone } from './reportZones';

const mm = (value: number) => Math.round(value * 1000).toLocaleString(uiLocale());
const identity = (catalog: ReportCargoCatalog, id: string) => catalog.get(id) ?? { code: id, name: id, partial: false, color: '#cbd5e1' };

export function buildZoneOverview(container: ContainerSpec, cargo: CargoItem[], placements: Placement[], zones: ReportZone[], level?: number) {
  const catalog = reportCargoCatalog(cargo);
  const sx = 664 / container.length, sy = 130 / container.width;
  const shapes = zones.flatMap(zone => reportBlocks(placements, zone.indices.filter(i => level === undefined || Math.abs(placements[i].z - level) < .00001))).sort((a, b) => a.z - b.z).map(p => {
    const item = identity(catalog, p.cargoId), x = 48 + p.x * sx, y = 54 + p.y * sy, w = p.length * sx, h = p.width * sy;
    const label = w > Math.max(75, item.code.length * 7) && h > 29 ? `<text x="${x + w / 2}" y="${y + h / 2 - 3}" text-anchor="middle" font-size="11" font-weight="700">${esc(item.code)}</text><text x="${x + w / 2}" y="${y + h / 2 + 12}" text-anchor="middle" font-size="10">${uiText("{0}{1}개", [item.partial ? uiText("잔량 ") : '', p.count])}</text>` : '';
    return `<g><title>${uiText("{0}{1} {2}개 · 바닥 높이 {3} mm", [esc(item.code), item.partial ? uiText(" 잔량") : '', p.count, mm(p.z)])}</title><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${item.color}" stroke="${item.partial ? '#dc2626' : '#64748b'}" stroke-width="${item.partial ? 2.5 : .7}"/>${label}</g>`;
  }).join('');
  const boundaries = zones.map(zone => {
    const actualX = 48 + (zone.start + zone.end) / 2 * sx;
    // External labels have equal spacing, so narrow door-side zones remain readable.
    const labelX = 48 + (zone.number - .5) * 664 / zones.length;
    return `<line x1="${48 + zone.start * sx}" y1="54" x2="${48 + zone.start * sx}" y2="184" stroke="#334155" stroke-width="1.3"/><path d="M${labelX} 31 L${actualX} 50" stroke="#64748b" fill="none"/><text x="${labelX}" y="24" text-anchor="middle" font-size="12" font-weight="800">${zone.number} ${zone.label}</text>`;
  }).join('');
  const end = Math.max(0, ...placements.map(p => p.x + p.length));
  const doorGap = Math.max(0, container.length - end);
  return `<div class="zone-overview"><svg viewBox="0 0 760 225" role="img" aria-label="${uiText("구역별 위에서 본 적재도")}"><rect x="48" y="54" width="664" height="130" fill="#f8fafc" stroke="#64748b"/>${shapes}${boundaries}<line x1="718" x2="718" y1="54" y2="184" stroke="#2563eb" stroke-width="3" stroke-dasharray="6 4"/><text x="48" y="207" font-size="11">${uiText("◀ 안쪽 · 1행부터")}</text><text x="712" y="207" text-anchor="end" font-size="11" font-weight="700">${uiText("문쪽 ▶")}</text><text x="48" y="45" font-size="10">${uiText("도면 위: 오른쪽 벽")}</text><text x="380" y="207" text-anchor="middle" font-size="10">${uiText("도면 아래: 왼쪽 벽 · 1열부터")}</text></svg><p class="zone-caption">${uiText("{0} · 빈 공간은 흰색 · 빨간 테두리는 잔량박스 · 도어 앞 여유 {1} mm", [level === undefined ? uiText("위에서 보이는 최상단 배치") : uiText("바닥 +{0} mm의 배치", [mm(level)]), mm(doorGap)])}</p></div>`;
}

export function buildZoneTable(cargo: CargoItem[], placements: Placement[], zones: ReportZone[]) {
  const catalog = reportCargoCatalog(cargo);
  const rows = zones.map(zone => {
    const runs = buildWorkInstructionRuns(placements, zone.indices);
    const instructions = runs.map((run, index) => {
      const item = identity(catalog, run.cargoId), p = placements[run.indices[0]], marker = `${zone.label}-${index + 1}`;
      return `<div class="work-grid-run" data-work-run="${marker}" data-placement-indices="${run.indices.join(',')}" data-quantity="${run.quantity}"><b>${marker}</b><div><strong>${esc(formatWorkRun(run))}</strong><span><i class="cargo-swatch" style="background:${item.color}"></i>${esc(item.code)}${item.name !== item.code ? ` · ${esc(item.name)}` : ''}${item.partial ? ` <em>${uiText("잔량")}</em>` : ''}</span><small>${uiText("놓을 방향: 길이 {0} × 폭 {1} × 높이 {2} mm", [mm(p.length), mm(p.width), mm(p.height)])}</small></div></div>`;
    }).join('');
    return `<tr data-zone="${zone.label}"><td class="zone-number"><b>${zone.number} ${zone.label}</b><small>${uiText("안쪽 → 문쪽")}</small></td><td>${instructions}</td><td><b>${uiText("{0}개", [zone.indices.length])}</b></td><td class="check">□</td></tr>`;
  }).join('');
  return `<p class="work-grid-legend">${esc(workInstructionLegend())}</p>` + reportTable(uiText("구역별 적재 작업 순서"), `<table class="zone-table"><colgroup><col style="width:13%"><col style="width:69%"><col style="width:12%"><col style="width:6%"></colgroup><thead><tr><th>${uiText("작업 구역")}</th><th>${uiText("열 · 행 · 단 / 수량 / 품목")}</th><th>${uiText("구역 합계")}</th><th>${uiText("완료")}</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><th colspan="2">${uiText("실제 배치 합계")}</th><th colspan="2">${uiText("{0}개", [placements.length])}</th></tr></tfoot></table>`);
}

/** Location copy beside the original 3D progress image. The renderer, camera,
 * geometry and color treatment remain unchanged; every item is an exact run.
 */
export function buildZone3dInstructions(cargo: CargoItem[], placements: Placement[], zone: ReportZone): string {
  const catalog = reportCargoCatalog(cargo);
  return `<ul class="zone-3d-instructions">${buildWorkInstructionRuns(placements, zone.indices).map((run, index) => {
    const item = identity(catalog, run.cargoId);
    return `<li data-3d-work-run="${zone.label}-${index + 1}" data-placement-indices="${run.indices.join(',')}" data-quantity="${run.quantity}"><b>${zone.label}-${index + 1}</b> ${esc(formatWorkRun(run))}<small>${esc(item.code)}${item.name !== item.code ? ` · ${esc(item.name)}` : ''}${item.partial ? ` · ${uiText('잔량')}` : ''}</small></li>`;
  }).join('')}</ul>`;
}

/** Cropped per-zone/tier drawings retain real carton edges and empty cells.
 * Run IDs are the same IDs as the work table, not an inferred full-grid count.
 */
export function buildNumberedZonePlans(container: ContainerSpec, cargo: CargoItem[], placements: Placement[], zones: ReportZone[]) {
  const catalog = reportCargoCatalog(cargo), addresses = buildWorkInstructionAddresses(placements);
  return zones.map(zone => {
    const runs = buildWorkInstructionRuns(placements, zone.indices);
    return [...new Set(runs.map(r => r.layer))].map(layer => {
      const active = runs.map((run, index) => ({ run, marker: `${zone.label}-${index + 1}` })).filter(({ run }) => run.layer === layer);
      const sx = 650 / Math.max(.01, zone.end - zone.start), sy = 242 / container.width;
      const callouts: string[] = [];
      const shapes = active.map(({ run, marker }) => {
        const ps = run.indices.map(i => placements[i]), p = ps[0], item = identity(catalog, run.cargoId);
        const x = 58 + (Math.min(...ps.map(p => p.x)) - zone.start) * sx, y = 48 + Math.min(...ps.map(p => p.y)) * sy;
        const w = (Math.max(...ps.map(p => p.x + p.length)) - Math.min(...ps.map(p => p.x))) * sx;
        const h = (Math.max(...ps.map(p => p.y + p.width)) - Math.min(...ps.map(p => p.y))) * sy;
        const boxes = run.indices.map(i => { const p = placements[i]; return `<rect data-placement-index="${i}" x="${58 + (p.x - zone.start) * sx}" y="${48 + p.y * sy}" width="${p.length * sx}" height="${p.width * sy}" fill="${item.color}" stroke="${item.partial ? '#dc2626' : '#64748b'}" stroke-width="${item.partial ? 2 : .65}"><title>${esc(formatWorkAddress(addresses[i]))} · ${esc(item.code)}</title></rect>`; }).join('');
        let label = '';
        if (w >= 32 && h >= 16) label = `<rect x="${x + w / 2 - 17}" y="${y + h / 2 - 8}" width="34" height="16" rx="3" fill="white" fill-opacity=".93"/><text x="${x + w / 2}" y="${y + h / 2 + 3.5}" text-anchor="middle" font-size="10" font-weight="800">${marker}</text>`;
        else { const n = callouts.length, lx = 60 + (n % 6) * 112, ly = 346 + Math.floor(n / 6) * 23; callouts.push(`<path d="M${x + w / 2} ${y + h / 2} L${lx + 15} ${ly - 10}" stroke="#334155" stroke-width=".7" fill="none"/><circle cx="${x + w / 2}" cy="${y + h / 2}" r="2" fill="#172033"/><text x="${lx}" y="${ly}" font-size="10" font-weight="800">${marker}</text>`); }
        return `<g data-work-run="${marker}"><title>${marker}: ${esc(formatWorkRun(run))} · ${esc(item.code)}</title>${boxes}${label}</g>`;
      }).join('');
      const height = 338 + Math.ceil(callouts.length / 6) * 23;
      const description = uiText("{0} 구역 · {1}단", [zone.label, layer]);
      return `<article class="numbered-zone-plan" data-zone="${zone.label}" data-layer="${layer}"><h3>${esc(description)}</h3><svg viewBox="0 0 760 ${height}" role="img" aria-label="${esc(description)}"><rect x="58" y="48" width="650" height="242" fill="#fff" stroke="#475569"/>${shapes}<text x="58" y="19" font-size="11">${uiText("도면 위: 오른쪽 벽")}</text><text x="58" y="312" font-size="11">${uiText("도면 아래: 왼쪽 벽 · 1열부터")}</text><text x="58" y="37" font-size="11">${uiText("◀ 안쪽 · {0}행부터", [Math.min(...active.map(({ run }) => run.rowFrom))])}</text><text x="708" y="37" text-anchor="end" font-size="11">${uiText("문쪽 ▶")}</text>${callouts.join('')}</svg><p class="zone-caption">${uiText("그림 번호를 작업표와 대조하세요. 색칠된 실물 박스만 적재하고 흰 빈칸은 유지합니다.")}</p><ul class="work-grid-plan-key">${active.map(({ run, marker }) => `<li><b>${marker}</b> ${esc(formatWorkRun(run))} · ${esc(identity(catalog, run.cargoId).code)}</li>`).join('')}</ul></article>`;
    }).join('');
  }).join('');
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
  return `<ul class="zone-legend">${[...grouped].map(([code, row]) => `<li><i style="background:${row.color}"></i><b>${esc(code)}</b><span>${uiText("{0}개{1}", [row.total, row.partial ? uiText(" (잔량 {0} 포함)", [row.partial]) : ''])}</span><small>${esc(row.name)}</small></li>`).join('')}</ul>`;
}

export function buildZone3d(container: ContainerSpec, cargo: CargoItem[], placements: Placement[], zones: ReportZone[], active?: number) {
  const catalog = reportCargoCatalog(cargo);
  const scale = 580 / (container.length + container.width * .65);
  const project = (x: number, y: number, z: number) => [65 + (x + y * .65) * scale, 105 + (x * .28 - y * .5 - z * .8) * scale];
  const points = (coords: number[][]) => coords.map(([x, y, z]) => project(x, y, z).map(n => n.toFixed(1)).join(',')).join(' ');
  const floor = points([[0, 0, 0], [container.length, 0, 0], [container.length, container.width, 0], [0, container.width, 0]]);
  const blocks = zones.filter(zone => active === undefined || zone.number <= active).flatMap(zone => {
    // Show actual carton edges for the completed view/current zone; previous zones
    // are merged gray rectangles to keep each progress drawing light and readable.
    const shapes = active === undefined || zone.number === active
      ? zone.indices.map(i => ({ ...placements[i], count: 1 }))
      : reportBlocks(placements, zone.indices);
    return shapes.map(p => ({ ...p, zone: zone.number }));
  });
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
    return `<g fill="${color}" stroke="${item.partial ? '#dc2626' : '#475569'}" stroke-width="${item.partial ? 2 : .65}"><title>${uiText("{0} {1}개{2}", [esc(item.code), p.count, item.partial ? uiText(" 잔량") : ''])}</title>${faces.map((face, i) => `<polygon points="${face}" fill-opacity="${[.72, .9, 1][i]}"/>`).join('')}</g>`;
  }).join('');
  const loadHeight = Math.max(.1, ...placements.map(p => p.z + p.height));
  const minY = Math.min(...[0, container.length].flatMap(x => [0, container.width].map(y => project(x, y, loadHeight)[1]))) - 22;
  const maxY = project(container.length, 0, 0)[1] + 35;
  const label = active === undefined ? uiText("3D 완료 모습") : uiText("{0} {1} 구역 적재", [active, zones[active - 1].label]);
  return `<svg viewBox="30 ${minY} 680 ${maxY - minY}" role="img" aria-label="${label}"><polygon points="${floor}" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.4"/>${shapes}<text x="65" y="${minY + 14}" font-size="13" font-weight="700">${label}</text><text x="65" y="${project(0, 0, 0)[1] + 20}" font-size="11">${uiText("안쪽 벽")}</text><text x="${project(container.length, 0, 0)[0]}" y="${maxY - 9}" font-size="12" fill="#1d4ed8" font-weight="700">${uiText("문 ▶")}</text></svg>`;
}

export function buildPartialLocations(cargo: CargoItem[], placements: Placement[], zones: ReportZone[]) {
  const catalog = reportCargoCatalog(cargo);
  const addresses = buildWorkInstructionAddresses(placements);
  const rows = zones.flatMap(zone => zone.indices.filter(i => identity(catalog, placements[i].cargoId).partial).map(i => {
    const p = placements[i], item = identity(catalog, p.cargoId);
    return `<li><b>${uiText("{0} 잔량 1개", [esc(item.code)])}</b>${uiText(" · {0} 구역 · {1}", [zone.label, esc(formatWorkAddress(addresses[i]))])}<small>${uiText("바닥 +{0} mm", [mm(p.z)])}</small></li>`;
  }));
  return rows.length ? `<div class="partial-locations"><b>${uiText("잔량박스 위치 · 빨간 테두리")}</b><ul>${rows.join('')}</ul></div>` : '';
}

export function buildSecuringLocationGuide(container: ContainerSpec, placements: Placement[], securing?: SecuringUsage) {
  if (!securing) return `<p class="technical-note">${uiText("보조자재 설치 계획 미확인 · 실제 고정 위치는 현장 책임자가 확인하세요.")}</p>`;
  const end = Math.max(0, ...placements.map(p => p.x + p.length));
  const sx = 664 / container.length, sy = 140 / container.width;
  const floor = reportBlocks(placements, placements.flatMap((p, i) => p.z < .00001 ? [i] : [])).map(p => `<rect x="${48 + p.x * sx}" y="${36 + p.y * sy}" width="${p.length * sx}" height="${p.width * sy}" fill="#dbeafe" stroke="#94a3b8"/>`).join('');
  return `<div class="securing-locations"><svg viewBox="0 0 760 218" role="img" aria-label="${uiText("보조자재 설치 영역 안내")}"><rect x="48" y="36" width="664" height="140" fill="#fff" stroke="#64748b"/>${floor}${securing.antiSlipMats ? `<text x="50" y="22" font-size="12" fill="#1d4ed8">${uiText("① 파란 영역: 바닥 화물 접촉면 · 적재 전에 미끄럼방지재")}</text>` : ''}${securing.dunnageBlocks ? `<rect x="48" y="36" width="664" height="140" fill="none" stroke="#a16207" stroke-width="3" stroke-dasharray="8 5"/><text x="48" y="201" font-size="11">${uiText("② 벽·화물 사이 및 내부 빈 칸: 유격 확인 후 블로킹")}</text>` : ''}${securing.loadBars ? `<line x1="${48 + end * sx}" y1="36" x2="${48 + end * sx}" y2="176" stroke="#ea580c" stroke-width="4"/><text x="710" y="201" text-anchor="end" font-size="11" fill="#c2410c">${uiText("③ 문쪽 끝단 {0} m · 고정바", [end.toFixed(2)])}</text>` : ''}</svg><p class="technical-note">${uiText("표시는 설치 대상 영역입니다. 자재별 치수·정격·결박점 정보가 없어 개별 배치와 높이는 확정하지 않습니다. 블로킹은 잔량 주변의 상단 빈 칸도 확인하고, 현장 책임자가 수량·간섭·고정점을 대조하세요.")}</p></div>`;
}
