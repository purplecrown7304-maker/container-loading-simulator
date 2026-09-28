import { cargoColor } from './cargoColors';
import { buildWorkSequence } from './engine/workSequence';
import type { CargoItem, ContainerSpec, LoadingResult, Placement } from './engine/types';

export type WorkerStepGroup = {
  group: number;
  fromStep: number;
  toStep: number;
  quantity: number;
  cargoId: string;
  label: string;
  zone: string;
  layer: number;
  minRow: number;
  maxRow: number;
  minColumn: number;
  maxColumn: number;
  placementIndices: number[];
};

const EPS = 1e-6;
const round3 = (value: number) => Math.round(value * 1000) / 1000;

function xml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function shortCode(value: string, max = 12) {
  return value.length <= max ? value : `${value.slice(0, Math.max(1, max - 1))}…`;
}

function shortLabel(value: string, max = 24) {
  return value.length <= max ? value : `${value.slice(0, Math.max(1, max - 1))}…`;
}

/**
 * 작업지시서는 개별 박스 순서가 아니라 수직 높이(Z) 단계별로 단순화한다.
 * 한 단계 안에서는 안쪽→문쪽, 바닥→위 순서를 유지하고 같은 높이의 SKU별
 * 수량을 한 묶음으로 보여준다.
 */
export function buildWorkerStepGroups(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult): WorkerStepGroup[] {
  const steps = buildWorkSequence(container, cargo, result, 'LOAD');
  const cargoNames = new Map(cargo.map(item => [item.id, item.name]));
  const byLayer = new Map<number, {
    firstStep: number;
    lastStep: number;
    minRow: number;
    maxRow: number;
    minColumn: number;
    maxColumn: number;
    placementIndices: number[];
    counts: Map<string, number>;
  }>();

  for (const step of steps) {
    const current = byLayer.get(step.layer) ?? {
      firstStep: step.step,
      lastStep: step.step,
      minRow: step.row,
      maxRow: step.row,
      minColumn: step.column,
      maxColumn: step.column,
      placementIndices: [],
      counts: new Map<string, number>(),
    };
    current.firstStep = Math.min(current.firstStep, step.step);
    current.lastStep = Math.max(current.lastStep, step.step);
    current.minRow = Math.min(current.minRow, step.row);
    current.maxRow = Math.max(current.maxRow, step.row);
    current.minColumn = Math.min(current.minColumn, step.column);
    current.maxColumn = Math.max(current.maxColumn, step.column);
    current.placementIndices.push(step.placementIndex);
    current.counts.set(step.cargoId, (current.counts.get(step.cargoId) ?? 0) + 1);
    byLayer.set(step.layer, current);
  }

  return [...byLayer.entries()]
    .sort(([layerA, a], [layerB, b]) => layerA - layerB || a.firstStep - b.firstStep)
    .map(([layer, value], index) => {
      const breakdown = [...value.counts.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, count]) => {
          const name = cargoNames.get(id);
          return `${id}${name && name !== id ? `(${name})` : ''} ${count}EA`;
        })
        .join(' · ');
      const quantity = [...value.counts.values()].reduce((sum, count) => sum + count, 0);
      const group = index + 1;
      return {
        group,
        fromStep: group,
        toStep: group,
        quantity,
        cargoId: `${layer}단 전체`,
        label: breakdown,
        zone: '안쪽 → 문쪽',
        layer,
        minRow: value.minRow,
        maxRow: value.maxRow,
        minColumn: value.minColumn,
        maxColumn: value.maxColumn,
        placementIndices: value.placementIndices,
      };
    });
}

function groupByPlacement(groups: WorkerStepGroup[]) {
  const map = new Map<number, number>();
  groups.forEach(group => group.placementIndices.forEach(index => map.set(index, group.group)));
  return map;
}

function occupiedXRange(container: ContainerSpec, placements: Placement[]) {
  if (!placements.length) return { min: 0, max: container.length, viewMin: 0, viewMax: container.length, zoomed: false };
  const min = Math.max(0, Math.min(...placements.map(p => p.x)));
  const max = Math.min(container.length, Math.max(...placements.map(p => p.x + p.length)));
  const span = Math.max(EPS, max - min);
  // 화물이 컨테이너 길이의 70% 미만만 차지하면 작업자가 읽을 수 있도록 확대한다.
  if (span >= container.length * 0.7) return { min, max, viewMin: 0, viewMax: container.length, zoomed: false };
  const padding = Math.max(0.22, Math.min(container.length * 0.08, span * 0.22));
  let viewMin = Math.max(0, min - padding);
  let viewMax = Math.min(container.length, max + padding);
  const minimumWindow = Math.min(container.length, Math.max(1.4, span * 1.35));
  if (viewMax - viewMin < minimumWindow) {
    const center = (viewMin + viewMax) / 2;
    viewMin = Math.max(0, center - minimumWindow / 2);
    viewMax = Math.min(container.length, viewMin + minimumWindow);
    viewMin = Math.max(0, viewMax - minimumWindow);
  }
  return { min, max, viewMin, viewMax, zoomed: true };
}

function occupiedZMax(container: ContainerSpec, placements: Placement[]) {
  const max = Math.max(0, ...placements.map(p => p.z + p.height));
  if (max <= EPS || max >= container.height * 0.76) return container.height;
  return Math.min(container.height, Math.max(0.8, max * 1.16));
}

function positionStrip(
  container: ContainerSpec,
  range: ReturnType<typeof occupiedXRange>,
  x: number,
  y: number,
  width: number,
) {
  const fullX = (value: number) => x + value / Math.max(EPS, container.length) * width;
  const occupiedX = fullX(range.min);
  const occupiedW = Math.max(2, fullX(range.max) - occupiedX);
  const viewX = fullX(range.viewMin);
  const viewW = Math.max(2, fullX(range.viewMax) - viewX);
  return `
    <g aria-label="전체 장비에서 확대 위치">
      <text x="${x}" y="${y - 7}" font-size="9" font-weight="700" fill="#64748b">전체 ${container.length.toFixed(2)}m 중 배치 위치 ${range.min.toFixed(2)}~${range.max.toFixed(2)}m${range.zoomed ? ' · 위 그림은 확대 표시' : ''}</text>
      <rect x="${x}" y="${y}" width="${width}" height="10" rx="5" fill="#e2e8f0"/>
      <rect x="${occupiedX.toFixed(1)}" y="${y}" width="${occupiedW.toFixed(1)}" height="10" rx="5" fill="#60a5fa"/>
      ${range.zoomed ? `<rect x="${viewX.toFixed(1)}" y="${(y - 3).toFixed(1)}" width="${viewW.toFixed(1)}" height="16" rx="4" fill="none" stroke="#1d4ed8" stroke-width="1.5"/>` : ''}
      <text x="${x}" y="${y + 24}" font-size="8" fill="#64748b">안쪽 0m</text>
      <text x="${x + width}" y="${y + 24}" text-anchor="end" font-size="8" fill="#2563eb">문쪽 ${container.length.toFixed(2)}m ▶</text>
    </g>`;
}

function legend(cargo: CargoItem[], result: LoadingResult) {
  const used = [...new Set(result.placements.map(item => item.cargoId))].slice(0, 8);
  const names = new Map(cargo.map(item => [item.id, item.name]));
  return used.map((id, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = 8 + column * 330;
    const y = 8 + row * 20;
    const name = names.get(id) ?? '';
    const label = `${shortCode(id, 15)}${name ? ` · ${shortLabel(name, 26)}` : ''}`;
    return `<g transform="translate(${x} ${y})"><rect width="12" height="12" rx="2" fill="${cargoColor(id)}" stroke="#52617a"/><text x="18" y="10" font-size="9" fill="#334155">${xml(label)}</text></g>`;
  }).join('');
}

type TopCell = {
  x: number; y: number; length: number; width: number;
  indices: number[];
  top: Placement;
};

function topCells(result: LoadingResult): TopCell[] {
  const map = new Map<string, TopCell>();
  result.placements.forEach((p, index) => {
    const key = [round3(p.x), round3(p.y), round3(p.length), round3(p.width)].join('|');
    const current = map.get(key);
    if (!current) {
      map.set(key, { x: p.x, y: p.y, length: p.length, width: p.width, indices: [index], top: p });
      return;
    }
    current.indices.push(index);
    if (p.z + p.height > current.top.z + current.top.height) current.top = p;
  });
  return [...map.values()].sort((a, b) => a.x - b.x || a.y - b.y);
}

function groupsForIndices(indices: number[], groupMap: Map<number, number>) {
  return [...new Set(indices.map(index => groupMap.get(index)).filter((value): value is number => Boolean(value)))].sort((a, b) => a - b);
}

export function buildTopViewSvg(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult, groups: WorkerStepGroup[]) {
  const width = 760;
  const height = 330;
  const padX = 48;
  const padY = 40;
  const legendRows = Math.ceil(Math.min(8, new Set(result.placements.map(item => item.cargoId)).size) / 2);
  const legendHeight = Math.max(28, legendRows * 20 + 8);
  const stripHeight = 42;
  const plotW = width - padX * 2;
  const plotH = height - padY - legendHeight - stripHeight - 28;
  const groupMap = groupByPlacement(groups);
  const range = occupiedXRange(container, result.placements);
  const viewLength = Math.max(EPS, range.viewMax - range.viewMin);
  const sx = plotW / viewLength;
  const sy = plotH / Math.max(EPS, container.width);

  const boxes = topCells(result).map(cell => {
    const x = padX + (cell.x - range.viewMin) * sx;
    const y = padY + cell.y * sy;
    const w = Math.max(2, cell.length * sx);
    const h = Math.max(2, cell.width * sy);
    const stackGroups = groupsForIndices(cell.indices, groupMap);
    const groupText = stackGroups.length <= 3 ? stackGroups.join('→') : `${stackGroups[0]}…${stackGroups[stackGroups.length - 1]}`;
    const levels = cell.indices.length;
    const label = w >= 34 && h >= 22
      ? `<text x="${(x + w / 2).toFixed(1)}" y="${(y + h / 2 - 2).toFixed(1)}" text-anchor="middle" font-size="${w >= 55 ? 11 : 9}" font-weight="900" fill="#172033">${xml(groupText || shortCode(cell.top.cargoId))}</text>${levels > 1 ? `<text x="${(x + w - 4).toFixed(1)}" y="${(y + h - 5).toFixed(1)}" text-anchor="end" font-size="8" font-weight="800" fill="#475569">×${levels}단</text>` : ''}`
      : '';
    return `<g><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${cargoColor(cell.top.cargoId)}" fill-opacity=".82" stroke="#334155" stroke-width="1"/>${label}</g>`;
  }).join('');

  const stripY = padY + plotH + 30;
  const legendY = stripY + stripHeight;
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="컨테이너 위에서 본 적재도" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" rx="14" fill="#f8fafc"/>
    <text x="${padX}" y="20" font-size="13" font-weight="800" fill="#172033">위에서 본 배치 상세 · 폭 위치 + 적층단 표시</text>
    <text x="${width - padX}" y="20" text-anchor="end" font-size="10" font-weight="700" fill="#64748b">표시 X ${range.viewMin.toFixed(2)}~${range.viewMax.toFixed(2)}m</text>
    <rect x="${padX}" y="${padY}" width="${plotW}" height="${plotH}" rx="6" fill="#fff" stroke="#64748b" stroke-width="2"/>
    ${boxes}
    <text x="${padX - 6}" y="${padY + plotH / 2}" text-anchor="end" font-size="10" fill="#64748b">좌/우 폭</text>
    <text x="${padX + 2}" y="${padY - 8}" font-size="11" font-weight="800" fill="#475569">◀ 안쪽 방향</text>
    <text x="${padX + plotW - 2}" y="${padY - 8}" text-anchor="end" font-size="11" font-weight="800" fill="#2563eb">문쪽 방향 ▶</text>
    ${positionStrip(container, range, padX, stripY, plotW)}
    <g transform="translate(${padX} ${legendY})">${legend(cargo, result)}</g>
  </svg>`;
}

type SideCell = {
  x: number; z: number; length: number; height: number;
  indices: number[];
  representative: Placement;
};

function sideCells(result: LoadingResult): SideCell[] {
  const map = new Map<string, SideCell>();
  result.placements.forEach((p, index) => {
    const key = [round3(p.x), round3(p.z), round3(p.length), round3(p.height), p.cargoId].join('|');
    const current = map.get(key);
    if (!current) {
      map.set(key, { x: p.x, z: p.z, length: p.length, height: p.height, indices: [index], representative: p });
      return;
    }
    current.indices.push(index);
  });
  return [...map.values()].sort((a, b) => a.x - b.x || a.z - b.z);
}

export function buildSideViewSvg(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult, groups: WorkerStepGroup[]) {
  const width = 760;
  const height = 285;
  const padX = 48;
  const padY = 40;
  const stripHeight = 42;
  const plotW = width - padX * 2;
  const plotH = height - padY - stripHeight - 42;
  const groupMap = groupByPlacement(groups);
  const range = occupiedXRange(container, result.placements);
  const viewZ = occupiedZMax(container, result.placements);
  const sx = plotW / Math.max(EPS, range.viewMax - range.viewMin);
  const sz = plotH / Math.max(EPS, viewZ);

  const boxes = sideCells(result).map(cell => {
    const p = cell.representative;
    const x = padX + (cell.x - range.viewMin) * sx;
    const y = padY + plotH - (cell.z + cell.height) * sz;
    const w = Math.max(2, cell.length * sx);
    const h = Math.max(2, cell.height * sz);
    const stackGroups = groupsForIndices(cell.indices, groupMap);
    const groupText = stackGroups.length ? stackGroups.join('/') : '';
    const acrossWidth = cell.indices.length;
    const text = w >= 36 && h >= 18
      ? `<text x="${(x + w / 2).toFixed(1)}" y="${(y + h / 2 + 3).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="900" fill="#172033">${xml(groupText || shortCode(p.cargoId))}</text>${acrossWidth > 1 ? `<text x="${(x + w - 4).toFixed(1)}" y="${(y + 10).toFixed(1)}" text-anchor="end" font-size="8" font-weight="800" fill="#475569">폭방향 ×${acrossWidth}</text>` : ''}`
      : '';
    return `<g><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${cargoColor(p.cargoId)}" fill-opacity=".8" stroke="#334155" stroke-width="1"/>${text}</g>`;
  }).join('');

  const stripY = padY + plotH + 26;
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="컨테이너 옆에서 본 적재도" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" rx="14" fill="#f8fafc"/>
    <text x="${padX}" y="20" font-size="13" font-weight="800" fill="#172033">옆에서 본 적층 상세 · 바닥부터 위로</text>
    <text x="${width - padX}" y="20" text-anchor="end" font-size="10" font-weight="700" fill="#64748b">높이 표시 0~${viewZ.toFixed(2)}m</text>
    <rect x="${padX}" y="${padY}" width="${plotW}" height="${plotH}" rx="6" fill="#fff" stroke="#64748b" stroke-width="2"/>
    ${boxes}
    <text x="${padX + 2}" y="${padY - 8}" font-size="11" font-weight="800" fill="#475569">◀ 안쪽 방향</text>
    <text x="${padX + plotW - 2}" y="${padY - 8}" text-anchor="end" font-size="11" font-weight="800" fill="#2563eb">문쪽 방향 ▶</text>
    <text x="${padX - 8}" y="${padY + 9}" text-anchor="end" font-size="10" fill="#64748b">${viewZ.toFixed(1)}m</text>
    <text x="${padX - 8}" y="${padY + plotH}" text-anchor="end" font-size="10" fill="#64748b">바닥</text>
    ${positionStrip(container, range, padX, stripY, plotW)}
  </svg>`;
}

function miniTopView(container: ContainerSpec, result: LoadingResult, groups: WorkerStepGroup[], groupLimit: number, title: string) {
  const width = 230;
  const height = 126;
  const padX = 14;
  const padY = 28;
  const plotW = width - 28;
  const plotH = height - 47;
  const groupMap = groupByPlacement(groups);
  const allowed = new Set(groups.filter(group => group.group <= groupLimit).flatMap(group => group.placementIndices));
  const subset = result.placements.filter((_, index) => allowed.has(index));
  const range = occupiedXRange(container, subset);
  const sx = plotW / Math.max(EPS, range.viewMax - range.viewMin);
  const sy = plotH / Math.max(EPS, container.width);

  const cells = new Map<string, { p: Placement; indices: number[] }>();
  result.placements.forEach((p, index) => {
    if (!allowed.has(index)) return;
    const key = [round3(p.x), round3(p.y), round3(p.length), round3(p.width)].join('|');
    const current = cells.get(key);
    if (!current || p.z >= current.p.z) cells.set(key, { p, indices: [...(current?.indices ?? []), index] });
    else current.indices.push(index);
  });

  const boxes = [...cells.values()].map(({ p, indices }) => {
    const x = padX + (p.x - range.viewMin) * sx;
    const y = padY + p.y * sy;
    const w = Math.max(1.5, p.length * sx);
    const h = Math.max(1.5, p.width * sy);
    const stackGroups = groupsForIndices(indices, groupMap);
    const label = stackGroups[stackGroups.length - 1];
    return `<g><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="1" fill="${cargoColor(p.cargoId)}" fill-opacity=".84" stroke="#475569" stroke-width="0.6"/>${w > 19 && h > 12 && label ? `<text x="${(x + w / 2).toFixed(1)}" y="${(y + h / 2 + 3).toFixed(1)}" text-anchor="middle" font-size="8" font-weight="800" fill="#172033">${label}</text>` : ''}</g>`;
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
  return marks.map((limit, index) => miniTopView(container, result, groups, limit, `${index + 1}단계 · ${groups[limit - 1]?.layer ?? limit}단까지`));
}
