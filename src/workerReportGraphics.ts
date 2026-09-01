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

/**
 * 작업지시서는 개별 박스 순서가 아니라 수직 높이(Z) 단계별로 단순화한다.
 *
 * 기존 방식은 다음 박스가 같은 SKU일 때만 묶어서 SKU가 교차하면 수십 개 작업으로
 * 잘게 쪼개졌다. 실제 작업자는 바닥부터 한 높이 단계를 완성한 뒤 다음 높이로 올라가는
 * 편이 더 이해하기 쉽고, 아래 지지 박스를 먼저 놓는 안전 원칙도 유지된다.
 *
 * 한 단계 안의 SKU별 수량은 label에 요약하고, 위치는 전체 R/C 범위와 안쪽→문쪽으로
 * 표시한다. 그림 속 모든 박스에는 해당 높이 단계의 같은 번호가 표시된다.
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
        // 화면/인쇄물에서 더 이상 개별 박스 번호를 노출하지 않도록 간단한 단계 번호로 정규화한다.
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
  return marks.map((limit, index) => miniTopView(container, result, groups, limit, `${index + 1}단계 · ${groups[limit - 1]?.layer ?? limit}단까지`));
}
