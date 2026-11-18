import { usableHeight, validatePlacements } from './constraints';
import { isARules } from './loadingRuleset';
import { validateOperationalLoading } from './operationalValidator';
import { centerPalletPlan } from './palletCentering';
import { buildPalletLoadFromDeckPlacements, palletTopLayerFill, type PalletLoad, type PalletPackingResult, type PalletSpec } from './palletPacking';
import { palletSupportBodies } from './palletPlanValidation';
import { palletTipViolations } from './palletTransportStability';
import { canPlaceByStackingRules } from './stacking';
import { hasAdequateSupport } from './support';
import type { CargoItem, ContainerSpec, Placement } from './types';

const EPS = 1e-9;
const MAX_STRIP_SPLITS = 16;
type Grid = { x: number; y: number; cols: number; rows: number; length: number; width: number; rotated: boolean };
type LayerPattern = { grids: Grid[]; count: number };
const fit = (space: number, size: number) => Math.max(0, Math.floor((space + EPS) / size));
const same = (a: number, b: number) => Math.abs(a - b) <= EPS;

/** Fixed-size search; grids describe slots without allocating the entire pallet deck. */
function layerPatterns(item: CargoItem, spec: PalletSpec): LayerPattern[] {
  const patterns: LayerPattern[] = [];
  const seen = new Set<string>();
  const add = (grids: Grid[]) => {
    const occupied = grids.filter(grid => grid.cols > 0 && grid.rows > 0);
    const count = occupied.reduce((sum, grid) => sum + grid.cols * grid.rows, 0);
    const key = JSON.stringify(occupied);
    if (!Number.isSafeInteger(count) || count < 1 || seen.has(key)) return;
    seen.add(key);
    patterns.push({ grids: occupied, count });
  };
  for (const rotated of [false, true]) {
    const length = rotated ? item.width : item.length;
    const width = rotated ? item.length : item.width;
    const cols = fit(spec.length, length), rows = fit(spec.width, width);
    add([{ x: 0, y: 0, cols, rows, length, width, rotated }]);
    // Mix a rectangular main grid with rotated cartons in one remaining strip.
    // Near-maximum splits include the common grid + one strip case, independent
    // of device speed or carton count. Both horizontal directions are searched.
    for (let split = cols; split > Math.max(0, cols - MAX_STRIP_SPLITS); split--) {
      const x = split * length;
      add([
        { x: 0, y: 0, cols: split, rows, length, width, rotated },
        { x, y: 0, cols: fit(spec.length - x, width), rows: fit(spec.width, length), length: width, width: length, rotated: !rotated },
      ]);
    }
    for (let split = rows; split > Math.max(0, rows - MAX_STRIP_SPLITS); split--) {
      const y = split * width;
      add([
        { x: 0, y: 0, cols, rows: split, length, width, rotated },
        { x: 0, y, cols: fit(spec.length, width), rows: fit(spec.width - y, length), length: width, width: length, rotated: !rotated },
      ]);
    }
  }
  // Stable insertion order resolves equal-capacity alternatives deterministically.
  return patterns.sort((a, b) => b.count - a.count);
}

function slotAt(pattern: LayerPattern, index: number) {
  for (const grid of pattern.grids) {
    const count = grid.cols * grid.rows;
    if (index < count) return { x: grid.x + Math.floor(index / grid.rows) * grid.length,
      y: grid.y + (index % grid.rows) * grid.width, length: grid.length, width: grid.width, rotated: grid.rotated };
    index -= count;
  }
  throw new Error('PALLET_LAYER_SLOT_OUT_OF_RANGE');
}

function cargoHeight(load: PalletLoad) {
  return load.cargoPlacements.reduce((height, p) => Math.max(height, p.z + p.height - load.z - load.height), 0);
}

function movedLoad(load: PalletLoad, original: PalletLoad): PalletLoad {
  return { ...original, ...load, palletIndex: original.palletIndex, stackColumn: original.stackColumn,
    stackLevel: original.stackLevel, bandingPlan: original.bandingPlan, isMixedTail: original.isMixedTail,
    x: original.x, y: original.y, z: original.z,
    cargoPlacements: load.cargoPlacements.map(p => ({ ...p, x: p.x + original.x, y: p.y + original.y, z: p.z + original.z })),
    centerOfGravity: { x: load.centerOfGravity.x + original.x, y: load.centerOfGravity.y + original.y, z: load.centerOfGravity.z + original.z } };
}

function rebuild(input: PalletPackingResult, pallets: PalletLoad[], spec: PalletSpec, container: ContainerSpec): PalletPackingResult {
  const sum = (key: 'cargoWeightKg' | 'packagingWeightKg' | 'totalWeightKg') => pallets.reduce((total, load) => total + load[key], 0);
  const sideWeights = [0, 0];
  for (const load of pallets) {
    const delta = load.centerOfGravity.y - container.width / 2;
    if (Math.abs(delta) > 1e-6) sideWeights[delta < 0 ? 0 : 1] += load.totalWeightKg;
  }
  return { ...input, pallets, placements: pallets.flatMap(load => load.cargoPlacements), palletCount: pallets.length,
    loadedCargoWeightKg: sum('cargoWeightKg'), totalPackagingWeightKg: sum('packagingWeightKg'),
    totalPalletizedWeightKg: sum('totalWeightKg'), packagedPalletCount: pallets.filter(load => load.cornerGuardsUsed || load.wrappingUsed).length,
    avoidedPackagingWeightKg: spec.minimizePackaging ? pallets.reduce((total, load) => total
      + (load.cornerGuardsUsed ? 0 : spec.cornerGuardWeightKg) + (load.wrappingUsed ? 0 : spec.wrappingWeightKg), 0) : 0,
    lateralImbalanceKg: Math.abs(sideWeights[0] - sideWeights[1]), stackedPallets: 0, maxUsedStackLevel: pallets.length ? 1 : 0 };
}

/**
 * Rebuild an already selected homogeneous shipment on its existing pallet bases.
 * This never changes demand, declared limits or transport criteria.
 * A mixed-orientation strip can use deck space lost by separately centred grids,
 * which lowers the load and can free whole bases (the first bases are kept).
 * Fewer bases are accepted only while every unit load stays inside the transport
 * tipping limit (LOADING_RULES 7A), so this postpass cannot create a smaller but
 * taller shipment that the safety certification would reject.
 */
export function flattenPalletLayers(input: PalletPackingResult, container: ContainerSpec, cargo: CargoItem[], spec: PalletSpec): PalletPackingResult {
  if (isARules(container) || container.limitReview || input.limitReview || !input.pallets.length || !input.placements.length) return input;
  if (input.palletCount !== input.pallets.length || input.pallets.some(load => load.stackLevel !== 1 || !same(load.z, 0)
    || !load.cargoPlacements.length || !same(load.length, spec.length) || !same(load.width, spec.width) || !same(load.height, spec.height))) return input;
  // Rule #97 has one terminal mixed tail for this single-stop shipment. Never
  // transfer its exemption to a regular base or move an earlier tail through it.
  if (input.pallets.some((load, index) => load.isMixedTail && index !== input.pallets.length - 1)) return input;
  const cargoById = new Map(cargo.map(item => [item.id, item]));
  if (cargoById.size !== cargo.length) return input;
  const templates = input.pallets.flatMap(load => load.cargoPlacements);
  if (templates.length !== input.placements.length) return input;
  const rows = [...new Set(templates.map(p => p.cargoId))].map(id => cargoById.get(id));
  if (rows.some(item => !item)) return input;
  const items = rows as CargoItem[];
  const first = items[0];
  if (!first || ![first.length, first.width, first.height, spec.length, spec.width].every(value => Number.isFinite(value) && value > 0)) return input;
  if (items.some(item => !same(item.length, first.length) || !same(item.width, first.width) || !same(item.height, first.height)
    || item.allowRotation === false || item.strengthUnverified || (item.maxStackLayers !== undefined && item.maxStackLayers < 2)
    || item.floorOnly || item.unitKind === 'pallet' || item.cgOffsetMm
    || (item.allowedOrientations && (!item.allowedOrientations.includes('LWH') || !item.allowedOrientations.includes('WLH'))))) return input;
  if (new Set(items.map(item => item.unloadPriority ?? 0)).size > 1) return input;
  if (templates.some(p => { const item = cargoById.get(p.cargoId)!; return !same(p.height, item.height) || !same(p.weightKg, item.weightKg)
    || (p.orientation !== undefined && p.orientation !== 'LWH' && p.orientation !== 'WLH'); })) return input;
  for (const item of items) {
    const count = templates.filter(p => p.cargoId === item.id).length;
    if (count > item.quantity || input.placements.filter(p => p.cargoId === item.id).length !== count) return input;
  }

  // Freeze individual loaded units (including IDs) and balance their count across
  // existing bases. Heavy units enter every pallet first and remain below lighter ones.
  const ordered = templates.map((placement, index) => ({ placement, index })).sort((a, b) => b.placement.weightKg - a.placement.weightKg
    || a.placement.cargoId.localeCompare(b.placement.cargoId) || a.index - b.index);
  const oldHeight = Math.max(...input.pallets.map(cargoHeight));
  const inputTipViolations = palletTipViolations(centerPalletPlan(input, container).pallets, spec).length;
  const patterns = layerPatterns(first, spec);
  const maxCargoHeight = usableHeight(container) - spec.height;
  // Fewest bases first. A denser tier pattern may carry the same cartons on fewer
  // pallets, but only when every rebuilt unit stays inside the transport tipping
  // limit: a smaller, taller shipment that cannot pass certification is never built.
  // With the original base count the pass only lowers the load, as before.
  for (let baseCount = 1; baseCount <= input.pallets.length; baseCount += 1) {
    const fewerBases = baseCount < input.pallets.length;
    const maxCount = Math.ceil(ordered.length / baseCount);
    for (const pattern of patterns) {
      const height = Math.ceil(maxCount / pattern.count) * first.height;
      if (fewerBases ? height > maxCargoHeight + EPS : height >= oldHeight - EPS) continue;
      const candidate = rebuildOnBases(baseCount, pattern);
      if (candidate) return candidate;
    }
  }
  return input;

  function rebuildOnBases(baseCount: number, pattern: LayerPattern): PalletPackingResult | null {
    const fewerBases = baseCount < input.pallets.length;
    const assigned: Placement[][] = Array.from({ length: baseCount }, () => []);
    ordered.forEach(({ placement }, index) => assigned[index % assigned.length].push(placement));
    const pallets: PalletLoad[] = [];
    for (const [index, units] of assigned.entries()) {
      const local: Placement[] = [], columns = new Map<number, Placement[]>();
      let failed = false;
      for (const [unitIndex, template] of units.entries()) {
        const item = cargoById.get(template.cargoId)!;
        const cellIndex = unitIndex % pattern.count;
        const cell = slotAt(pattern, cellIndex);
        const placement: Placement = { ...template, ...cell, z: Math.floor(unitIndex / pattern.count) * first.height,
          ...(template.orientation ? { orientation: cell.rotated ? 'WLH' as const : 'LWH' as const } : {}) };
        const below = columns.get(cellIndex) ?? [];
        // The repeated pattern gives disjoint vertical columns. Their complete
        // support/ancestor graph is precisely this column; the final whole-plan
        // validator independently checks support and cumulative transmitted loads.
        if (!hasAdequateSupport(placement, below) || !canPlaceByStackingRules(item, placement, below, cargoById)) { failed = true; break; }
        below.push(placement); columns.set(cellIndex, below); local.push(placement);
      }
      if (failed) break;
      const load = movedLoad(buildPalletLoadFromDeckPlacements(input.pallets[index].palletIndex, local, spec), input.pallets[index]);
      const staticLimit = spec.maxStaticLoadKg && spec.maxStaticLoadKg > 0 ? spec.maxStaticLoadKg : Infinity;
      if (load.cargoWeightKg > spec.maxLoadKg + EPS || load.cargoWeightKg + load.packagingWeightKg > staticLimit + EPS
        || load.z + load.height + cargoHeight(load) + load.packagingExtraHeightM > usableHeight(container) + EPS
        || (!load.isMixedTail && palletTopLayerFill(load) + EPS < (spec.minTopLayerFillRatio ?? .5))) break;
      pallets.push(load);
    }
    if (pallets.length !== baseCount) return null;
    const candidate = rebuild(input, pallets, spec, container);
    if (candidate.totalPalletizedWeightKg > container.maxPayloadKg + EPS) return null;
    // Normal final centering translates the whole group. Validate that exact plan
    // while retaining the original base coordinates in the returned postpass.
    const centered = centerPalletPlan(candidate, container);
    const tipViolations = palletTipViolations(centered.pallets, spec).length;
    if (fewerBases ? tipViolations > 0 : tipViolations > inputTipViolations) return null;
    if (validatePlacements(container, centered.placements).length
      || validateOperationalLoading(container, cargo, centered.placements, palletSupportBodies(centered)).some(finding => finding.severity === 'error')) return null;
    return candidate;
  }
}
