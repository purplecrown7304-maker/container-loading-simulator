import { SPARSE_TOP_LAYER_RATIO, SPARSE_TOP_MIN_LEVELS } from './topLayerSettling';
import { auditLoading } from './loadingAudit';
import { isInsideContainer, overlaps } from './constraints';
import { hasAdequateSupport, scenarioSupportRatio } from './support';
import { createStackLedger } from './stackLedger';
import { canPlaceByStackingRules, countStackLayersBelow } from './stacking';
import { acceptsUnloadCandidate } from './unloadingPolicy';
import { floorLoadLayerCap, withinFloorLoadLimit, FLOOR_LOAD_REASON } from './floorLoadLimit';
import { validateOperationalWeightAndCog } from './operationalValidator';
import { centerHeavyInnerLaterally, heavyInnerCargoOrder, heavyInnerStrictUnloading } from './heavyInnerPolicy';
import type { CargoItem, ContainerSpec, Placement } from './types';
import type { StrictWallOutput, StrictWallStrategy } from './strictWallPacker';
import { gapSecuringPlan } from './gapSecuring';
import { levelHeightCaps, packByLevelBlocks } from './levelBlockPacker';

const EPS = 1e-8;
const fit = (room: number, size: number) => Math.max(0, Math.floor((room + EPS) / size));
const round = (value: number) => Math.round(value * 1e9) / 1e9;
type FloorOrientation = { length: number; width: number; rotated: boolean };
type Profile = { layerCap: number; lowerPrefix: number; lowerLayers: number; orientation: 'efficient' | 'normal' | 'rotated';
  /** The rows that keep the whole tier cap, counted from the inner wall. The rows after them,
   * toward the door, stand one tier lower. */
  stepRow?: number };
type Candidate = { output: StrictWallOutput; mode?: number; voids: number; counts: number[]; cgErrors: number; cgExcess: number; sparseTop: boolean; heightMoment: number; end: number; signature: string;
  /** The weight sequence exactly as built, with rows a cargo could not fill left where they
   * fell inside the load. Judged after the plan that takes those leftovers to the door end. */
  leftoversInside?: boolean;
  /** A block was left lower than the rows behind it although lighter cartons could have
   * filled it up. Judged after the plan that fills it. */
  openAbove?: boolean;
  /** Full rows built, counted from the inner wall: where a step toward the door can be set. */
  rows?: number;
  /** The centre of gravity stands on the inner side of the middle of the length. */
  cgInner?: boolean;
  /** The tier and orientation profile the plan was built with. */
  profile?: Profile };
type Phase = 'sequence' | 'rows' | 'leftover';
/** Filled plans tried with a step toward the door when none passes the centre-of-gravity verdict. */
const STEP_TRIALS = 2;
/** Plans of the weight sequence kept for the final comparison. */
const PORTFOLIO = 8;

/** a rows of normal boxes equal b rows of rotated boxes in depth; choose the column mix covering most width. */
export function pinwheelBlock(item: CargoItem, width: number) {
  const L = item.length, W = item.width;
  if (Math.abs(L - W) <= EPS) return null;
  for (let a = 1; a <= 4; a++) for (let b = 1; b <= 4; b++) {
    if (Math.abs(a * L - b * W) > 1e-6) continue;
    let best: { n: number; r: number; per: number } | null = null;
    for (let r = 1; r * L <= width + EPS; r++) {
      const n = fit(width - r * L, W);
      if (n < 1) continue;
      const per = n * a + r * b;
      if (!best || per > best.per || (per === best.per && r < best.r)) best = { n, r, per };
    }
    if (!best || best.per <= Math.max(fit(width, W) * a, fit(width, L) * b)) return null;
    const positions: Array<{ dx: number; dy: number; length: number; width: number; rotated: boolean }> = [];
    for (let c = 0; c < best.n; c++) for (let i = 0; i < a; i++) positions.push({ dx: i * L, dy: c * W, length: L, width: W, rotated: false });
    for (let c = 0; c < best.r; c++) for (let j = 0; j < b; j++) positions.push({ dx: j * W, dy: best.n * W + c * L, length: W, width: L, rotated: true });
    positions.sort((p, q) => p.dx - q.dx || p.dy - q.dy);
    return { depth: a * L, positions };
  }
  return null;
}

export function floorOrientations(item: CargoItem): FloorOrientation[] {
  const out: FloorOrientation[] = [];
  if (!item.allowedOrientations || item.allowedOrientations.includes('LWH')) out.push({ length: item.length, width: item.width, rotated: false });
  if (item.allowRotation !== false && (!item.allowedOrientations || item.allowedOrientations.includes('WLH'))
    && (Math.abs(item.length - item.width) > EPS || !out.length)) out.push({ length: item.width, width: item.length, rotated: true });
  return out;
}

/**
 * Whole tiers of one cargo on a flat top: a grid in one floor orientation, the orientation
 * that lays the most cartons first. Rows of both orientations in one tier were tried and
 * dropped: more cartons per tier, but each carton underneath then carries more of them, and
 * with the whole-weight top-load rule fewer tiers could be laid.
 */
function tierGrids(orientations: FloorOrientation[], length: number, width: number) {
  return orientations.map(o => ({ o, nx: fit(length, o.length), ny: fit(width, o.width) }))
    .filter(grid => grid.nx * grid.ny > 0).sort((a, b) => b.nx * b.ny - a.nx * a.ny || Number(a.o.rotated) - Number(b.o.rotated));
}

/** Homogeneous, floor-rooted columns transmit their entire load to their own footprint. */
export function heavyInnerLayerLimit(container: ContainerSpec, item: CargoItem) {
  let limit = Math.min(fit(container.height, item.height), Math.floor(item.maxStackLayers ?? Infinity), floorLoadLayerCap(container, item));
  if (item.floorOnly || item.strengthUnverified) limit = Math.min(limit, 1);
  if (item.weightKg > EPS) {
    if (item.maxTopLoadKg != null) limit = Math.min(limit, 1 + fit(Math.max(0, item.maxTopLoadKg), item.weightKg));
    if (item.maxTopPressureKgPerM2 != null) limit = Math.min(limit, 1 + fit(Math.max(0, item.maxTopPressureKgPerM2) * item.length * item.width, item.weightKg));
  }
  return Math.max(0, limit);
}

/**
 * One plan of the weight sequence.
 *
 * `leftoversLast` (owner rule 2026-11-19, "what is awkwardly left over belongs in the last
 * row; from the front to the row before the last there is no empty space"): each stop is
 * loaded in two passes. First only the rows a cargo fills by itself, wall to wall and to its
 * full height, in weight order from the inner wall. Then everything that could not fill such
 * a row, in the same weight order, behind them at the door end. Without it the cargo is
 * loaded in one pass and a row a cargo could not fill stays where it fell.
 *
 * `fillAbove` (owner rule 2026-11-20, "the front is empty; it has to match the height of the
 * rows behind it" and "heavy cartons take the floor first, then the cartons there are most
 * of"): with `leftoversLast`, the rows of a cargo that end below the rows of lighter cargo
 * are filled up with that lighter cargo, whole tiers at a time, and the cargo itself is
 * stacked only as high as lets them reach that height.
 */
function buildCandidate(container: ContainerSpec, ordered: CargoItem[], strategy: StrictWallStrategy, profile: Profile, leftoversLast = false, fillAbove = false): Candidate {
  const placements: Placement[] = [];
  const remaining: StrictWallOutput['remaining'] = [];
  const stock = new Map(ordered.map(item => [item.id, item.quantity]));
  const byId = new Map(ordered.map(item => [item.id, { ...item,
    maxStackLayers: item.strengthUnverified ? 1 : item.maxStackLayers,
    maxTopLoadKg: item.strengthUnverified ? 0 : Math.min(item.maxTopLoadKg ?? Infinity, item.maxTopPressureKgPerM2 == null ? Infinity : item.maxTopPressureKgPerM2 * item.length * item.width),
  }]));
  let x = 0, y = 0, rowDepth = 0, loadedWeightKg = 0, usedVolumeM3 = 0;
  const strict = heavyInnerStrictUnloading(container, strategy);
  let prefixRemaining = Math.floor(ordered.filter(item => heavyInnerLayerLimit(container, item) > 1).reduce((sum, item) => sum + item.quantity, 0) * profile.lowerPrefix);
  let rowId = 0;
  const groupOf = new Map<Placement, number>();
  // The leftover rows of the stop being loaded: their cartons and the top carton of each of
  // their columns. Rows are disjoint along the length, so every check on a leftover carton
  // only has to look at these.
  let inLeftoverRows = false;
  const leftover: Placement[] = [];
  const leftoverTops = new Map<string, Placement>();
  const columnKey = (p: Placement) => `${round(p.x)}|${round(p.y)}|${round(p.length)}|${round(p.width)}`;
  // Payload kept for leftovers that are loaded after lighter rows (see `load`).
  let reservedKg = 0;
  const reserved = new Map<string, number>();
  const put = (p: Placement, row = rowId) => {
    groupOf.set(p, row); placements.push(p);
    if (!inLeftoverRows) return;
    leftover.push(p);
    const key = columnKey(p), top = leftoverTops.get(key);
    if (!top || p.z > top.z) leftoverTops.set(key, p);
  };
  const advance = () => { x = round(x + rowDepth); y = 0; rowDepth = 0; rowId++; };
  // The tier cap in force: the whole cap for the first `stepRow` full rows, one tier less after.
  let fullRows = 0;
  const lowerCap = (Number.isFinite(profile.layerCap) ? profile.layerCap : Math.max(1, ...ordered.map(item => heavyInnerLayerLimit(container, item)))) - 1;
  const capNow = () => fullRows < (profile.stepRow ?? Infinity) ? profile.layerCap : lowerCap;
  const rowCap = new Map<number, number>();
  const closeFullRow = () => { rowCap.set(rowId, capNow()); fullRows++; advance(); };

  // Fill equal-weight side lanes before closing a front. This creates adjacent
  // continuous SKU lanes, not a lighter gap-fill behind later heavy rows.
  const fillEqualWeightSide = (current: CargoItem, currentIndex: number) => {
    for (const filler of ordered.slice(currentIndex + 1)) {
      if (Math.abs(filler.weightKg - current.weightKg) > EPS) continue;
      if (strict && (filler.unloadPriority ?? 1) !== (current.unloadPriority ?? 1)) continue;
      const layers = Math.min(heavyInnerLayerLimit(container, filler), capNow());
      if (layers < 1 || (stock.get(filler.id) ?? 0) <= 0) continue;
      const options = floorOrientations(filler).flatMap(o => {
        if (Math.abs(o.length - rowDepth) > 1e-6) return [];
        const count = Math.min(stock.get(filler.id) ?? 0, fit(container.width - y, o.width) * layers,
          filler.weightKg > EPS ? fit(container.maxPayloadKg - loadedWeightKg - reservedKg + (reserved.get(filler.id) ?? 0), filler.weightKg) : Infinity);
        return count > 0 ? [{ ...o, count, columns: Math.ceil(count / layers) }] : [];
      }).sort((a, b) => b.count - a.count || a.length - b.length || Number(a.rotated) - Number(b.rotated));
      const option = options[0];
      if (!option) continue;
      for (let iz = 0; iz < layers; iz++) for (let iy = 0; iy < option.columns; iy++) {
        if (iy * layers + iz >= option.count) continue;
        put({ cargoId: filler.id, x, y: round(y + iy * option.width), z: round(iz * filler.height),
          length: option.length, width: option.width, height: filler.height, weightKg: filler.weightKg, rotated: option.rotated });
      }
      stock.set(filler.id, (stock.get(filler.id) ?? 0) - option.count);
      const kept = Math.min(reserved.get(filler.id) ?? 0, option.count * filler.weightKg);
      if (kept > 0) { reserved.set(filler.id, (reserved.get(filler.id) ?? 0) - kept); reservedKg -= kept; }
      loadedWeightKg += option.count * filler.weightKg;
      usedVolumeM3 += option.count * filler.length * filler.width * filler.height;
      y = round(y + option.columns * option.width);
    }
  };
  const fillCurrentFrontTop = (item: CargoItem, orientations: FloorOrientation[]) => {
    if (item.floorOnly || item.strengthUnverified || Math.min(item.maxStackLayers ?? Infinity, capNow()) < 2) return false;
    for (const support of placements.filter(p => Math.abs(p.x - x) <= EPS && p.cargoId !== item.id && p.weightKg >= item.weightKg - EPS).sort((a, b) => a.z - b.z || a.y - b.y)) {
      for (const o of orientations) {
        if (scenarioSupportRatio(container,.999) >= .999 && (Math.abs(o.length - support.length) > EPS || Math.abs(o.width - support.width) > EPS)) continue;
        const candidate: Placement = { cargoId: item.id, x, y: support.y, z: round(support.z + support.height),
          length: o.length, width: o.width, height: item.height, weightKg: item.weightKg, rotated: o.rotated };
        if (!isInsideContainer(container, candidate) || !withinFloorLoadLimit(container, candidate, placements)) continue;
        if (placements.some(p => overlaps(p, candidate)) || !hasAdequateSupport(candidate, placements, undefined, scenarioSupportRatio(container,.999))) continue;
        if (countStackLayersBelow(candidate, placements) > capNow() || !canPlaceByStackingRules(byId.get(item.id)!, candidate, placements, byId)) continue;
        if (!acceptsUnloadCandidate(container, byId, placements, candidate)) continue;
        put(candidate);
        loadedWeightKg += item.weightKg;
        usedVolumeM3 += item.length * item.width * item.height;
        return true;
      }
    }
    return false;
  };

  // A leftover carton first goes on top of an equal or heavier leftover carton of the same
  // footprint, the lowest free top first, so the leftover rows are filled up before another
  // one is opened. It passes every check a carton set on the open front passes. A column
  // that refuses a cargo once stays closed for it: its limits only tighten as it grows.
  const stackOnLeftover = (item: CargoItem, orientations: FloorOrientation[], closed: Set<string>) => {
    if (item.floorOnly || item.strengthUnverified || Math.min(item.maxStackLayers ?? Infinity, capNow()) < 2) return false;
    const tops = [...leftoverTops].filter(([key, top]) => !closed.has(key) && top.weightKg >= item.weightKg - EPS)
      .sort(([, a], [, b]) => (a.z + a.height) - (b.z + b.height) || a.x - b.x || a.y - b.y);
    for (const [key, support] of tops) {
      const o = orientations.find(o => Math.abs(o.length - support.length) <= EPS && Math.abs(o.width - support.width) <= EPS);
      const candidate: Placement | undefined = o && { cargoId: item.id, x: support.x, y: support.y, z: round(support.z + support.height),
        length: o.length, width: o.width, height: item.height, weightKg: item.weightKg, rotated: o.rotated };
      if (candidate && isInsideContainer(container, candidate) && withinFloorLoadLimit(container, candidate, leftover)
        && !leftover.some(p => overlaps(p, candidate)) && hasAdequateSupport(candidate, leftover, undefined, scenarioSupportRatio(container, .999))
        && countStackLayersBelow(candidate, leftover) <= capNow() && canPlaceByStackingRules(byId.get(item.id)!, candidate, leftover, byId)
        && acceptsUnloadCandidate(container, byId, placements, candidate)) {
        put(candidate, groupOf.get(support));
        loadedWeightKg += item.weightKg;
        usedVolumeM3 += item.length * item.width * item.height;
        return true;
      }
      closed.add(key);
    }
    return false;
  };
  // The leftover rows of a stop are whole floor-rooted groups, so they are set down again
  // without being rebuilt: rows that leave free width stand side by side, and the fullest
  // rows come first, so that the load ends in its sparsest row and nothing is left open
  // before it. No stack changes, only where it stands along the length and across the width.
  const settleLeftoverRows = () => {
    const rows = new Map<number, Placement[]>();
    for (const p of leftover) { const row = groupOf.get(p)!; const list = rows.get(row); if (list) list.push(p); else rows.set(row, [p]); }
    if (rows.size < 2) return;
    const start = Math.min(...leftover.map(p => p.x));
    const groups: Array<{ row: number; parts: Placement[]; cover: number; depth: number; volume: number }> = [];
    for (const [row, parts] of [...rows].sort((a, b) => a[0] - b[0])) {
      const x0 = Math.min(...parts.map(p => p.x));
      const cover = Math.max(...parts.map(p => p.y + p.width));
      const depth = round(Math.max(...parts.map(p => p.x + p.length)) - x0);
      const volume = parts.reduce((sum, p) => sum + p.length * p.width * p.height, 0);
      const host = groups.find(group => group.cover + cover <= container.width + EPS);
      for (const p of parts) { p.x = round(p.x - x0); if (host) { p.y = round(p.y + host.cover); groupOf.set(p, host.row); } }
      if (host) { host.parts.push(...parts); host.cover = round(host.cover + cover); host.depth = Math.max(host.depth, depth); host.volume += volume; }
      else groups.push({ row, parts, cover, depth, volume });
    }
    const filled = (group: typeof groups[number]) => Math.round(group.volume / group.depth * 1e6);
    groups.sort((a, b) => filled(b) - filled(a) || a.row - b.row);
    let cursor = start;
    for (const group of groups) { for (const p of group.parts) p.x = round(cursor + p.x); cursor = round(cursor + group.depth); }
    x = cursor; y = 0; rowDepth = 0;
  };

  const load = (item: CargoItem, itemIndex: number, phase: Phase, layerLimit = Infinity) => {
    // The payload kept for this cargo's leftovers is its own again.
    if (phase === 'leftover') { reservedKg -= reserved.get(item.id) ?? 0; reserved.delete(item.id); }
    const closed = new Set<string>();
    const hardLayers = heavyInnerLayerLimit(container, item);
    const layersNow = () => Math.min(hardLayers, capNow(), layerLimit);
    const orientations = floorOrientations(item);
    let left = Math.max(0, Math.floor(stock.get(item.id) ?? 0));
    // A compact low-tier prefix is a geometry alternative, never a gap or wall permutation.
    let lowerLeft = layersNow() > 1 ? Math.min(left, prefixRemaining) : 0;
    prefixRemaining = Math.max(0, prefixRemaining - lowerLeft);
    let blocked = '';
    while (left > 0) {
      const maxLayers = layersNow();
      const payloadCount = item.weightKg > EPS ? fit(container.maxPayloadKg - loadedWeightKg - reservedKg, item.weightKg) : left;
      if (payloadCount < 1) { blocked = 'PAYLOAD_LIMIT'; break; }
      if (item.height > container.height + EPS || !orientations.some(o => o.length <= container.length + EPS && o.width <= container.width + EPS)) { blocked = orientations.length ? 'SIZE_LIMIT' : 'ORIENTATION_RESTRICTED'; break; }
      if (maxLayers < 1) { blocked = floorLoadLayerCap(container, item) < 1 ? 'FLOOR_LOAD_LIMIT' : 'STACK_LIMIT'; break; }
      const layers = lowerLeft > 0 ? Math.min(maxLayers, profile.lowerLayers) : maxLayers;
      const available = Math.min(left, payloadCount, lowerLeft > 0 ? lowerLeft : left);
      // Width-filling pinwheel block (column stacked): mixed floor orientations share one depth.
      if (profile.orientation === 'efficient' && y <= EPS && rowDepth <= EPS && orientations.length === 2) {
        const pw = pinwheelBlock(item, container.width);
        if (pw && x + pw.depth <= container.length + EPS && available >= pw.positions.length * (phase === 'rows' ? layers : 1)) {
          const count = Math.min(available, pw.positions.length * layers);
          let n = 0;
          for (let iz = 0; iz < layers && n < count; iz++) for (const pos of pw.positions) {
            if (n >= count) break;
            put({ cargoId: item.id, x: round(x + pos.dx), y: round(pos.dy), z: round(iz * item.height),
              length: pos.length, width: pos.width, height: item.height, weightKg: item.weightKg, rotated: pos.rotated });
            n++;
          }
          y = container.width; rowDepth = pw.depth;
          loadedWeightKg += count * item.weightKg;
          usedVolumeM3 += count * item.length * item.width * item.height;
          left -= count; stock.set(item.id, left); lowerLeft = Math.max(0, lowerLeft - count);
          if (phase === 'rows') closeFullRow();
          continue;
        }
      }
      const options = orientations.flatMap(o => {
        if (x + o.length > container.length + EPS) return [];
        if (rowDepth > EPS && Math.abs(o.length - rowDepth) > 1e-6) return [];
        const columns = fit(container.width - y, o.width);
        const count = Math.min(available, columns * layers);
        if (count <= 0) return [];
        return [{ ...o, count, columns: Math.ceil(count / layers), cost: Math.max(rowDepth, o.length) / (columns * layers) }];
      }).sort((a, b) => {
        if (profile.orientation !== 'efficient' && a.rotated !== b.rotated) return profile.orientation === 'rotated' ? Number(b.rotated) - Number(a.rotated) : Number(a.rotated) - Number(b.rotated);
        return a.cost - b.cost || b.count - a.count || a.length - b.length || Number(a.rotated) - Number(b.rotated);
      });
      const chosen = options[0];
      if (phase === 'rows') {
        // Only a row this cargo fills by itself, wall to wall and to its full height, keeps
        // its place in the sequence. The rest waits for the leftover pass.
        if (!chosen || chosen.count < fit(container.width, chosen.width) * layers) break;
      } else if (phase === 'leftover' && stackOnLeftover(item, orientations, closed)) {
        left--; stock.set(item.id, left); lowerLeft = Math.max(0, lowerLeft - 1); continue;
      }
      if (!chosen) {
        if (rowDepth > EPS && fillCurrentFrontTop(item, orientations)) {
          left--; stock.set(item.id, left); lowerLeft = Math.max(0, lowerLeft - 1); continue;
        }
        if (rowDepth > EPS) { fillEqualWeightSide(item, itemIndex); advance(); continue; }
        blocked = orientations.length ? 'NO_FEASIBLE_EMS' : 'ORIENTATION_RESTRICTED';
        break;
      }
      // Finish each compact same-SKU height block at the current work front. No later
      // SKU is inserted into an earlier row. A still-open front can accept safe light
      // top cargo; equal-weight side lanes are completed before the front closes.
      // Tail quantities spread layer-first across the whole free width: no narrow tall tower.
      const freeCols = fit(container.width - y, chosen.width);
      const usedCols = Math.min(freeCols, chosen.count);
      let placedHere = 0;
      for (let iz = 0; iz < layers && placedHere < chosen.count; iz++) for (let iy = 0; iy < usedCols && placedHere < chosen.count; iy++) {
        put({ cargoId: item.id, x, y: round(y + iy * chosen.width), z: round(iz * item.height),
          length: chosen.length, width: chosen.width, height: item.height, weightKg: item.weightKg, rotated: chosen.rotated });
        placedHere++;
      }
      y = round(y + usedCols * chosen.width);
      rowDepth = Math.max(rowDepth, chosen.length);
      loadedWeightKg += chosen.count * item.weightKg;
      usedVolumeM3 += chosen.count * item.length * item.width * item.height;
      left -= chosen.count;
      stock.set(item.id, left);
      lowerLeft = Math.max(0, lowerLeft - chosen.count);
      if (phase === 'rows') closeFullRow();
    }
    if (phase === 'rows') {
      // What is left is loaded after every row of this stop. Its payload is kept for it
      // until then, so that lighter rows cannot take the place of a heavier carton.
      const kept = Math.min(left, item.weightKg > EPS ? fit(container.maxPayloadKg - loadedWeightKg - reservedKg, item.weightKg) : left) * item.weightKg;
      reserved.set(item.id, kept); reservedKg += kept;
      return;
    }
    if (left) remaining.push({ cargoId: item.id, quantity: left, reasonCode: blocked === 'SIZE_LIMIT' ? 'NO_FEASIBLE_EMS' : blocked || 'NO_FEASIBLE_EMS', reason:
      blocked === 'SIZE_LIMIT' ? '박스 크기가 허용 회전 방향에서 컨테이너 적재공간을 초과함'
        : blocked === 'PAYLOAD_LIMIT' ? '컨테이너 최대 적재 중량을 초과하므로 추가 적재하지 못함'
        : blocked === 'FLOOR_LOAD_LIMIT' ? FLOOR_LOAD_REASON
          : blocked === 'STACK_LIMIT' ? '신고된 적층·상부하중·높이 한도 안에서 연속 작업 블록을 만들 수 없음'
            : blocked === 'ORIENTATION_RESTRICTED' ? '허용된 바닥 방향으로 배치할 수 없음'
              : '안쪽부터 중량순으로 진행하는 연속 작업 블록에 안전한 자리가 부족함' });
  };

  // Everything a trial of one cargo's rows may change, so that the trial can be undone.
  const mark = () => ({ count: placements.length, stock: new Map(stock), reserved: new Map(reserved), x, y, rowDepth, rowId, fullRows, loadedWeightKg, usedVolumeM3, prefixRemaining, reservedKg });
  const undo = (state: ReturnType<typeof mark>) => {
    for (const p of placements.splice(state.count)) groupOf.delete(p);
    stock.clear(); for (const [id, quantity] of state.stock) stock.set(id, quantity);
    reserved.clear(); for (const [id, kg] of state.reserved) reserved.set(id, kg);
    ({ x, y, rowDepth, rowId, fullRows, loadedWeightKg, usedVolumeM3, prefixRemaining, reservedKg } = state);
  };
  // The rows a cargo has just filled form a flat block. Where that block ends below the
  // height the rows of a lighter cargo will have, whole tiers of that cargo are laid on it,
  // the cargo there is most of first, until the next tier would stand above its own rows.
  // A tier is laid complete or not at all, and every carton in it passes the checks a carton
  // set on the open front passes. `top` is the height the lowest block reached; `starved`
  // says that no cargo had the cartons for even one tier, which more rows cannot change.
  const fillBlocksOf = (item: CargoItem, itemIndex: number, stop: Array<[CargoItem, number]>, from: number) => {
    const blocks: Array<{ x0: number; x1: number; y0: number; y1: number; z: number; cap: number; group: number; parts: Placement[] }> = [];
    const rows = new Map<number, Placement[]>();
    for (let i = from; i < placements.length; i++) { const p = placements[i], row = groupOf.get(p)!; const list = rows.get(row); if (list) list.push(p); else rows.set(row, [p]); }
    for (const [row, parts] of rows) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z = 0;
      for (const p of parts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x + p.length); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y + p.width); z = Math.max(z, p.z + p.height); }
      const cap = rowCap.get(row) ?? profile.layerCap, last = blocks.at(-1);
      if (last && last.cap === cap && Math.abs(last.x1 - x0) <= 1e-6 && Math.abs(last.z - z) <= 1e-6 && Math.abs(last.y0 - y0) <= 1e-6 && Math.abs(last.y1 - y1) <= 1e-6) { last.x1 = x1; last.parts.push(...parts); }
      else blocks.push({ x0, x1, y0, y1, z, cap, group: row, parts: [...parts] });
    }
    const sources = stop.filter(([source, index]) => index > itemIndex && !source.floorOnly && !source.strengthUnverified && (source.maxStackLayers ?? Infinity) >= 2
      && source.weightKg <= item.weightKg + EPS)
      .sort((a, b) => b[0].quantity - a[0].quantity || a[0].weightKg - b[0].weightKg || a[1] - b[1]).map(([source]) => source);
    const ratio = scenarioSupportRatio(container, .999);
    let lowest = Infinity, filled = false, starved = true;
    for (const block of blocks) {
      // Rows are disjoint along the length: only this block and what is laid on it matter.
      const bounds = { minX: block.x0, minY: 0, maxX: block.x1, maxY: container.width, cell: Math.min(2, Math.max(0.05, 1.5 * Math.min(item.length, item.width))) };
      const stackOf = (parts: Placement[]) => { const ledger = createStackLedger(byId, bounds); for (const p of [...parts].sort((a, b) => a.z - b.z)) ledger.add(p); return ledger; };
      let stack = stackOf(block.parts);
      // Adds the carton when it passes every check; says whether it did.
      const lay = (source: CargoItem, candidate: Placement) => {
        const { touching, layers, allowed, add } = stack.examine(byId.get(source.id)!, candidate);
        if (!allowed || layers > block.cap || !isInsideContainer(container, candidate) || touching.some(p => overlaps(p, candidate))) return false;
        if (!withinFloorLoadLimit(container, candidate, touching) || !hasAdequateSupport(candidate, touching, undefined, ratio)) return false;
        if (!acceptsUnloadCandidate(container, byId, placements, candidate)) return false;
        add();
        return true;
      };
      let surface = { x0: block.x0, x1: block.x1, y0: block.y0, y1: block.y1, z: block.z, weightKg: item.weightKg };
      let tiers = 0;
      for (let laid = true; laid;) {
        laid = false;
        for (const source of sources) {
          const have = stock.get(source.id) ?? 0;
          const grids = tierGrids(floorOrientations(source), surface.x1 - surface.x0, surface.y1 - surface.y0);
          if (grids.some(grid => grid.nx * grid.ny <= have)) starved = false;
          const level = Math.min(heavyInnerLayerLimit(container, source), block.cap) * source.height;
          if (have < 1 || source.weightKg > surface.weightKg + EPS || surface.z + source.height > level + 1e-6) continue;
          for (const { o, nx, ny } of grids) {
            const count = nx * ny;
            if (count > have || (source.weightKg > EPS && count > fit(container.maxPayloadKg - loadedWeightKg - reservedKg, source.weightKg))) continue;
            const yStart = round(surface.y0 + (surface.y1 - surface.y0 - ny * o.width) / 2);
            const before = stack.items.length;
            let complete = true;
            for (let ix = 0; ix < nx && complete; ix++) for (let iy = 0; iy < ny; iy++) {
              const candidate: Placement = { cargoId: source.id, x: round(surface.x0 + ix * o.length), y: round(yStart + iy * o.width), z: round(surface.z),
                length: o.length, width: o.width, height: source.height, weightKg: source.weightKg, rotated: o.rotated };
              if (!lay(source, candidate)) { complete = false; break; }
            }
            if (!complete) { stack = stackOf(stack.items.slice(0, before)); continue; }
            for (const p of stack.items.slice(before)) put(p, block.group);
            stock.set(source.id, have - count);
            loadedWeightKg += count * source.weightKg;
            usedVolumeM3 += count * source.length * source.width * source.height;
            surface = { x0: surface.x0, x1: round(surface.x0 + nx * o.length), y0: yStart, y1: round(yStart + ny * o.width), z: round(surface.z + source.height), weightKg: source.weightKg };
            tiers++; laid = true;
            break;
          }
          if (laid) break;
        }
      }
      // The rows and what stands on them are one rigid group from here on.
      if (tiers) { filled = true; for (const p of block.parts) groupOf.set(p, block.group); }
      lowest = Math.min(lowest, surface.z);
    }
    return { top: blocks.length ? lowest : 0, filled, starved };
  };
  // Heavy cartons take the floor first: the cargo is stacked only as high as lets the block
  // reach the height of the rows behind it. Fewer tiers are used only where that brings the
  // finished block higher; otherwise the cargo keeps its own height.
  const loadRowsAndFill = (item: CargoItem, itemIndex: number, stop: Array<[CargoItem, number]>) => {
    const start = mark();
    const limit = Math.min(heavyInnerLayerLimit(container, item), capNow());
    // No block can be filled higher than the rows of the lighter cargo of this stop.
    const ceiling = Math.max(0, ...stop.filter(([, index]) => index > itemIndex).map(([source]) => Math.min(heavyInnerLayerLimit(container, source), capNow()) * source.height));
    let best: { top: number; state: ReturnType<typeof mark>; added: Array<[Placement, number]>; caps: Array<[number, number]> } | undefined, current = false;
    for (let layers = limit; layers >= 1; layers--) {
      undo(start);
      load(item, itemIndex, 'rows', layers);
      const unfilled = mark(), bare = placements.slice(start.count).map(p => [p, groupOf.get(p)!] as [Placement, number]);
      const { top, filled, starved } = fillBlocksOf(item, itemIndex, stop, start.count);
      current = false;
      if (!best) {
        // Whole height, as the cargo stands without this rule, unless tiers could be laid on it.
        best = filled ? { top, state: mark(), added: placements.slice(start.count).map(p => [p, groupOf.get(p)!]), caps: [...rowCap] }
          : { top, state: unfilled, added: bare, caps: [...rowCap] };
        current = true;
      } else if (filled && top > best.top + 1e-6) {
        best = { top, state: mark(), added: placements.slice(start.count).map(p => [p, groupOf.get(p)!]), caps: [...rowCap] };
        current = true;
      }
      if (starved || best.top >= ceiling - 1e-6) break;
    }
    if (!best) { load(item, itemIndex, 'rows'); return; }
    if (current) return;
    // Put the best trial back exactly as it was built.
    undo(start);
    for (const [p, row] of best.added) { placements.push(p); groupOf.set(p, row); }
    undo(best.state);
    rowCap.clear(); for (const [row, cap] of best.caps) rowCap.set(row, cap);
  };

  // Under strict unloading every stop is a block of its own; otherwise the cargo is one block.
  const stops: Array<Array<[CargoItem, number]>> = [];
  for (const [index, item] of ordered.entries()) {
    const last = stops.at(-1);
    if (last && (!strict || (last[0][0].unloadPriority ?? 1) === (item.unloadPriority ?? 1))) last.push([item, index]); else stops.push([[item, index]]);
  }
  for (const stop of stops) {
    if (rowDepth > EPS) advance();
    if (!leftoversLast) { for (const [item, index] of stop) load(item, index, 'sequence'); continue; }
    for (const [item, index] of stop) if (fillAbove) loadRowsAndFill(item, index, stop); else load(item, index, 'rows');
    inLeftoverRows = true; leftover.length = 0; leftoverTops.clear();
    for (const [item, index] of stop) load(item, index, 'leftover');
    if (rowDepth > EPS) advance();
    settleLeftoverRows();
    inLeftoverRows = false;
  }
  // Rows are disjoint in X. Center each row laterally as one rigid support group,
  // rather than leave short boundary rows against a side wall.
  const grouped = new Map<number, Placement[]>();
  for (const p of placements) { const key = groupOf.get(p) ?? 0; const group = grouped.get(key) ?? []; group.push(p); grouped.set(key, group); }
  // From the inner wall to the door: the output lists the cartons in loading order.
  const rowGroups = new Map([...grouped].map(([key, row]) => [key, row, Math.min(...row.map(p => p.x))] as const)
    .sort((a, b) => a[2] - b[2] || a[0] - b[0]).map(([key, row]) => [key, row] as const));
  let voids = 0, previousTop: number | undefined;
  for (const row of rowGroups.values()) {
    const top = Math.max(...row.map(p => p.z + p.height)), depth = Math.max(...row.map(p => p.x + p.length)) - Math.min(...row.map(p => p.x));
    const cover = Math.max(...row.map(p => p.y + p.width)) - Math.min(...row.map(p => p.y));
    voids += Math.max(0, container.width - cover) * depth * top + (previousTop == null ? 0 : Math.abs(top - previousTop) * container.width * 0.3);
    previousTop = top;
  }
  const centered = [...rowGroups.values()].flatMap(row => centerHeavyInnerLaterally(container, row));
  const tiers = new Map<number, number>();
  for (const p of centered) { const level = Math.round(p.z * 1000); tiers.set(level, (tiers.get(level) ?? 0) + 1); }
  const top = Math.max(0, ...tiers.keys());
  const sparseTop = tiers.size >= SPARSE_TOP_MIN_LEVELS && (tiers.get(top) ?? 0) <= Math.max(...tiers.values()) * SPARSE_TOP_LAYER_RATIO;
  const errors = validateOperationalWeightAndCog(container, centered).filter(f => f.severity === 'error');
  return { output: { placements: centered, remaining, loadedWeightKg, usedVolumeM3 }, voids, counts: ordered.map(item => item.quantity - (stock.get(item.id) ?? 0)),
    cgErrors: errors.length, sparseTop, cgExcess: errors.reduce((sum, f) => sum + Math.max(0, (f.value ?? 0) - (f.limit ?? 0)), 0),
    heightMoment: centered.reduce((sum, p) => sum + (p.z + p.height / 2) * p.weightKg, 0) / Math.max(EPS, loadedWeightKg),
    end: x + rowDepth, signature: JSON.stringify(profile), rows: fullRows,
    cgInner: centered.reduce((sum, p) => sum + (p.x + p.length / 2) * p.weightKg, 0) < container.length / 2 * centered.reduce((sum, p) => sum + p.weightKg, 0) };
}

/** The same cartons in the same places, whatever order they are listed in. */
function samePlacements(a: Placement[], b: Placement[]) {
  if (a.length !== b.length) return false;
  const key = (p: Placement) => `${p.cargoId}|${round(p.x)}|${round(p.y)}|${round(p.z)}|${round(p.length)}|${round(p.width)}`;
  const left = a.map(key).sort(), right = b.map(key).sort();
  return left.every((value, index) => value === right[index]);
}

/**
 * Loaded quantity (LOADING_RULES 1, row 3): the plan that loads more cartons first, so that
 * as little as possible is left for a second vehicle; between plans that load as many, the
 * one that loads more of the heavier cargo. Negative when `a` is the better plan.
 */
export function compareLoaded(a: number[], b: number[]) {
  let total = 0;
  for (let i = 0; i < a.length; i++) total += b[i] - a[i];
  if (total) return total;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return b[i] - a[i];
  return 0;
}

/** How two plans of the same cargo are judged (LOADING_RULES 1). Exported for its tests. */
export function compareCandidates(a: Omit<Candidate, 'output'>, b: Omit<Candidate, 'output'>) {
  // Operational CG admissibility precedes preferences. If all candidates fail, preserve
  // the actual error for the final result; never silently call a closest candidate safe.
  // Loadable demand first; CG is a verdict that must not silently remove cargo.
  const loaded = compareLoaded(a.counts, b.counts);
  if (loaded) return loaded;
  if (Boolean(a.cgErrors) !== Boolean(b.cgErrors)) return a.cgErrors ? 1 : -1;
  // Owner sequence (inner-to-door by weight) stays preferred while it loads all cargo within CG.
  if ((a.mode ?? 0) !== (b.mode ?? 0)) return (a.mode ?? 0) - (b.mode ?? 0);
  // Owner rule 2026-11-19: leftovers stand in the last rows. The sequence as built, with a
  // row a cargo could not fill left inside the load, is used only when the other plan loads
  // less or fails the centre-of-gravity verdict it passes.
  if (Boolean(a.leftoversInside) !== Boolean(b.leftoversInside)) return a.leftoversInside ? 1 : -1;
  // Owner rule 2026-11-20: a block is not left lower than the rows behind it. The plan that
  // leaves it open is used only when the filled one loads less or fails the verdict it passes.
  if (Boolean(a.openAbove) !== Boolean(b.openAbove)) return a.openAbove ? 1 : -1;
  if (Math.abs(a.voids - b.voids) > 1e-6) return a.voids - b.voids;
  if (a.cgErrors && Math.abs(a.cgExcess - b.cgExcess) > EPS) return a.cgExcess - b.cgExcess;
  if (a.sparseTop !== b.sparseTop) return a.sparseTop ? 1 : -1;
  return a.heightMoment - b.heightMoment || a.end - b.end || a.signature.localeCompare(b.signature);
}

type LevelPlan = Pick<Candidate, 'counts' | 'cgErrors' | 'cgExcess' | 'heightMoment'>;

/**
 * Level plans in the order they are judged: most cargo first, then the centre-of-gravity
 * verdict, then the lower load.
 *
 * Setting the stacks down in order of height, so that no hole is left inside the load,
 * moves weight along the length, and the verdict outranks it (LOADING_RULES 1, rows 5 and
 * 6). The plans with the stacks left where they were built are made only when the best
 * ordered plan fails the verdict, and only those of them that pass it are added: a hole
 * stays inside the load for no other reason.
 */
export function judgedLevelPlans<T extends LevelPlan>(ordered: T[], asBuilt: () => T[]): T[] {
  const rough = (a: T, b: T) => { const loaded = compareLoaded(a.counts, b.counts); if (loaded) return loaded;
    return Number(Boolean(a.cgErrors)) - Number(Boolean(b.cgErrors)) || a.cgExcess - b.cgExcess || a.heightMoment - b.heightMoment; };
  const plans = [...ordered].sort(rough);
  if (plans[0]?.cgErrors) plans.push(...asBuilt().filter(plan => !plan.cgErrors));
  return plans.sort(rough);
}

/**
 * DIRECT BOX work sequence: X=0 inner wall → +X door; gross box weight descending.
 * Search only order-preserving rectangular, floor-rooted work blocks. Hard layer,
 * cumulative top-load, projected floor load, orientation and payload limits are
 * enforced before generating a column; disjoint columns give full support.
 */
export function packByHeavyInnerBlocks(container: ContainerSpec, cargo: CargoItem[], strategy: StrictWallStrategy, forcedMode?: number): StrictWallOutput {
  const ordered = heavyInnerCargoOrder(container, cargo, strategy);
  const profiles: Profile[] = [];
  for (const orientation of ['efficient', 'normal', 'rotated'] as const) {
    profiles.push({ layerCap: Infinity, lowerPrefix: 0, lowerLayers: 1, orientation });
    const maxLayers = Math.max(1, ...ordered.map(item => heavyInnerLayerLimit(container, item)));
    const lowerCaps = [...new Set([...Array.from({ length: Math.min(12, maxLayers - 1) }, (_, i) => i + 1), Math.ceil(maxLayers / 2)])].filter(n => n < maxLayers);
    for (const layerCap of lowerCaps) profiles.push({ layerCap, lowerPrefix: 0, lowerLayers: 1, orientation });
  }
  // Keep a bounded portfolio in memory instead of retaining every generated carton.
  const candidates: Candidate[] = [];
  const keep = (plan: Candidate) => { candidates.push(plan); candidates.sort(compareCandidates); if (candidates.length > PORTFOLIO) candidates.pop(); };
  for (const profile of profiles) {
    const asBuilt = buildCandidate(container, ordered, strategy, profile);
    const settled = buildCandidate(container, ordered, strategy, profile, true);
    // Where no row was left unfilled inside the load the two are the same plan.
    if (samePlacements(asBuilt.output.placements, settled.output.placements)) keep({ ...asBuilt, profile });
    else { keep({ ...settled, profile }); keep({ ...asBuilt, profile, leftoversInside: true, signature: `${asBuilt.signature}-as-built` }); }
  }
  // Owner rule 2026-11-20: a block is not left lower than the rows behind it. The profiles of
  // the plans kept so far are built once more with their low blocks filled up. Where that
  // changes the plan, the plans of that profile that leave the block open are judged after it.
  const filledPlans: Array<{ profile: Profile; plan: Candidate }> = [];
  const filledFor = new Set<string>();
  for (const { profile } of [...candidates]) {
    if (!profile || filledFor.has(JSON.stringify(profile))) continue;
    filledFor.add(JSON.stringify(profile));
    const filled = buildCandidate(container, ordered, strategy, profile, true, true);
    const kept = candidates.filter(plan => plan.profile === profile);
    if (kept.some(plan => !plan.leftoversInside && samePlacements(plan.output.placements, filled.output.placements))) continue;
    for (const plan of kept) { plan.openAbove = true; if (!plan.leftoversInside) plan.signature = `${plan.signature}-open`; }
    filledPlans.push({ profile, plan: { ...filled, profile } });
  }
  for (const { plan } of filledPlans) keep(plan);
  candidates.sort(compareCandidates);
  // A filled load is shorter, and a light one may then stand too far inside for the centre-of-
  // gravity verdict. Where the best plan so far is not a filled plan that passes it, the filled
  // plans nearest to passing are tried with a step toward the door: the inner rows keep the
  // whole tier cap and the rest stand one tier lower, as few inner rows as still load as much.
  // The load is then as long and low as the container allows, and its top only steps down
  // toward the door. The number of tries is a fixed function of the cargo.
  if (candidates[0] && (candidates[0].openAbove || candidates[0].cgErrors)) {
    const tried = new Set<string>();
    // A step only helps a load whose weight stands too far inside and that stops short of
    // the door by more than the centre of gravity is out by.
    const inside = filledPlans.filter(({ plan }) => Boolean(plan.cgErrors) && plan.cgInner === true && (plan.rows ?? 0) > 0 && plan.cgExcess <= container.length - plan.end + EPS)
      .sort((a, b) => compareCandidates(a.plan, b.plan))
      .filter(({ plan }) => { const key = `${plan.counts}|${plan.end}|${plan.heightMoment}|${plan.cgExcess}`; if (tried.has(key)) return false; tried.add(key); return true; });
    for (const { profile, plan } of inside.slice(0, STEP_TRIALS)) {
      const build = (stepRow: number) => buildCandidate(container, ordered, strategy, { ...profile, stepRow }, true, true);
      let low = 0, high = plan.rows!, best: Candidate | undefined;
      while (low < high) {
        const middle = Math.floor((low + high) / 2), stepped = build(middle);
        if (compareLoaded(stepped.counts, plan.counts) <= 0) { high = middle; best = stepped; } else low = middle + 1;
      }
      if (best) keep(best);
    }
  }
  for (const candidate of candidates) candidate.voids = gapSecuringPlan(container, candidate.output.placements).volumeM3;
  // Heavy-low level loading: used when the sequence cannot load everything within CG.
  const buildLevels = (stepDown: boolean) => { const levels: Candidate[] = []; for (const variant of ['sequential', 'centered'] as const) for (const cap of levelHeightCaps(container, ordered)) {
    const output = packByLevelBlocks(container, ordered, strategy, cap, variant, { stepDown });
    const counted = new Map<string, number>();
    for (const p of output.placements) counted.set(p.cargoId, (counted.get(p.cargoId) ?? 0) + 1);
    const errors = validateOperationalWeightAndCog(container, output.placements).filter(f => f.severity === 'error');
    levels.push({ output, mode: 1, voids: 0, counts: ordered.map(item => counted.get(item.id) ?? 0), cgErrors: errors.length,
      cgExcess: errors.reduce((sum, f) => sum + Math.max(0, (f.value ?? 0) - (f.limit ?? 0)), 0), sparseTop: false,
      heightMoment: output.placements.reduce((sum, p) => sum + (p.z + p.height / 2) * p.weightKg, 0) / Math.max(EPS, output.loadedWeightKg),
      end: Math.max(0, ...output.placements.map(p => p.x + p.length)), signature: `level-${variant}-${cap}${stepDown ? '' : '-as-built'}` });
  } return levels; };
  const levels = judgedLevelPlans(buildLevels(true), () => buildLevels(false));
  for (const candidate of levels.slice(0, 10)) { candidate.voids = gapSecuringPlan(container, candidate.output.placements).volumeM3; candidates.push(candidate); }
  if (forcedMode !== undefined) for (let i = candidates.length - 1; i >= 0; i--) if ((candidates[i].mode ?? 0) !== forcedMode) candidates.splice(i, 1);
  candidates.sort(compareCandidates);
  // Independent final physical audit, including support graph, quantities and unload path.
  for (const candidate of candidates) if (!auditLoading(container, ordered, candidate.output.placements,{minimumSupportRatio:scenarioSupportRatio(container)}).length) return candidate.output;
  return { placements: [], loadedWeightKg: 0, usedVolumeM3: 0, remaining: ordered.map(item => ({ cargoId: item.id, quantity: item.quantity,
    reasonCode: 'NO_FEASIBLE_EMS', reason: '중량순 연속 적재의 최종 안전 재검사에 실패했습니다.' })) };
}
