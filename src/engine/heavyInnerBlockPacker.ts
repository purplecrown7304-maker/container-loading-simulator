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

const EPS = 1e-8;
const fit = (room: number, size: number) => Math.max(0, Math.floor((room + EPS) / size));
const round = (value: number) => Math.round(value * 1e9) / 1e9;
type FloorOrientation = { length: number; width: number; rotated: boolean };
type Profile = { layerCap: number; lowerPrefix: number; lowerLayers: number; orientation: 'efficient' | 'normal' | 'rotated' };
type Candidate = { output: StrictWallOutput; counts: number[]; cgErrors: number; cgExcess: number; sparseTop: boolean; heightMoment: number; end: number; signature: string };

function floorOrientations(item: CargoItem): FloorOrientation[] {
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
  const advance = () => { x = round(x + rowDepth); y = 0; rowDepth = 0; };

  // Fill equal-weight side lanes before closing a front. This creates adjacent
  // continuous SKU lanes, not a lighter gap-fill behind later heavy rows.
  const fillEqualWeightSide = (current: CargoItem, currentIndex: number) => {
    for (const filler of ordered.slice(currentIndex + 1)) {
      if (Math.abs(filler.weightKg - current.weightKg) > EPS) continue;
      if (strict && (filler.unloadPriority ?? 1) !== (current.unloadPriority ?? 1)) continue;
      const layers = Math.min(heavyInnerLayerLimit(container, filler), profile.layerCap);
      if (layers < 1 || (stock.get(filler.id) ?? 0) <= 0) continue;
      const options = floorOrientations(filler).flatMap(o => {
        if (o.length > rowDepth + EPS) return [];
        const count = Math.min(stock.get(filler.id) ?? 0, fit(container.width - y, o.width) * layers,
          filler.weightKg > EPS ? fit(container.maxPayloadKg - loadedWeightKg, filler.weightKg) : Infinity);
        return count > 0 ? [{ ...o, count, columns: Math.ceil(count / layers) }] : [];
      }).sort((a, b) => b.count - a.count || a.length - b.length || Number(a.rotated) - Number(b.rotated));
      const option = options[0];
      if (!option) continue;
      for (let iz = 0; iz < layers; iz++) for (let iy = 0; iy < option.columns; iy++) {
        if (iy * layers + iz >= option.count) continue;
        placements.push({ cargoId: filler.id, x, y: round(y + iy * option.width), z: round(iz * filler.height),
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
        placements.push(candidate);
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
      const options = orientations.flatMap(o => {
        if (x + o.length > container.length + EPS) return [];
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
      const fullColumns = Math.floor(chosen.count / layers);
      const tailLayers = chosen.count % layers;
      for (let iz = 0; iz < layers; iz++) for (let iy = 0; iy < chosen.columns; iy++) {
        if (iy >= fullColumns && iz >= tailLayers) continue;
        placements.push({ cargoId: item.id, x, y: round(y + iy * chosen.width), z: round(iz * item.height),
          length: chosen.length, width: chosen.width, height: item.height, weightKg: item.weightKg, rotated: chosen.rotated });
      }
      y = round(y + chosen.columns * chosen.width);
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
  for (const p of placements) { const group = rowGroups.get(p.x) ?? []; group.push(p); rowGroups.set(p.x, group); }
  const centered = [...rowGroups.values()].flatMap(row => centerHeavyInnerLaterally(container, row));
  const tiers = new Map<number, number>();
  for (const p of centered) { const level = Math.round(p.z * 1000); tiers.set(level, (tiers.get(level) ?? 0) + 1); }
  const top = Math.max(0, ...tiers.keys());
  const sparseTop = tiers.size >= SPARSE_TOP_MIN_LEVELS && (tiers.get(top) ?? 0) <= Math.max(...tiers.values()) * SPARSE_TOP_LAYER_RATIO;
  const errors = validateOperationalWeightAndCog(container, centered).filter(f => f.severity === 'error');
  return { output: { placements: centered, remaining, loadedWeightKg, usedVolumeM3 }, counts: ordered.map(item => item.quantity - (stock.get(item.id) ?? 0)),
    cgErrors: errors.length, sparseTop, cgExcess: errors.reduce((sum, f) => sum + Math.max(0, (f.value ?? 0) - (f.limit ?? 0)), 0),
    heightMoment: centered.reduce((sum, p) => sum + (p.z + p.height / 2) * p.weightKg, 0) / Math.max(EPS, loadedWeightKg),
    end: x + rowDepth, signature: JSON.stringify(profile) };
}

function compareCandidates(a: Candidate, b: Candidate) {
  // Operational CG admissibility precedes preferences. If all candidates fail, preserve
  // the actual error for the final result; never silently call a closest candidate safe.
  if (Boolean(a.cgErrors) !== Boolean(b.cgErrors)) return a.cgErrors ? 1 : -1;
  for (let i = 0; i < a.counts.length; i++) if (a.counts[i] !== b.counts[i]) return b.counts[i] - a.counts[i];
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
export function packByHeavyInnerBlocks(container: ContainerSpec, cargo: CargoItem[], strategy: StrictWallStrategy): StrictWallOutput {
  const ordered = heavyInnerCargoOrder(container, cargo, strategy);
  const profiles: Profile[] = [];
  for (const orientation of ['efficient', 'normal', 'rotated'] as const) {
    profiles.push({ layerCap: Infinity, lowerPrefix: 0, lowerLayers: 1, orientation });
    const maxLayers = Math.max(1, ...ordered.map(item => heavyInnerLayerLimit(container, item)));
    const lowerCaps = [...new Set([...Array.from({ length: Math.min(12, maxLayers - 1) }, (_, i) => i + 1), Math.ceil(maxLayers / 2)])].filter(n => n < maxLayers);
    for (const layerCap of lowerCaps) profiles.push({ layerCap, lowerPrefix: 0, lowerLayers: 1, orientation });
    // Fixed input-independent search resolution, not a wall-clock/device cutoff.
    for (const layerCap of [Infinity, ...lowerCaps.filter(n => n > 1)]) {
      for (let step = 1; step <= 32; step++) profiles.push({ layerCap, lowerPrefix: step / 32, lowerLayers: 1, orientation });
    }
  }
  // Keep a bounded portfolio in memory instead of retaining every generated carton.
  const candidates: Candidate[] = [];
  for (const profile of profiles) {
    candidates.push(buildCandidate(container, ordered, strategy, profile));
    candidates.sort(compareCandidates);
    if (candidates.length > 8) candidates.pop();
  }
  // Independent final physical audit, including support graph, quantities and unload path.
  for (const candidate of candidates) if (!auditLoading(container, ordered, candidate.output.placements,{minimumSupportRatio:scenarioSupportRatio(container)}).length) return candidate.output;
  return { placements: [], loadedWeightKg: 0, usedVolumeM3: 0, remaining: ordered.map(item => ({ cargoId: item.id, quantity: item.quantity,
    reasonCode: 'NO_FEASIBLE_EMS', reason: '중량순 연속 적재의 최종 안전 재검사에 실패했습니다.' })) };
}
