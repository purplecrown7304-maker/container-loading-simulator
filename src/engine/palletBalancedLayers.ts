import { withinFloorLoadLimit } from './floorLoadLimit';
import { palletCargoFloorLimit, palletFloorBody, palletPackagingReserveKg } from './palletFloorLoad';
import { layerPatterns, slotAt } from './palletLayerRepacking';
import { buildPalletLoadFromDeckPlacements, palletTopLayerFill, type PalletLoad, type PalletSpec } from './palletPacking';
import { palletTipUtilization, palletTipUtilizationLimit } from './palletTransportStability';
import { canPlaceByStackingRules } from './stacking';
import { hasAdequateSupport, supportContactArea } from './support';
import type { CargoItem, ContainerSpec, Placement } from './types';

/**
 * Balanced layer build (owner rule 2026-11-20, "파렛트를 더 적게 사용해야 한다").
 *
 * The ordinary builder fills pallets one cargo at a time. With a little heavy cargo and
 * a lot of light cargo that gives short pallets that are full by weight and tall pallets
 * that are held down by the tipping limit, and both kinds waste a base. Here every pallet
 * gets its share of the heavy cartons as its lowest layer and is then filled upward with
 * the light cargo, so one unit uses its weight and its height together and its centre of
 * gravity stays low.
 *
 * Nothing is relaxed. Every carton passes the checks the ordinary builder applies to a
 * slot (pallet load, ceiling, deck bounds, support, stack depth, cumulative top load,
 * floor load, payload), and the unit's own weight stays inside the pallet's static load
 * where one is registered. Every finished unit is inside the transport tipping limit
 * (LOADING_RULES 7A) and keeps the top-tier rule (#97); only the last pallet of a stop may
 * be the mixed tail. A carton rests on an equal or heavier carton; the one exception is a
 * closing layer of larger cartons across a flat top, which is built only in the variant
 * that the caller uses when it saves a pallet. The build is a fixed function of its input.
 */

const EPS = 1e-9;
type Strategy = 'capacity' | 'stability' | 'unloading';
const fit = (space: number, size: number) => size > 0 ? Math.max(0, Math.floor((space + EPS) / size)) : 0;
const key6 = (value: number) => Math.round(value * 1e6);

/** Fixed search sizes, so the result never depends on the device. `feedbackPasses`: how
 * often a stop is rebuilt with the pallet count of the previous build as its plan. */
export const BALANCED_PALLET_LAYER_PROFILE = { feedbackPasses: 3 } as const;

type Sku = { item: CargoItem; left: number };
type Group = { key: string; length: number; width: number; height: number; rotatable: boolean; skus: Sku[]; deck?: Cell[] };
type Cell = { x: number; y: number; length: number; width: number; rotated: boolean };
type Entry = { cell: Cell; z: number; supporter: Placement | null };
type BuiltPallet = { placements: Placement[]; tail: boolean };

type Context = {
  container: ContainerSpec; pallet: PalletSpec; cargoById: Map<string, CargoItem>;
  availableHeight: number; minTopFill: number; tipLimit: number; cargoFloorLimit: number | undefined;
  packagingReserveKg: number; staticLimitKg: number; allowCaps: boolean;
};

/** Cartons this build does not arrange: they need the ordinary builder's own handling. */
function outsideScope(item: CargoItem) {
  return Boolean(item.floorOnly) || item.unitKind === 'pallet' || Boolean(item.strengthUnverified)
    || (item.maxStackLayers !== undefined && item.maxStackLayers < 2)
    || Boolean(item.cgOffsetMm)
    || Boolean(item.allowedOrientations && !item.allowedOrientations.includes('LWH'));
}

function rotatable(item: CargoItem) {
  return item.allowRotation !== false && Math.abs(item.length - item.width) > EPS
    && (!item.allowedOrientations || item.allowedOrientations.includes('WLH'));
}

/** Cartons of one size are one group: they share layers, the heavier ones lowest. */
function groupsOf(cargo: CargoItem[]): Group[] {
  const groups = new Map<string, Group>();
  for (const item of cargo) {
    if (item.quantity <= 0) continue;
    const turn = rotatable(item);
    const length = turn ? Math.max(item.length, item.width) : item.length;
    const width = turn ? Math.min(item.length, item.width) : item.width;
    const key = `${turn ? 'R' : 'F'}|${key6(length)}|${key6(width)}|${key6(item.height)}`;
    const group = groups.get(key) ?? { key, length, width, height: item.height, rotatable: turn, skus: [] };
    group.skus.push({ item, left: Math.floor(item.quantity) });
    groups.set(key, group);
  }
  for (const group of groups.values()) group.skus.sort((a, b) => b.item.weightKg - a.item.weightKg || a.item.id.localeCompare(b.item.id));
  return [...groups.values()];
}

const groupLeft = (group: Group) => group.skus.reduce((sum, sku) => sum + sku.left, 0);
const groupVolume = (group: Group) => groupLeft(group) * group.length * group.width * group.height;
const heaviestLeft = (group: Group) => group.skus.find(sku => sku.left > 0)?.item.weightKg ?? 0;

/** Cells of one layer on the bare deck: the densest pattern the deck takes without overhang. */
function deckCells(group: Group, pallet: PalletSpec): Cell[] {
  if (group.deck) return group.deck;
  const cells: Cell[] = [];
  if (!group.rotatable) {
    const cols = fit(pallet.length, group.length), rows = fit(pallet.width, group.width);
    for (let col = 0; col < cols; col++) for (let row = 0; row < rows; row++) cells.push({ x: col * group.length, y: row * group.width, length: group.length, width: group.width, rotated: false });
  } else {
    const pattern = layerPatterns({ length: group.length, width: group.width }, pallet)[0];
    if (pattern) for (let index = 0; index < pattern.count; index++) cells.push(slotAt(pattern, index));
  }
  group.deck = cells;
  return cells;
}

/** As many cartons of the group as stand inside one supporting carton's top. */
function cellsWithin(group: Group, supporter: Pick<Placement, 'x' | 'y' | 'length' | 'width'>): Cell[] {
  const options = [{ length: group.length, width: group.width, rotated: false }];
  if (group.rotatable) options.push({ length: group.width, width: group.length, rotated: true });
  let best: { option: typeof options[number]; cols: number; rows: number } | null = null;
  for (const option of options) {
    const cols = fit(supporter.length, option.length), rows = fit(supporter.width, option.width);
    if (cols * rows > (best ? best.cols * best.rows : 0)) best = { option, cols, rows };
  }
  if (!best) return [];
  const x0 = supporter.x + (supporter.length - best.cols * best.option.length) / 2;
  const y0 = supporter.y + (supporter.width - best.rows * best.option.width) / 2;
  const cells: Cell[] = [];
  for (let col = 0; col < best.cols; col++) for (let row = 0; row < best.rows; row++) cells.push({ x: x0 + col * best.option.length, y: y0 + row * best.option.width, ...best.option });
  return cells;
}

/** A grid of the group across a flat top, centred on it. */
function cellsAcross(group: Group, region: { x: number; y: number; length: number; width: number }): Cell[] {
  const options = [{ length: group.length, width: group.width, rotated: false }];
  if (group.rotatable) options.push({ length: group.width, width: group.length, rotated: true });
  let best: { option: typeof options[number]; cols: number; rows: number } | null = null;
  for (const option of options) {
    const cols = fit(region.length, option.length), rows = fit(region.width, option.width);
    if (cols * rows > (best ? best.cols * best.rows : 0)) best = { option, cols, rows };
  }
  if (!best) return [];
  const x0 = region.x + (region.length - best.cols * best.option.length) / 2;
  const y0 = region.y + (region.width - best.rows * best.option.width) / 2;
  const cells: Cell[] = [];
  for (let col = 0; col < best.cols; col++) for (let row = 0; row < best.rows; row++) cells.push({ x: x0 + col * best.option.length, y: y0 + row * best.option.width, ...best.option });
  return cells;
}

const bounds = (rects: Array<{ x: number; y: number; length: number; width: number }>) => {
  const x = Math.min(...rects.map(r => r.x)), y = Math.min(...rects.map(r => r.y));
  return { x, y, length: Math.max(...rects.map(r => r.x + r.length)) - x, width: Math.max(...rects.map(r => r.y + r.width)) - y };
};

/** Centre first, so that the heaviest cartons of a layer stand in the middle and a layer
 * that is not full keeps its empty cells on the outside. */
function centreOut(entries: Entry[], centre: { x: number; y: number }) {
  return entries.map((entry, index) => ({ entry, index,
    distance: key6(Math.hypot(entry.cell.x + entry.cell.length / 2 - centre.x, entry.cell.y + entry.cell.width / 2 - centre.y)) }))
    .sort((a, b) => a.distance - b.distance || key6(a.entry.cell.x) - key6(b.entry.cell.x) || key6(a.entry.cell.y) - key6(b.entry.cell.y) || a.index - b.index)
    .map(row => row.entry);
}

/** One pallet under construction, in deck coordinates (z = 0 on the deck). */
class Unit {
  placements: Placement[] = [];
  weightKg = 0;
  private covered = new Set<Placement>();
  private cluster = new Map<Placement, Placement[]>();
  private centre: { x: number; y: number } | null = null;
  constructor(private ctx: Context, private grossBeforeKg: number) {}

  get tops() { return this.placements.filter(p => !this.covered.has(p)); }
  get topZ() { return this.placements.reduce((max, p) => Math.max(max, p.z + p.height), 0); }

  /** Where the next layer of `group` can stand: on the deck, inside the tops below, or,
   * when no top is large enough for one carton, across the flat top (`across`). */
  entries(group: Group, across: boolean): Entry[] {
    if (!this.placements.length) {
      const cells = deckCells(group, this.ctx.pallet);
      if (!cells.length) return [];
      const box = bounds(cells);
      this.centre = { x: box.x + box.length / 2, y: box.y + box.width / 2 };
      return centreOut(cells.map(cell => ({ cell, z: 0, supporter: null })), this.centre);
    }
    const centre = this.centre ?? { x: this.ctx.pallet.length / 2, y: this.ctx.pallet.width / 2 };
    const tops = this.tops;
    if (!across) return centreOut(tops.flatMap(top => cellsWithin(group, top).map(cell => ({ cell, z: top.z + top.height, supporter: top }))), centre);
    const z = this.topZ, flat = tops.filter(top => Math.abs(top.z + top.height - z) <= 1e-6);
    if (!flat.length) return [];
    return centreOut(cellsAcross(group, bounds(flat)).map(cell => ({ cell, z, supporter: null })), centre);
  }

  /** Every check the ordinary builder applies to one slot, for one carton in one place. */
  tryPlace(item: CargoItem, entry: Entry, limitZ: number): Placement | null {
    const { ctx } = this, { pallet, container } = ctx, { cell } = entry;
    if (this.weightKg + item.weightKg > pallet.maxLoadKg + EPS) return null;
    if (this.weightKg + item.weightKg + ctx.packagingReserveKg > ctx.staticLimitKg + EPS) return null;
    if (this.grossBeforeKg + pallet.tareWeightKg + ctx.packagingReserveKg + this.weightKg + item.weightKg > container.maxPayloadKg + EPS) return null;
    if (entry.z + item.height > limitZ + EPS) return null;
    if (cell.x < -EPS || cell.y < -EPS || cell.x + cell.length > pallet.length + EPS || cell.y + cell.width > pallet.width + EPS) return null;
    if (ctx.cargoFloorLimit !== undefined && item.weightKg / (item.length * item.width) > ctx.cargoFloorLimit + EPS) return null;
    const candidate: Placement = { cargoId: item.id, x: cell.x, y: cell.y, z: entry.z, length: cell.length, width: cell.width,
      height: item.height, weightKg: item.weightKg, rotated: Math.abs(cell.length - item.length) > 1e-6 };
    // Only cartons joined to this place by contact can carry it or gain load from it.
    const below = entry.z <= EPS ? [] : entry.supporter ? [entry.supporter]
      : this.placements.filter(p => supportContactArea(p, candidate) > 0);
    const related = [...new Set(below.flatMap(p => this.cluster.get(p) ?? [p]))];
    if (!hasAdequateSupport(candidate, related, { x: 0, y: 0, z: 0, length: pallet.length, width: pallet.width })) return null;
    if (!canPlaceByStackingRules(item, candidate, related, ctx.cargoById)) return null;
    if (ctx.cargoFloorLimit !== undefined) {
      const overlapping = this.placements.filter(p => p.x < candidate.x + candidate.length - EPS && p.x + p.length > candidate.x + EPS
        && p.y < candidate.y + candidate.width - EPS && p.y + p.width > candidate.y + EPS);
      const deck = palletFloorBody({ x: 0, y: 0, z: 0, length: pallet.length, width: pallet.width, height: pallet.height, packagingWeightKg: 0 }, pallet, true);
      if (!withinFloorLoadLimit(container, candidate, [...overlapping, deck])) return null;
    }
    const joined = related.length ? related : [];
    joined.push(candidate);
    for (const p of joined) this.cluster.set(p, joined);
    for (const p of below) this.covered.add(p);
    this.placements.push(candidate);
    this.weightKg += item.weightKg;
    return candidate;
  }

  /** Takes the given cartons off again; they were the last ones placed. */
  remove(taken: Placement[]) {
    if (!taken.length) return;
    const gone = new Set(taken);
    this.placements = this.placements.filter(p => !gone.has(p));
    this.weightKg = this.placements.reduce((sum, p) => sum + p.weightKg, 0);
    // Contact groups and open tops are rebuilt from what is left.
    this.covered = new Set(); this.cluster = new Map();
    for (const p of [...this.placements].sort((a, b) => a.z - b.z)) {
      const below = this.placements.filter(q => supportContactArea(q, p) > 0);
      const joined = [...new Set(below.flatMap(q => this.cluster.get(q) ?? [q]))];
      joined.push(p);
      for (const q of joined) this.cluster.set(q, joined);
      for (const q of below) this.covered.add(q);
    }
  }

  load(index = 1): PalletLoad { return buildPalletLoadFromDeckPlacements(index, this.placements, this.ctx.pallet); }

  /** The finished unit as it will travel: inside the ceiling and the tipping limit. */
  travels() {
    if (!this.placements.length) return true;
    const load = this.load(), { ctx } = this;
    const top = Math.max(...load.cargoPlacements.map(p => p.z + p.height)) + load.packagingExtraHeightM;
    return top <= ctx.container.height + EPS && palletTipUtilization(load, [load]) <= ctx.tipLimit + 1e-6;
  }

  topFill() { return this.placements.length ? palletTopLayerFill(this.load()) : 0; }
  topTier() { const z = Math.max(...this.placements.map(p => p.z)); return this.placements.filter(p => Math.abs(p.z - z) <= EPS); }
}

/** Pallets a stop still needs at the very least: by weight and by stacked height. */
function needed(groups: Group[], ctx: Context) {
  const weight = groups.reduce((sum, group) => sum + group.skus.reduce((part, sku) => part + sku.left * sku.item.weightKg, 0), 0);
  const height = groups.reduce((sum, group) => {
    const cells = deckCells(group, ctx.pallet).length;
    return cells ? sum + groupLeft(group) / cells * group.height : sum;
  }, 0);
  return Math.max(1, Math.ceil(weight / ctx.pallet.maxLoadKg - 1e-9), Math.ceil(height / Math.max(EPS, ctx.availableHeight) - 1e-9));
}

function buildStop(ctx: Context, cargo: CargoItem[], planned: number, grossBeforeKg: number, maxPallets: number): BuiltPallet[] | null {
  const groups = groupsOf(cargo);
  const give = (placements: Placement[], back: boolean) => {
    for (const p of placements) for (const group of groups) { const sku = group.skus.find(row => row.item.id === p.cargoId); if (sku) { sku.left += back ? 1 : -1; break; } }
  };
  const built: BuiltPallet[] = [];
  let gross = grossBeforeKg;
  while (groups.some(group => groupLeft(group) > 0)) {
    if (built.length >= maxPallets) return null;
    const open = groups.filter(group => groupLeft(group) > 0);
    const remainingPallets = Math.max(needed(open, ctx), planned - built.length, 1);
    const share = (sku: Sku) => Math.ceil(sku.left / remainingPallets);
    // The heaviest cartons left go lowest; of equally heavy ones the larger carton.
    const order = [...open].sort((a, b) => heaviestLeft(b) - heaviestLeft(a) || b.length * b.width - a.length * a.width || a.key.localeCompare(b.key));
    const base = order[0];
    // The cargo that fills the height: the size with the most volume left.
    const filler = [...open].sort((a, b) => groupVolume(b) - groupVolume(a) || a.key.localeCompare(b.key))[0];
    const unit = new Unit(ctx, gross);
    const limit = ctx.availableHeight;

    /** One layer of `group`. `allowance` limits single cargoes; cartons not named are free. */
    const layer = (group: Group, across: boolean, limitZ: number, allowance: Map<Sku, number>, most = Infinity) => {
      const placed: Placement[] = [];
      for (const entry of unit.entries(group, across)) {
        if (placed.length >= most) break;
        for (const sku of group.skus) {
          if (sku.left <= 0 || (allowance.get(sku) ?? Infinity) <= 0) continue;
          // Heavy stays low: a carton stands on an equal or heavier one (or its own kind).
          if (entry.supporter && sku.item.weightKg > entry.supporter.weightKg + EPS && sku.item.id !== entry.supporter.cargoId) continue;
          const placement = unit.tryPlace(sku.item, entry, limitZ);
          if (!placement) continue;
          placed.push(placement); sku.left--;
          if (allowance.has(sku)) allowance.set(sku, allowance.get(sku)! - 1);
          break;
        }
      }
      return placed;
    };
    const undo = (placed: Placement[]) => { unit.remove(placed); give(placed, true); };

    // 1. The lowest layers. A size that the filling cargo cannot complete is set down in
    //    whole layers; in the filling size only this pallet's share of the heavier cargoes.
    if (base !== filler) {
      const cells = deckCells(base, ctx.pallet).length;
      const layers = cells ? Math.max(1, Math.ceil(base.skus.reduce((sum, sku) => sum + share(sku), 0) / cells)) : 0;
      for (let i = 0; i < layers; i++) {
        const placed = layer(base, false, limit, new Map());
        if (!placed.length) break;
        if (!unit.travels()) { undo(placed); break; }
      }
    }
    // The other sizes, heavier first. One that stands inside the cartons of a heavier size
    // goes on in columns after the filling cargo. One that does not (a larger, lighter
    // carton) can only close the unit across its flat top; height is kept free for one
    // layer of each. A closing carton is lighter than the heaviest carton of the base.
    const others = order.filter(group => group !== base && group !== filler && groupLeft(group) > 0);
    const standsInside = (group: Group) => order.slice(0, order.indexOf(group)).some(outer =>
      cellsWithin(group, { x: 0, y: 0, length: outer.length, width: outer.width }).length > 0
      || cellsWithin(group, { x: 0, y: 0, length: outer.width, width: outer.length }).length > 0);
    const baseHeaviest = heaviestLeft(base);
    const closers = ctx.allowCaps ? others.filter(group => !standsInside(group) && heaviestLeft(group) < baseHeaviest - EPS) : [];
    let reserve = closers.reduce((sum, group) => sum + group.height, 0);
    /** Cargoes heavier than the size's main cargo stand on the deck only, by their share. */
    const allowanceOf = (group: Group) => {
      const main = [...group.skus].sort((a, b) => b.left - a.left || a.item.weightKg - b.item.weightKg || a.item.id.localeCompare(b.item.id))[0];
      const allowance = new Map<Sku, number>();
      for (const sku of group.skus) if (sku.item.weightKg > main.item.weightKg + EPS) allowance.set(sku, group === base ? share(sku) : 0);
      return allowance;
    };
    const allowances = new Map<Group, Map<Sku, number>>();
    const fill = (group: Group) => {
      const allowance = allowances.get(group) ?? allowanceOf(group);
      allowances.set(group, allowance);
      for (;;) {
        if (unit.topZ + group.height > limit - reserve + EPS && unit.placements.length) break;
        const placed = layer(group, false, limit - reserve, allowance);
        if (!placed.length) break;
        if (!unit.travels()) { undo(placed); break; }
      }
    };
    // 2. The filling cargo, then the lighter sizes that stand inside it, layer on layer, as
    //    far as load, ceiling, carton strength and tipping limit allow.
    const columns = [filler, ...others.filter(standsInside)].filter(group => groupLeft(group) > 0);
    const fillAll = () => { for (const group of columns) if (groupLeft(group) > 0) fill(group); };
    fillAll();

    // 3. Closing layers across the flat top.
    let closed = false;
    for (const group of closers) {
      const cells = unit.placements.length ? unit.entries(group, true).length : 0;
      if (!cells) continue;
      const area = group.length * group.width, deck = ctx.pallet.length * ctx.pallet.width;
      const fewest = Math.ceil(ctx.minTopFill * deck / area - 1e-9);
      const left = groupLeft(group);
      // A remainder too small to be a top tier of its own is shared between two pallets.
      const most = left <= cells ? left : left - cells < fewest && Math.ceil(left / 2) >= fewest ? Math.ceil(left / 2) : cells;
      if (most < fewest) continue;
      const placed = layer(group, true, limit, new Map(), most);
      if (!placed.length) continue;
      if (placed.length < fewest || !unit.travels()) { undo(placed); continue; }
      closed = true;
    }
    if (!closed && reserve > 0) { reserve = 0; fillAll(); }

    // Top-tier rule #97: a top tier below the minimum goes back, except on the pallet that
    // ends this stop, which is its one mixed tail.
    let tail = false;
    for (;;) {
      if (!unit.placements.length) return null;
      if (unit.topFill() + EPS >= ctx.minTopFill) break;
      if (!groups.some(group => groupLeft(group) > 0)) { tail = true; break; }
      undo(unit.topTier());
    }
    built.push({ placements: unit.placements, tail });
    gross += ctx.pallet.tareWeightKg + ctx.packagingReserveKg + unit.weightKg;
  }
  return built;
}

/**
 * The balanced layer build of the whole cargo, as pallet loads in deck coordinates, or
 * `null` when it cannot carry every carton on at most `maxPallets` pallets (or the cargo
 * has handling the build does not arrange). `allowCaps`: let a closing layer of larger
 * cartons lie across a flat top of lighter ones.
 */
export function buildBalancedPalletLoads(container: ContainerSpec, cargo: CargoItem[], pallet: PalletSpec, strategy: Strategy,
  maxPallets: number, allowCaps: boolean): PalletLoad[] | null {
  const active = cargo.filter(item => item.quantity > 0);
  if (!active.length || maxPallets < 1 || active.some(outsideScope)) return null;
  const reserveHeight = (pallet.useCornerGuards ? pallet.cornerGuardExtraHeightM : 0) + (pallet.useWrapping ? pallet.wrappingExtraHeightM : 0);
  const ctx: Context = { container, pallet, cargoById: new Map(active.map(item => [item.id, item])),
    availableHeight: container.height - pallet.height - reserveHeight, minTopFill: pallet.minTopLayerFillRatio ?? 0.5,
    tipLimit: palletTipUtilizationLimit(pallet), cargoFloorLimit: palletCargoFloorLimit(container, pallet),
    packagingReserveKg: palletPackagingReserveKg(pallet),
    staticLimitKg: pallet.maxStaticLoadKg && pallet.maxStaticLoadKg > 0 ? pallet.maxStaticLoadKg : Infinity, allowCaps };
  if (ctx.availableHeight <= EPS) return null;
  // Under unloading order a pallet holds one stop; the inner stops are built first.
  const stops = new Map<number, CargoItem[]>();
  for (const item of active) { const stop = strategy === 'unloading' ? (item.unloadPriority ?? 0) : 0; stops.set(stop, [...(stops.get(stop) ?? []), item]); }
  const loads: PalletLoad[] = [];
  let gross = 0;
  for (const [, stopCargo] of [...stops].sort(([a], [b]) => b - a)) {
    const room = maxPallets - loads.length;
    if (needed(groupsOf(stopCargo), ctx) > room) return null;
    let best: BuiltPallet[] | null = null, planned = 0;
    for (let pass = 0; pass < BALANCED_PALLET_LAYER_PROFILE.feedbackPasses; pass++) {
      const built = buildStop(ctx, stopCargo, planned, gross, best ? best.length : room);
      if (!built) break;
      if (!best || built.length < best.length) best = built;
      if (built.length === planned) break;
      planned = built.length;
    }
    if (!best) return null;
    for (const unit of best) {
      const load = buildPalletLoadFromDeckPlacements(loads.length + 1, unit.placements, pallet);
      if (unit.tail) load.isMixedTail = true;
      loads.push(load);
      gross += load.totalWeightKg;
    }
  }
  return loads;
}
