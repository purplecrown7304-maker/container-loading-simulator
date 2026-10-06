import { floorLoadLayerCap, configuredFloorLoadLimit } from './floorLoadLimit';
import { heavyInnerStrictUnloading } from './heavyInnerPolicy';
import { floorOrientations, pinwheelBlock } from './heavyInnerBlockPacker';
import type { CargoItem, ContainerSpec, Placement } from './types';
import type { StrictWallOutput, StrictWallStrategy } from './strictWallPacker';

const EPS = 1e-8;
const fit = (room: number, size: number) => Math.max(0, Math.floor((room + EPS) / size));
const round = (value: number) => Math.round(value * 1e9) / 1e9;
type Slot = { dx: number; dy: number; length: number; width: number; rotated: boolean };
type Column = Slot & { x: number; y: number; boxes: CargoItem[]; height: number; weight: number };
type Part = { item: CargoItem; quantity: number };
export type LevelVariant = 'sequential' | 'centered';

const footprintKey = (item: CargoItem) => `${Math.min(item.length, item.width).toFixed(4)}x${Math.max(item.length, item.width).toFixed(4)}|${floorOrientations(item).map(o => Number(o.rotated)).join('')}`;

function floorPattern(item: CargoItem, width: number) {
  const orientations = floorOrientations(item);
  const pw = orientations.length === 2 ? pinwheelBlock(item, width) : null;
  if (pw) return { depth: pw.depth, slots: pw.positions as Slot[] };
  let best: { depth: number; slots: Slot[]; density: number } | null = null;
  for (const o of orientations) {
    const columns = fit(width, o.width);
    if (!columns) continue;
    const density = columns / o.length;
    if (!best || density > best.density + EPS) best = { depth: o.length, density, slots: Array.from({ length: columns }, (_, c) => ({ dx: 0, dy: c * o.width, length: o.length, width: o.width, rotated: o.rotated })) };
  }
  return best;
}

function accepts(container: ContainerSpec, column: Column, item: CargoItem, heightCap: number) {
  if (column.height + item.height > Math.min(heightCap, container.height) + 1e-6) return false;
  const position = column.boxes.length + 1;
  if (position > 1 && item.floorOnly) return false;
  if (position > (item.strengthUnverified ? 1 : item.maxStackLayers ?? Infinity)) return false;
  const limit = configuredFloorLoadLimit(container);
  if (limit !== undefined && (column.weight + item.weightKg) / (column.length * column.width) > limit + 1e-9) return false;
  let above = item.weightKg;
  for (let i = column.boxes.length - 1; i >= 0; i--) {
    const base = column.boxes[i];
    if (base.strengthUnverified) return false;
    if (position - i > (base.maxStackLayers ?? Infinity)) return false;
    if (base.maxTopLoadKg != null && above > base.maxTopLoadKg + 1e-6) return false;
    if (base.maxTopPressureKgPerM2 != null && above > base.maxTopPressureKgPerM2 * base.length * base.width + 1e-6) return false;
    above += base.weightKg;
  }
  return true;
}

/** One footprint class: heaviest cartons form the lowest tiers across every used column. */
function buildZone(container: ContainerSpec, parts: Part[], xStart: number, heightCap: number, payloadLeft: number) {
  const pattern = floorPattern(parts[0].item, container.width);
  const none = { placements: [] as Placement[], used: new Map<string, number>(), xEnd: xStart, weight: 0, columns: [] as Column[], slotsPerBlock: 1 };
  if (!pattern) return none;
  const cover = Math.max(...pattern.slots.map(s => s.dy + s.width));
  const y0 = (container.width - cover) / 2;
  const blocks = fit(container.length - xStart, pattern.depth);
  const all: Array<Slot & { x: number; y: number }> = [];
  for (let b = 0; b < blocks; b++) for (const slot of pattern.slots) all.push({ ...slot, x: round(xStart + b * pattern.depth + slot.dx), y: round(y0 + slot.dy) });
  if (!all.length) return none;
  const sorted = [...parts].sort((a, b) => b.item.weightKg - a.item.weightKg || a.item.id.localeCompare(b.item.id));
  const attempt = (count: number) => {
    const columns: Column[] = all.slice(0, count).map(slot => ({ ...slot, boxes: [], height: 0, weight: 0 }));
    const left = sorted.map(part => part.quantity);
    let weight = 0, placed = 0, cursor = 0;
    for (let s = 0; s < sorted.length; s++) {
      const item = sorted[s].item;
      let misses = 0;
      while (left[s] > 0 && misses < columns.length) {
        const column = columns[cursor];
        cursor = (cursor + 1) % columns.length;
        if (weight + item.weightKg > payloadLeft + 1e-6) { misses = columns.length; break; }
        if (!accepts(container, column, item, heightCap)) { misses++; continue; }
        column.boxes.push(item); column.height = round(column.height + item.height); column.weight += item.weightKg;
        weight += item.weightKg; left[s]--; placed++; misses = 0;
      }
    }
    return { columns, placed, weight, left };
  };
  const most = attempt(all.length).placed;
  let lo = 1, hi = all.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (attempt(mid).placed >= most) hi = mid; else lo = mid + 1; }
  const best = attempt(lo);
  const placements: Placement[] = [];
  const used = new Map<string, number>();
  let xEnd = xStart;
  for (const column of best.columns) {
    let z = 0;
    for (const item of column.boxes) {
      placements.push({ cargoId: item.id, x: column.x, y: column.y, z: round(z), length: column.length, width: column.width, height: item.height, weightKg: item.weightKg, rotated: column.rotated });
      used.set(item.id, (used.get(item.id) ?? 0) + 1);
      z += item.height;
    }
    if (column.boxes.length) xEnd = Math.max(xEnd, column.x + column.length);
  }
  return { placements, used, xEnd: round(xEnd), weight: best.weight, columns: best.columns, slotsPerBlock: pattern.slots.length };
}

type Deck = { x: number; y: number; z: number; length: number; width: number; lower: Column[]; stop: number };

/** Flat, gap-free tops of complete blocks become decks for lighter cargo of another footprint. */
function decksOf(columns: Column[], slotsPerBlock: number, stop: number): Deck[] {
  const decks: Deck[] = [];
  for (let start = 0; start + slotsPerBlock <= columns.length; start += slotsPerBlock) {
    const block = columns.slice(start, start + slotsPerBlock);
    const height = block[0].height;
    if (height <= EPS || block.some(c => Math.abs(c.height - height) > 1e-6)) continue;
    const x = Math.min(...block.map(c => c.x)), xEnd = Math.max(...block.map(c => c.x + c.length));
    const y = Math.min(...block.map(c => c.y)), yEnd = Math.max(...block.map(c => c.y + c.width));
    if (Math.abs(block.reduce((s, c) => s + c.length * c.width, 0) - (xEnd - x) * (yEnd - y)) > 1e-6) continue;
    const last = decks.at(-1);
    if (last && Math.abs(last.z - height) < 1e-6 && Math.abs(last.x + last.length - x) < 1e-6 && Math.abs(last.y - y) < 1e-6 && Math.abs(last.width - (yEnd - y)) < 1e-6) {
      last.length = round(xEnd - last.x); last.lower.push(...block);
    } else decks.push({ x, y, z: height, length: round(xEnd - x), width: round(yEnd - y), lower: [...block], stop });
  }
  return decks;
}

/** Lighter cartons on a deck. Every touched lower column carries the whole upper load (conservative). */
function fillDeck(container: ContainerSpec, deck: Deck, parts: Part[], payloadLeft: number) {
  const result = { placements: [] as Placement[], used: new Map<string, number>(), weight: 0 };
  const pattern = floorPattern(parts[0].item, deck.width);
  if (!pattern) return result;
  const cover = Math.max(...pattern.slots.map(s => s.dy + s.width));
  const y0 = deck.y + (deck.width - cover) / 2;
  const limit = configuredFloorLoadLimit(container);
  const extra = new Float64Array(deck.lower.length), extraDensity = new Float64Array(deck.lower.length), extraLayers = new Int32Array(deck.lower.length);
  const columns: Array<Column & { under: number[] }> = [];
  for (let b = 0; b < fit(deck.length, pattern.depth); b++) for (const slot of pattern.slots) {
    const x = round(deck.x + b * pattern.depth + slot.dx), y = round(y0 + slot.dy);
    const under = deck.lower.flatMap((c, i) => Math.min(x + slot.length, c.x + c.length) - Math.max(x, c.x) > 1e-6 && Math.min(y + slot.width, c.y + c.width) - Math.max(y, c.y) > 1e-6 ? [i] : []);
    columns.push({ ...slot, x, y, boxes: [], height: 0, weight: 0, under });
  }
  const lightestTop = (i: number) => deck.lower[i].boxes.at(-1)!.weightKg;
  const sorted = [...parts].sort((a, b) => b.item.weightKg - a.item.weightKg || a.item.id.localeCompare(b.item.id));
  for (const part of sorted) {
    const item = part.item;
    let left = part.quantity, misses = 0, cursor = 0;
    if (item.floorOnly || !columns.length) continue;
    while (left > 0 && misses < columns.length) {
      const column = columns[cursor];
      cursor = (cursor + 1) % columns.length;
      const area = column.length * column.width;
      let ok = result.weight + item.weightKg <= payloadLeft + 1e-6 && deck.z + column.height + item.height <= container.height + 1e-6
        && accepts({ ...container, floorLoadLimitKgPerM2: undefined }, column, item, Infinity);
      if (ok) for (const i of column.under) {
        const lower = deck.lower[i];
        if (item.weightKg > lightestTop(i) + 1e-6) { ok = false; break; }
        const layers = lower.boxes.length + Math.max(extraLayers[i], column.boxes.length + 1);
        if (layers > (item.strengthUnverified ? 1 : item.maxStackLayers ?? Infinity)) { ok = false; break; }
        if (limit !== undefined && lower.weight / (lower.length * lower.width) + extraDensity[i] + item.weightKg / area > limit + 1e-9) { ok = false; break; }
        let above = extra[i] + item.weightKg;
        for (let k = lower.boxes.length - 1; k >= 0 && ok; k--) {
          const base = lower.boxes[k];
          if (base.strengthUnverified || layers - k > (base.maxStackLayers ?? Infinity)) ok = false;
          else if (base.maxTopLoadKg != null && above > base.maxTopLoadKg + 1e-6) ok = false;
          else if (base.maxTopPressureKgPerM2 != null && above > base.maxTopPressureKgPerM2 * base.length * base.width + 1e-6) ok = false;
          above += base.weightKg;
        }
        if (!ok) break;
      }
      if (!ok) { misses++; continue; }
      result.placements.push({ cargoId: item.id, x: column.x, y: column.y, z: round(deck.z + column.height), length: column.length, width: column.width, height: item.height, weightKg: item.weightKg, rotated: column.rotated });
      column.boxes.push(item); column.height = round(column.height + item.height); column.weight += item.weightKg;
      for (const i of column.under) { extra[i] += item.weightKg; extraDensity[i] += item.weightKg / area; extraLayers[i] = Math.max(extraLayers[i], column.boxes.length); }
      result.used.set(item.id, (result.used.get(item.id) ?? 0) + 1);
      result.weight += item.weightKg; left--; misses = 0;
    }
  }
  return result;
}

/**
 * "Heavy low, light high" level loading. Every footprint class is spread to one common
 * height cap, so the load is low, long and flat: fewer height steps and a centred CG.
 * Hard limits (height, stack depth, cumulative top load, floor load, payload) are checked
 * for every carton; columns are exact same-footprint stacks, i.e. fully supported.
 */
export function packByLevelBlocks(container: ContainerSpec, ordered: CargoItem[], strategy: StrictWallStrategy, heightCap: number, variant: LevelVariant = 'sequential'): StrictWallOutput {
  const strict = heavyInnerStrictUnloading(container, strategy);
  const groups: CargoItem[][] = [];
  for (const item of ordered) {
    const last = groups.at(-1);
    if (last && (!strict || (last[0].unloadPriority ?? 1) === (item.unloadPriority ?? 1))) last.push(item); else groups.push([item]);
  }
  const zones: Part[][] = [];
  for (const group of groups) {
    const classes = new Map<string, Part[]>();
    for (const item of group) { const key = footprintKey(item); classes.set(key, [...(classes.get(key) ?? []), { item, quantity: item.quantity }]); }
    const list = [...classes.values()].sort((a, b) => Math.max(...b.map(p => p.item.weightKg)) - Math.max(...a.map(p => p.item.weightKg)));
    if (variant === 'centered' && !strict && list.length > 1) {
      const [heavy, ...rest] = list;
      const inner = rest.map(parts => parts.map(p => ({ item: p.item, quantity: Math.floor(p.quantity / 2) }))).reverse();
      const door = rest.map(parts => parts.map(p => ({ item: p.item, quantity: p.quantity - Math.floor(p.quantity / 2) })));
      zones.push(...inner, heavy, ...door);
    } else zones.push(...list);
  }
  const placements: Placement[] = [];
  const counts = new Map<string, number>();
  let x = 0, loadedWeightKg = 0;
  const decks: Deck[] = [];
  for (const parts of zones) {
    const active = parts.filter(p => p.quantity > 0 && floorLoadLayerCap(container, p.item) > 0);
    if (!active.length) continue;
    const zone = buildZone(container, active, x, heightCap, container.maxPayloadKg - loadedWeightKg);
    placements.push(...zone.placements);
    for (const [id, n] of zone.used) counts.set(id, (counts.get(id) ?? 0) + n);
    loadedWeightKg += zone.weight;
    x = zone.xEnd;
    decks.push(...decksOf(zone.columns, zone.slotsPerBlock, active[0].item.unloadPriority ?? 1));
  }
  // Cargo that found no floor zone goes onto flat tops of heavier cargo of the same stop.
  for (const deck of decks) {
    const classes = new Map<string, Part[]>();
    for (const item of ordered) {
      const quantity = item.quantity - (counts.get(item.id) ?? 0);
      if (quantity <= 0 || (strict && (item.unloadPriority ?? 1) !== deck.stop)) continue;
      const key = footprintKey(item); classes.set(key, [...(classes.get(key) ?? []), { item, quantity }]);
    }
    let z = deck.z;
    for (const parts of [...classes.values()].sort((a, b) => Math.max(...b.map(p => p.item.weightKg)) - Math.max(...a.map(p => p.item.weightKg)))) {
      if (Math.abs(z - deck.z) > 1e-6) break;
      const filled = fillDeck(container, deck, parts, container.maxPayloadKg - loadedWeightKg);
      if (!filled.placements.length) continue;
      placements.push(...filled.placements);
      for (const [id, n] of filled.used) counts.set(id, (counts.get(id) ?? 0) + n);
      loadedWeightKg += filled.weight;
      z = -1;
    }
  }
  const remaining = ordered.flatMap(item => {
    const quantity = item.quantity - (counts.get(item.id) ?? 0);
    const payload = item.weightKg > container.maxPayloadKg - loadedWeightKg + 1e-6;
    return quantity > 0 ? [{ cargoId: item.id, quantity, reasonCode: payload ? 'PAYLOAD_LIMIT' : 'NO_FEASIBLE_EMS',
      reason: payload ? '컨테이너 최대 적재 중량을 초과하므로 추가 적재하지 못함' : '층별 적재에서 높이·적층·바닥하중 한도 안의 자리가 부족함' }] : [];
  });
  return { placements, remaining, loadedWeightKg, usedVolumeM3: placements.reduce((s, p) => s + p.length * p.width * p.height, 0) };
}

export function levelHeightCaps(container: ContainerSpec, cargo: CargoItem[]) {
  const caps = new Set<number>();
  for (const item of cargo) for (let k = 1; k * item.height <= container.height + 1e-6 && k <= 40; k++) caps.add(Math.round(k * item.height * 1000) / 1000);
  const sorted = [...caps].sort((a, b) => a - b);
  if (sorted.length <= 28) return sorted;
  return [...new Set(Array.from({ length: 28 }, (_, i) => sorted[Math.round(i * (sorted.length - 1) / 27)]))];
}
