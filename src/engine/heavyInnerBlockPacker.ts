import { SPARSE_TOP_LAYER_RATIO, SPARSE_TOP_MIN_LEVELS } from './topLayerSettling';
import { auditLoading } from './loadingAudit';
import { isInsideContainer, overlaps } from './constraints';
import { hasAdequateSupport, scenarioSupportRatio } from './support';
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
type Profile = { layerCap: number; lowerPrefix: number; lowerLayers: number; orientation: 'efficient' | 'normal' | 'rotated' };
type Candidate = { output: StrictWallOutput; mode?: number; voids: number; counts: number[]; cgErrors: number; cgExcess: number; sparseTop: boolean; heightMoment: number; end: number; signature: string };

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

function buildCandidate(container: ContainerSpec, ordered: CargoItem[], strategy: StrictWallStrategy, profile: Profile): Candidate {
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
  let previousStop: number | undefined;
  let rowId = 0;
  const groupOf = new Map<Placement, number>();
  const put = (p: Placement) => { groupOf.set(p, rowId); placements.push(p); };
  const advance = () => { x = round(x + rowDepth); y = 0; rowDepth = 0; rowId++; };

  // Fill equal-weight side lanes before closing a front. This creates adjacent
  // continuous SKU lanes, not a lighter gap-fill behind later heavy rows.
  const fillEqualWeightSide = (current: CargoItem, currentIndex: number) => {
    for (const filler of ordered.slice(currentIndex + 1)) {
      if (Math.abs(filler.weightKg - current.weightKg) > EPS) continue;
      if (strict && (filler.unloadPriority ?? 1) !== (current.unloadPriority ?? 1)) continue;
      const layers = Math.min(heavyInnerLayerLimit(container, filler), profile.layerCap);
      if (layers < 1 || (stock.get(filler.id) ?? 0) <= 0) continue;
      const options = floorOrientations(filler).flatMap(o => {
        if (Math.abs(o.length - rowDepth) > 1e-6) return [];
        const count = Math.min(stock.get(filler.id) ?? 0, fit(container.width - y, o.width) * layers,
          filler.weightKg > EPS ? fit(container.maxPayloadKg - loadedWeightKg, filler.weightKg) : Infinity);
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
      loadedWeightKg += option.count * filler.weightKg;
      usedVolumeM3 += option.count * filler.length * filler.width * filler.height;
      y = round(y + option.columns * option.width);
    }
  };
  const fillCurrentFrontTop = (item: CargoItem, orientations: FloorOrientation[]) => {
    if (item.floorOnly || item.strengthUnverified || Math.min(item.maxStackLayers ?? Infinity, profile.layerCap) < 2) return false;
    for (const support of placements.filter(p => Math.abs(p.x - x) <= EPS && p.cargoId !== item.id && p.weightKg >= item.weightKg - EPS).sort((a, b) => a.z - b.z || a.y - b.y)) {
      for (const o of orientations) {
        if (scenarioSupportRatio(container,.999) >= .999 && (Math.abs(o.length - support.length) > EPS || Math.abs(o.width - support.width) > EPS)) continue;
        const candidate: Placement = { cargoId: item.id, x, y: support.y, z: round(support.z + support.height),
          length: o.length, width: o.width, height: item.height, weightKg: item.weightKg, rotated: o.rotated };
        if (!isInsideContainer(container, candidate) || !withinFloorLoadLimit(container, candidate, placements)) continue;
        if (placements.some(p => overlaps(p, candidate)) || !hasAdequateSupport(candidate, placements, undefined, scenarioSupportRatio(container,.999))) continue;
        if (countStackLayersBelow(candidate, placements) > profile.layerCap || !canPlaceByStackingRules(byId.get(item.id)!, candidate, placements, byId)) continue;
        if (!acceptsUnloadCandidate(container, byId, placements, candidate)) continue;
        put(candidate);
        loadedWeightKg += item.weightKg;
        usedVolumeM3 += item.length * item.width * item.height;
        return true;
      }
    }
    return false;
  };

  for (const [itemIndex, item] of ordered.entries()) {
    const stop = item.unloadPriority ?? 1;
    if (strict && previousStop != null && stop !== previousStop && rowDepth > EPS) advance();
    previousStop = stop;
    const hardLayers = heavyInnerLayerLimit(container, item);
    const maxLayers = Math.min(hardLayers, profile.layerCap);
    const orientations = floorOrientations(item);
    let left = Math.max(0, Math.floor(stock.get(item.id) ?? 0));
    // A compact low-tier prefix is a geometry alternative, never a gap or wall permutation.
    let lowerLeft = maxLayers > 1 ? Math.min(left, prefixRemaining) : 0;
    prefixRemaining = Math.max(0, prefixRemaining - lowerLeft);
    let blocked = '';
    while (left > 0) {
      const payloadCount = item.weightKg > EPS ? fit(container.maxPayloadKg - loadedWeightKg, item.weightKg) : left;
      if (payloadCount < 1) { blocked = 'PAYLOAD_LIMIT'; break; }
      if (item.height > container.height + EPS || !orientations.some(o => o.length <= container.length + EPS && o.width <= container.width + EPS)) { blocked = orientations.length ? 'SIZE_LIMIT' : 'ORIENTATION_RESTRICTED'; break; }
      if (maxLayers < 1) { blocked = floorLoadLayerCap(container, item) < 1 ? 'FLOOR_LOAD_LIMIT' : 'STACK_LIMIT'; break; }
      const layers = lowerLeft > 0 ? Math.min(maxLayers, profile.lowerLayers) : maxLayers;
      const available = Math.min(left, payloadCount, lowerLeft > 0 ? lowerLeft : left);
      // Width-filling pinwheel block (column stacked): mixed floor orientations share one depth.
      if (profile.orientation === 'efficient' && y <= EPS && rowDepth <= EPS && orientations.length === 2) {
        const pw = pinwheelBlock(item, container.width);
        if (pw && x + pw.depth <= container.length + EPS && available >= pw.positions.length) {
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
    }
    if (left) remaining.push({ cargoId: item.id, quantity: left, reasonCode: blocked === 'SIZE_LIMIT' ? 'NO_FEASIBLE_EMS' : blocked || 'NO_FEASIBLE_EMS', reason:
      blocked === 'SIZE_LIMIT' ? '박스 크기가 허용 회전 방향에서 컨테이너 적재공간을 초과함'
        : blocked === 'PAYLOAD_LIMIT' ? '컨테이너 최대 적재 중량을 초과하므로 추가 적재하지 못함'
        : blocked === 'FLOOR_LOAD_LIMIT' ? FLOOR_LOAD_REASON
          : blocked === 'STACK_LIMIT' ? '신고된 적층·상부하중·높이 한도 안에서 연속 작업 블록을 만들 수 없음'
            : blocked === 'ORIENTATION_RESTRICTED' ? '허용된 바닥 방향으로 배치할 수 없음'
              : '안쪽부터 중량순으로 진행하는 연속 작업 블록에 안전한 자리가 부족함' });
  }
  // Rows are disjoint in X. Center each row laterally as one rigid support group,
  // rather than leave short boundary rows against a side wall.
  const rowGroups = new Map<number, Placement[]>();
  for (const p of placements) { const key = groupOf.get(p) ?? 0; const group = rowGroups.get(key) ?? []; group.push(p); rowGroups.set(key, group); }
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
  const errors = validateOperationalWeightAndCog(container, centered, { legacyDirectBox: true }).filter(f => f.severity === 'error');
  return { output: { placements: centered, remaining, loadedWeightKg, usedVolumeM3 }, voids, counts: ordered.map(item => item.quantity - (stock.get(item.id) ?? 0)),
    cgErrors: errors.length, sparseTop, cgExcess: errors.reduce((sum, f) => sum + Math.max(0, (f.value ?? 0) - (f.limit ?? 0)), 0),
    heightMoment: centered.reduce((sum, p) => sum + (p.z + p.height / 2) * p.weightKg, 0) / Math.max(EPS, loadedWeightKg),
    end: x + rowDepth, signature: JSON.stringify(profile) };
}

function compareCandidates(a: Candidate, b: Candidate) {
  // Operational CG admissibility precedes preferences. If all candidates fail, preserve
  // the actual error for the final result; never silently call a closest candidate safe.
  // Loadable demand first; CG is a verdict that must not silently remove cargo.
  for (let i = 0; i < a.counts.length; i++) if (a.counts[i] !== b.counts[i]) return b.counts[i] - a.counts[i];
  if (Boolean(a.cgErrors) !== Boolean(b.cgErrors)) return a.cgErrors ? 1 : -1;
  // Owner sequence (inner-to-door by weight) stays preferred while it loads all cargo within CG.
  if ((a.mode ?? 0) !== (b.mode ?? 0)) return (a.mode ?? 0) - (b.mode ?? 0);
  if (Math.abs(a.voids - b.voids) > 1e-6) return a.voids - b.voids;
  if (a.cgErrors && Math.abs(a.cgExcess - b.cgExcess) > EPS) return a.cgExcess - b.cgExcess;
  if (a.sparseTop !== b.sparseTop) return a.sparseTop ? 1 : -1;
  return a.heightMoment - b.heightMoment || a.end - b.end || a.signature.localeCompare(b.signature);
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
  for (const profile of profiles) {
    candidates.push(buildCandidate(container, ordered, strategy, profile));
    candidates.sort(compareCandidates);
    if (candidates.length > 8) candidates.pop();
  }
  for (const candidate of candidates) candidate.voids = gapSecuringPlan(container, candidate.output.placements).volumeM3;
  // Heavy-low level loading: used when the sequence cannot load everything within CG.
  const levels: Candidate[] = [];
  for (const variant of ['sequential', 'centered'] as const) for (const cap of levelHeightCaps(container, ordered)) {
    const output = packByLevelBlocks(container, ordered, strategy, cap, variant);
    const counted = new Map<string, number>();
    for (const p of output.placements) counted.set(p.cargoId, (counted.get(p.cargoId) ?? 0) + 1);
    const errors = validateOperationalWeightAndCog(container, output.placements, { legacyDirectBox: true }).filter(f => f.severity === 'error');
    levels.push({ output, mode: 1, voids: 0, counts: ordered.map(item => counted.get(item.id) ?? 0), cgErrors: errors.length,
      cgExcess: errors.reduce((sum, f) => sum + Math.max(0, (f.value ?? 0) - (f.limit ?? 0)), 0), sparseTop: false,
      heightMoment: output.placements.reduce((sum, p) => sum + (p.z + p.height / 2) * p.weightKg, 0) / Math.max(EPS, output.loadedWeightKg),
      end: Math.max(0, ...output.placements.map(p => p.x + p.length)), signature: `level-${variant}-${cap}` });
  }
  const rough = (a: Candidate, b: Candidate) => { for (let i = 0; i < a.counts.length; i++) if (a.counts[i] !== b.counts[i]) return b.counts[i] - a.counts[i];
    return Number(Boolean(a.cgErrors)) - Number(Boolean(b.cgErrors)) || a.cgExcess - b.cgExcess || a.heightMoment - b.heightMoment; };
  levels.sort(rough);
  for (const candidate of levels.slice(0, 10)) { candidate.voids = gapSecuringPlan(container, candidate.output.placements).volumeM3; candidates.push(candidate); }
  if (forcedMode !== undefined) for (let i = candidates.length - 1; i >= 0; i--) if ((candidates[i].mode ?? 0) !== forcedMode) candidates.splice(i, 1);
  candidates.sort(compareCandidates);
  // Independent final physical audit, including support graph, quantities and unload path.
  for (const candidate of candidates) if (!auditLoading(container, ordered, candidate.output.placements,{minimumSupportRatio:scenarioSupportRatio(container)}).length) return candidate.output;
  return { placements: [], loadedWeightKg: 0, usedVolumeM3: 0, remaining: ordered.map(item => ({ cargoId: item.id, quantity: item.quantity,
    reasonCode: 'NO_FEASIBLE_EMS', reason: '중량순 연속 적재의 최종 안전 재검사에 실패했습니다.' })) };
}
