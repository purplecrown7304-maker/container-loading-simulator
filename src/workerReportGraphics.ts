import { cargoColor } from './cargoColors';
import { buildWorkSequence, type WorkStep } from './engine/workSequence';
import type { CargoItem, ContainerSpec, LoadingResult, Placement } from './engine/types';

export type WorkerStepGroup = {
  group: number;
  fromStep: number;
  toStep: number;
  quantity: number;
  cargoId: string;
  label: string;
  zone: WorkStep['zone'];
  layer: number;
  minRow: number;
  maxRow: number;
  minColumn: number;
  maxColumn: number;
  placementIndices: number[];
};

function xml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function shortCode(value: string) {
  return value.length <= 9 ? value : `${value.slice(0, 8)}…`;
}

export function buildWorkerStepGroups(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult): WorkerStepGroup[] {
  const steps = buildWorkSequence(container, cargo, result, 'LOAD');
  const groups: WorkerStepGroup[] = [];

  steps.forEach(step => {
    const current = groups.at(-1);
    const merge = current &&
      current.cargoId === step.cargoId &&
      current.zone === step.zone &&
      current.layer === step.layer;

    if (merge) {
      current.toStep = step.step;
      current.quantity += 1;
      current.minRow = Math.min(current.minRow, step.row);
      current.maxRow = Math.max(current.maxRow, step.row);
      current.minColumn = Math.min(current.minColumn, step.column);
      current.maxColumn = Math.max(current.maxColumn, step.column);
      current.placementIndices.push(step.placementIndex);
      return;
    }

    groups.push({
      group: groups.length + 1,
      fromStep: step.step,
      toStep: step.step,
      quantity: 1,
      cargoId: step.cargoId,
      label: step.label,
      zone: step.zone,
      layer: step.layer,
      minRow: step.row,
      maxRow: step.row,
      minColumn: step.column,
      maxColumn: step.column,
      placementIndices: [step.placementIndex],
    });
  });
  return groups;
}

function groupByPlacement(groups: WorkerStepGroup[]) {
  const map = new Map<number, number>();
  groups.forEach(group => group.placementIndices.forEach(index => map.set(index, group.group)));
  return map;
}

function labelForBox(index: number, placement: Placement, groupMap: Map<number, number>, width: number, height: number) {
  const group = groupMap.get(index);
  if (!group || width < 20 || height < 14) return '';
  const code = width >= 54 && height >= 26 ? `<tspan x="0" dy="12">${xml(shortCode(placement.cargoId))}</tspan>` : '';
  return `<text text-anchor="middle" dominant-baseline="middle" font-size="${width >= 45 ? 11 : 9}" font-weight="800" fill="#172033"><tspan x="0" dy="-2">${group}</tspan>${code}</text>`;
}

function legend(cargo: CargoItem[], result: LoadingResult) {
  const used = [...new Set(result.placements.map(item => item.cargoId))];
  const names = new Map(cargo.map(item => [item.id, item.name]));
  return used.slice(0, 8).map((id, index) => {
    const x = 12 + (index % 4) * 174;
    const y = 12 + Math.floor(index / 4) * 22;
    return `<g transform="translate(${x} ${y})"><rect width="12" height="12" rx="2" fill="${cargoColor(id)}" stroke="#52617a"/><text x="18" y="10" font-size="10" fill="#334155">${xml(shortCode(id))} ${xml(names.get(id) ?? '')}</text></g>`;
  }).join('');
}

export function buildTopViewSvg(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult, groups: WorkerStepGroup[]) {
  const width = 760;
  const height = 250;
  const padX = 44;
  const padY = 34;
  const legendHeight = Math.ceil(Math.min(8, new Set(result.placements.map(item => item.cargoId)).size) / 4) * 22 + 8;
  const plotW = width - padX * 2;
  const plotH = height - padY - legendHeight - 34;
  const groupMap = groupByPlacement(groups);
  const sx = plotW / container.length;
  const sy = plotH / container.width;
  const placements = result.placements.map((placement, index) => ({ placement, index })).sort((a, b) => a.placement.z - b.placement.z);

  const boxes = placements.map(({ placement: p, index }) => {
    const x = padX + p.x * sx;
    const y = padY + p.y * sy;
    const w = Math.max(1.5, p.length * sx);
    const h = Math.max(1.5, p.width * sy);
    return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><rect width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${cargoColor(p.cargoId)}" fill-opacity="${Math.min(0.94, 0.54 + p.z / Math.max(0.1, container.height) * 0.38).toFixed(2)}" stroke="#334155" stroke-width="0.8"/><g transform="translate(${(w / 2).toFixed(1)} ${(h / 2).toFixed(1)})">${labelForBox(index, p, groupMap, w, h)}</g></g>`;
  }).join('');

  const legendY = padY + plotH + 26;
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="컨테이너 위에서 본 적재도" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" rx="14" fill="#f8fafc"/>
    <text x="${padX}" y="20" font-size="13" font-weight="800" fill="#172033">위에서 본 적재도 · 안쪽 → 문쪽</text>
    <rect x="${padX}" y="${padY}" width="${plotW}" height="${plotH}" rx="5" fill="#fff" stroke="#64748b" stroke-width="2"/>
    ${boxes}
    <text x="${padX - 4}" y="${padY + plotH / 2}" text-anchor="end" font-size="10" fill="#64748b">좌/우 폭</text>
    <line x1="${padX + plotW + 8}" y1="${padY}" x2="${padX + plotW + 8}" y2="${padY + plotH}" stroke="#2563eb" stroke-width="4" stroke-dasharray="8 5"/>
    <text x="${padX + plotW - 2}" y="${padY - 8}" text-anchor="end" font-size="12" font-weight="800" fill="#2563eb">문쪽 ▶</text>
    <text x="${padX + 2}" y="${padY - 8}" font-size="12" font-weight="800" fill="#475569">◀ 안쪽</text>
    <g transform="translate(${padX} ${legendY})">${legend(cargo, result)}</g>
  </svg>`;
}

export function buildSideViewSvg(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult, groups: WorkerStepGroup[]) {
  const width = 760;
  const height = 235;
  const padX = 44;
  const padY = 34;
  const plotW = width - padX * 2;
  const plotH = height - padY - 44;
  const groupMap = groupByPlacement(groups);
  const sx = plotW / container.length;
  const sz = plotH / container.height;
  const placements = result.placements.map((placement, index) => ({ placement, index })).sort((a, b) => a.placement.y - b.placement.y);

  const boxes = placements.map(({ placement: p, index }) => {
    const x = padX + p.x * sx;
    const y = padY + plotH - (p.z + p.height) * sz;
    const w = Math.max(1.5, p.length * sx);
    const h = Math.max(1.5, p.height * sz);
    return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><rect width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${cargoColor(p.cargoId)}" fill-opacity="0.78" stroke="#334155" stroke-width="0.8"/><g transform="translate(${(w / 2).toFixed(1)} ${(h / 2).toFixed(1)})">${labelForBox(index, p, groupMap, w, h)}</g></g>`;
  }).join('');

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="컨테이너 옆에서 본 적재도" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" rx="14" fill="#f8fafc"/>
    <text x="${padX}" y="20" font-size="13" font-weight="800" fill="#172033">옆에서 본 적재도 · 바닥부터 위로</text>
    <rect x="${padX}" y="${padY}" width="${plotW}" height="${plotH}" rx="5" fill="#fff" stroke="#64748b" stroke-width="2"/>
    ${boxes}
    <line x1="${padX + plotW + 8}" y1="${padY}" x2="${padX + plotW + 8}" y2="${padY + plotH}" stroke="#2563eb" stroke-width="4" stroke-dasharray="8 5"/>
    <text x="${padX + plotW - 2}" y="${padY - 8}" text-anchor="end" font-size="12" font-weight="800" fill="#2563eb">문쪽 ▶</text>
    <text x="${padX + 2}" y="${padY - 8}" font-size="12" font-weight="800" fill="#475569">◀ 안쪽</text>
    <text x="${padX - 8}" y="${padY + 9}" text-anchor="end" font-size="10" fill="#64748b">천장</text>
    <text x="${padX - 8}" y="${padY + plotH}" text-anchor="end" font-size="10" fill="#64748b">바닥</text>
  </svg>`;
}

function miniTopView(container: ContainerSpec, result: LoadingResult, groups: WorkerStepGroup[], groupLimit: number, title: string) {
  const width = 230;
  const height = 118;
  const padX = 14;
  const padY = 26;
  const plotW = width - 28;
  const plotH = height - 40;
  const sx = plotW / container.length;
  const sy = plotH / container.width;
  const groupMap = groupByPlacement(groups);
  const allowed = new Set(groups.filter(group => group.group <= groupLimit).flatMap(group => group.placementIndices));
  const boxes = result.placements.map((p, index) => ({ p, index })).filter(({ index }) => allowed.has(index)).map(({ p, index }) => {
    const x = padX + p.x * sx;
    const y = padY + p.y * sy;
    const w = Math.max(1.2, p.length * sx);
    const h = Math.max(1.2, p.width * sy);
    const group = groupMap.get(index);
    return `<g><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="1" fill="${cargoColor(p.cargoId)}" fill-opacity="0.84" stroke="#475569" stroke-width="0.5"/>${w > 17 && h > 11 && group ? `<text x="${(x + w / 2).toFixed(1)}" y="${(y + h / 2 + 3).toFixed(1)}" text-anchor="middle" font-size="8" font-weight="800" fill="#172033">${group}</text>` : ''}</g>`;
  }).join('');
  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" rx="10" fill="#f8fafc" stroke="#dbe3ee"/><text x="14" y="17" font-size="10" font-weight="800" fill="#172033">${xml(title)}</text><rect x="${padX}" y="${padY}" width="${plotW}" height="${plotH}" rx="3" fill="#fff" stroke="#94a3b8"/>${boxes}<text x="${width - 15}" y="17" text-anchor="end" font-size="8" font-weight="700" fill="#2563eb">문 ▶</text></svg>`;
}

export function buildProgressSvgs(container: ContainerSpec, result: LoadingResult, groups: WorkerStepGroup[]) {
  if (!groups.length) return [];
  const marks = [
    Math.max(1, Math.ceil(groups.length / 3)),
    Math.max(1, Math.ceil(groups.length * 2 / 3)),
    groups.length,
  ];
  return marks.map((limit, index) => miniTopView(container, result, groups, limit, `${index + 1}단계 · 작업 ${limit}번까지`));
}
