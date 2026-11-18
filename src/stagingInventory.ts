import type { CargoItem, ContainerSpec, LoadingResult, Placement } from './engine/types';
import { preflightCargoInput, type RejectedCargoRow } from './engine/inputPreflight';
import { buildPalletPackaging } from './engine/mixedModePacking';
import { defaultPalletSpec, packOnPallets, type PalletLoad, type PalletSpec } from './engine/palletOptimization';
import type { LoadingStrategy } from './engine/loadingEngine';

export type StagingMode = 'boxes' | 'pallets' | 'mixed';
export type StagingReason = { reason: string; reasonCode?: string };
export type StagingBoxIdentity = { id: string; cargoId: string; stableId: string };
export type StagingUnitContent = { cargoId: string; name: string; boxCount: number; displayColor?: string; labelCode?: string; unitsPerPackage?: number };
/** Aliases only, never a second quantity/location store. */
export type StagingIdentityHints = { unitToStableId: Record<string, string> };
export type StagingUnit = {
  id: string;
  kind: 'box' | 'pallet';
  name: string;
  cargoId?: string;
  cargoIds: string[];
  /** Derived display metadata for the root's real box members. */
  contents?: StagingUnitContent[];
  length: number;
  width: number;
  height: number;
  weightKg: number;
  boxCount: number;
  displayColor?: string;
  unloadPriorities: number[];
  location: 'yard' | 'vehicle' | 'other-vehicle';
  verdict: 'pending' | 'checking' | 'placed' | 'unloaded' | 'error';
  reasons: StagingReason[];
  boxUnits: StagingBoxIdentity[];
  placement?: Placement;
  sourcePlacementIndex?: number;
  sourcePlacementIndexes?: number[];
  sourcePalletIndex?: number;
  vehicleId?: string;
  pallet?: PalletLoad;
  palletSpec?: PalletSpec;
  /** Engine Z-up, relative to the pallet base. Box Z includes the deck height. */
  localPlacements?: Placement[];
  packaging?: { bandingStraps: number; wrapping: boolean; cornerGuards: boolean; source?: 'transport-reinforcement' };
  /** Unbuilt pallet-mode cartons must not be manually loaded as loose cargo. */
  requiresPackaging?: boolean;
};
export type StagingCounts = { pallets: number; looseBoxes: number; boxes: number; weightKg: number };
export type StagingSelectedPlan = {
  inputSignature: string;
  result: LoadingResult;
  pallets?: PalletLoad[];
  vehicleId?: string;
};
export type StagingPackagingPlan = {
  inputSignature: string;
  status: 'pending' | 'ready' | 'error';
  pallets: PalletLoad[];
  remaining?: RejectedCargoRow[];
  error?: string;
  scope?: 'all' | 'yard';
  reservedCounts?: Record<string, number>;
};
export type StagingInput = {
  scopeKey: string;
  mode: StagingMode;
  container: ContainerSpec;
  cargo: CargoItem[];
  palletSpec?: PalletSpec;
  strategy?: LoadingStrategy;
};
export type StagingInventoryInput = StagingInput & {
  packaging?: StagingPackagingPlan;
  selectedPlan?: StagingSelectedPlan;
  /** Only other vehicles from the SAME accepted plan; never comparison candidates. */
  otherVehicles?: Array<StagingSelectedPlan & { vehicleId: string }>;
  calculating?: boolean;
  identity?: StagingIdentityHints;
};
export type StagingInventory = {
  inputSignature: string;
  units: StagingUnit[];
  yardUnits: StagingUnit[];
  vehicleUnits: StagingUnit[];
  otherVehicleUnits: StagingUnit[];
  summary: { total: StagingCounts; vehicle: StagingCounts; otherVehicles: StagingCounts; yard: StagingCounts; unloaded: StagingCounts };
  excluded: RejectedCargoRow[];
  issues: string[];
  packagingStatus: 'not-required' | StagingPackagingPlan['status'];
  referenceResult: boolean;
  identity: StagingIdentityHints;
};

const LABEL_FIELDS = new Set(['name', 'displayColor', 'productName', 'boxName']);
function canonical(value: unknown): unknown {
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key, item]) => item !== undefined && !LABEL_FIELDS.has(key))
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}

/** Order-independent input provenance; camera, labels and current selection do not enter it. */
export function stagingInputSignature(input: StagingInput): string {
  const cargo = input.cargo.map(row => canonical({ ...row, id: row.id?.trim() ?? '', allowRotation: row.allowRotation !== false }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return 'staging-v1:' + JSON.stringify(canonical({ scopeKey: input.scopeKey, mode: input.mode,
    container: input.container, cargo, strategy: input.strategy ?? 'capacity',
    palletSpec: input.mode === 'boxes' ? undefined : input.palletSpec ?? defaultPalletSpec }));
}

function stableBoxId(scope: string, cargoId: string, ordinal: number) {
  return 'staging-box:' + encodeURIComponent(scope) + ':' + encodeURIComponent(cargoId) + ':' + ordinal;
}
function fingerprint(value: unknown) {
  const text = JSON.stringify(value);
  let a = 2166136261; let b = 5381;
  for (let index = 0; index < text.length; index++) {
    a = Math.imul(a ^ text.charCodeAt(index), 16777619);
    b = Math.imul(b, 33) ^ text.charCodeAt(index);
  }
  return (a >>> 0).toString(36) + '-' + (b >>> 0).toString(36);
}
function placementKey(p: Placement) {
  return JSON.stringify([p.cargoId, p.x, p.y, p.z, p.length, p.width, p.height, p.weightKg]);
}
function localPlacement(p: Placement, load: PalletLoad) {
  return { ...p, x: p.x - load.x, y: p.y - load.y, z: p.z - load.z };
}
/**
 * Content key of a built pallet: its size, packaging and its cartons in a canonical order.
 * Each carton row is serialised once and the rows are ordered by that text. Rows with the
 * same text are identical, so the key is the one the former comparator (which serialised
 * both rows again on every comparison) produced.
 */
export function stagingLoadKey(load: PalletLoad) {
  const rows = load.cargoPlacements.map(p => {
    const local = localPlacement(p, load);
    const row = [local.cargoId, ...[local.x, local.y, local.z, local.length, local.width, local.height, local.weightKg].map(n => Number(n.toFixed(8)))];
    return { row, text: JSON.stringify(row) };
  }).sort((a, b) => a.text.localeCompare(b.text));
  return JSON.stringify([load.length, load.width, load.height, load.wrappingUsed, load.cornerGuardsUsed, rows.map(entry => entry.row)]);
}
function placementValid(p: Placement) {
  return [p.x, p.y, p.z].every(Number.isFinite)
    && [p.length, p.width, p.height, p.weightKg].every(n => Number.isFinite(n) && n > 0);
}
function approvedPlans(input: StagingInventoryInput, signature: string, valid: CargoItem[], issues: string[]) {
  const quantities = new Map(valid.map(row => [row.id, row.quantity]));
  const totalQuantities = new Map(quantities);
  const specifications = new Map(valid.map(row => [row.id, row]));
  const knownIds = new Set<string>();
  const candidates = [
    ...(input.selectedPlan ? [{ plan: input.selectedPlan, current: true, vehicleId: input.selectedPlan.vehicleId ?? 'current' }] : []),
    ...(input.otherVehicles ?? []).map(plan => ({ plan, current: false, vehicleId: plan.vehicleId })),
  ].sort((a, b) => a.vehicleId.localeCompare(b.vehicleId));
  return candidates.filter(({ plan, vehicleId }) => {
    if (plan.inputSignature !== signature) { issues.push(vehicleId + ': 현재 입력과 다른 과거 적재 결과'); return false; }
    const counts = new Map<string, number>();
    const ids = new Set<string>();
    const resultKeys = new Map<string, number>();
    for (const p of plan.result.placements) {
      const item = specifications.get(p.cargoId);
      const requestedDims = item ? [item.length, item.width, item.height].sort((a, b) => a - b) : [];
      const placedDims = [p.length, p.width, p.height].sort((a, b) => a - b);
      if (!item || !placementValid(p) || Math.abs(item.weightKg - p.weightKg) > 1e-6
        || requestedDims.some((dimension, index) => Math.abs(dimension - placedDims[index]) > 1e-6)) {
        issues.push(vehicleId + ': 현재 화물과 맞지 않는 배치'); return false;
      }
      counts.set(p.cargoId, (counts.get(p.cargoId) ?? 0) + 1);
      const resultKey = placementKey(p);
      resultKeys.set(resultKey, (resultKeys.get(resultKey) ?? 0) + 1);
      if (p.unitId) {
        if (p.unitId.startsWith('staging-box:')) {
          const ordinal = Number(p.unitId.slice(p.unitId.lastIndexOf(':') + 1));
          if (!Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal >= (totalQuantities.get(p.cargoId) ?? 0)
            || p.unitId !== stableBoxId(input.scopeKey, p.cargoId, ordinal)) {
            issues.push(vehicleId + ': 다른 작업의 화물 개체 ID'); return false;
          }
        }
        if (ids.has(p.unitId) || p.unitId.startsWith('staging-box:') && knownIds.has(p.unitId)) { issues.push(vehicleId + ': 중복 화물 개체 ID'); return false; }
        ids.add(p.unitId);
      }
    }
    for (const [id, count] of counts) if (count > (quantities.get(id) ?? 0)) {
      issues.push(vehicleId + ': 유효 요청 수량을 초과한 배치'); return false;
    }
    for (const load of plan.pallets ?? []) {
      if (!load.cargoPlacements.length || ![load.length, load.width, load.height, load.totalWeightKg].every(n => Number.isFinite(n) && n > 0)) {
        issues.push(vehicleId + ': 유효하지 않은 파렛트 포장 구성'); return false;
      }
      for (const p of load.cargoPlacements) {
        const key = placementKey(p); const left = resultKeys.get(key) ?? 0;
        if (!left) { issues.push(vehicleId + ': 파렛트 구성과 적재 결과 불일치'); return false; }
        resultKeys.set(key, left - 1);
      }
    }
    for (const [id, count] of counts) quantities.set(id, (quantities.get(id) ?? 0) - count);
    for (const id of ids) knownIds.add(id);
    return true;
  });
}

export type PrepareStagingPackagingInput = StagingInput & {
  selectedPlan?: StagingSelectedPlan;
  otherVehicles?: Array<StagingSelectedPlan & { vehicleId: string }>;
  /** Real already-built waiting units retained across manual loading/withdrawal. */
  preservedPallets?: PalletLoad[];
};
/** Heavy but pure: call in the staging worker. No browser storage, cache or engine publication. */
export function prepareStagingPackaging(input: PrepareStagingPackagingInput): StagingPackagingPlan {
  const inputSignature = stagingInputSignature(input);
  if (input.mode === 'boxes') return { inputSignature, status: 'ready', pallets: [], remaining: [] };
  const preflight = preflightCargoInput(input.cargo);
  const pending = new Map(preflight.cargo.map(row => [row.id, row.quantity]));
  const plans = approvedPlans(input, inputSignature, preflight.cargo, []);
  for (const { plan } of plans) for (const p of plan.result.placements) pending.set(p.cargoId, (pending.get(p.cargoId) ?? 0) - 1);
  const reservedCounts = Object.fromEntries(preflight.cargo.map(row => [row.id, row.quantity - (pending.get(row.id) ?? 0)]));
  const occupiedIds = new Set(plans.flatMap(({ plan }) => plan.result.placements.flatMap(p => p.unitId ? [p.unitId] : [])));
  const spec = input.palletSpec ?? defaultPalletSpec;
  const sourceRows = new Map(preflight.cargo.map(row => [row.id, row]));
  const preserved: PalletLoad[] = [];
  for (const load of input.preservedPallets ?? []) {
    const ids = load.cargoPlacements.flatMap(p => p.unitId ? [p.unitId] : []);
    const counts = new Map<string, number>();
    load.cargoPlacements.forEach(p => counts.set(p.cargoId, (counts.get(p.cargoId) ?? 0) + 1));
    const physicalMatch = load.cargoPlacements.every(p => {
      const row = sourceRows.get(p.cargoId), dims = row ? [row.length, row.width, row.height].sort((a, b) => a - b) : [];
      return row && placementValid(p) && Math.abs(p.weightKg - row.weightKg) < 1e-6
        && [p.length, p.width, p.height].sort((a, b) => a - b).every((n, index) => Math.abs(n - dims[index]) < 1e-6);
    });
    if (!load.cargoPlacements.length || ids.length !== load.cargoPlacements.length || !physicalMatch
      || Math.abs(load.length - spec.length) > 1e-6 || Math.abs(load.width - spec.width) > 1e-6 || Math.abs(load.height - spec.height) > 1e-6
      || Math.abs(load.cargoWeightKg - load.cargoPlacements.reduce((sum, p) => sum + p.weightKg, 0)) > 1e-6
      || Math.abs(load.totalWeightKg - load.cargoWeightKg - spec.tareWeightKg - load.packagingWeightKg) > 1e-6
      || ids.some(id => occupiedIds.has(id)) || new Set(ids).size !== ids.length
      || [...counts].some(([id, count]) => count > (pending.get(id) ?? 0))) continue;
    for (const [id, count] of counts) pending.set(id, (pending.get(id) ?? 0) - count);
    ids.forEach(id => occupiedIds.add(id)); preserved.push(load);
  }
  const palletCargo = preflight.cargo.filter(row => input.mode !== 'mixed' || row.mixedLoadingMethod !== 'direct')
    .map(row => ({ ...row, quantity: pending.get(row.id) ?? 0 })).filter(row => row.quantity > 0);
  const provenance = { scope: 'yard' as const, reservedCounts };
  if (!palletCargo.length) return { inputSignature, ...provenance, status: 'ready', pallets: preserved, remaining: [] };
  try {
    const strategy = input.strategy ?? 'capacity';
    // Pallet mode first preserves the actual current engine's complete fitting
    // profiles, including its configured stack-target and packaging decisions.
    const ordinary = input.mode === 'pallets' ? packOnPallets(input.container, palletCargo, spec, strategy)
      : buildPalletPackaging(input.container, palletCargo, spec, strategy);
    const left = new Map(ordinary.remaining.map(row => [row.cargoId, row.quantity]));
    const retryCargo = palletCargo.map(row => ({ ...row, quantity: left.get(row.id) ?? 0 })).filter(row => row.quantity > 0);
    if (!retryCargo.length) return { inputSignature, ...provenance, status: 'ready',
      pallets: [...preserved, ...ordinary.pallets].map((load, index) => ({ ...load, palletIndex: index + 1 })), remaining: [] };
    // Capacity/slot limits must not discard full-shipment packaging.
    const full = buildPalletPackaging(input.container, retryCargo, spec, strategy);
    const fullRemaining = new Map(full.remaining.map(row => [row.cargoId, row.quantity]));
    const outsideCargo = retryCargo.map(row => ({ ...row, quantity: fullRemaining.get(row.id) ?? 0 })).filter(row => row.quantity > 0);
    // A vehicle ceiling is a placement constraint, not a universal packaging limit.
    // Only still-unbuilt cargo enters this independent packaging envelope.
    const outside = outsideCargo.length ? buildPalletPackaging(input.container, outsideCargo, spec, strategy, { independentVehicleHeight: true }) : { pallets: [], remaining: [] };
    const pallets = [...preserved, ...ordinary.pallets, ...full.pallets, ...outside.pallets].map((load, index) =>
      load.palletIndex === index + 1 ? load : { ...load, palletIndex: index + 1 });
    return { inputSignature, ...provenance, status: outside.remaining.length ? 'error' : 'ready', pallets,
      remaining: outside.remaining, ...(outside.remaining.length ? { error: '일부 화물의 포장 계획을 만들지 못했습니다.' } : {}) };
  } catch {
    return { inputSignature, ...provenance, status: 'error', pallets: preserved, remaining: palletCargo.map(row => ({
      cargoId: row.id, quantity: row.quantity, reason: '포장 계산을 완료하지 못했습니다.',
    })), error: '포장 계산을 완료하지 못했습니다.' };
  }
}

const emptyCounts = (): StagingCounts => ({ pallets: 0, looseBoxes: 0, boxes: 0, weightKg: 0 });
function countUnits(units: StagingUnit[]) {
  return units.reduce((sum, unit) => ({
    pallets: sum.pallets + (unit.kind === 'pallet' ? 1 : 0),
    looseBoxes: sum.looseBoxes + (unit.kind === 'box' ? 1 : 0),
    boxes: sum.boxes + unit.boxCount, weightKg: sum.weightKg + unit.weightKg,
  }), emptyCounts());
}
function priorities(ids: string[], cargo: Map<string, CargoItem>) {
  return [...new Set(ids.map(id => cargo.get(id)?.unloadPriority).filter((value): value is number => value !== undefined))].sort((a, b) => a - b);
}

/** Derives display inventory without changing inputs, vehicle results or weight calculations. */
export function buildStagingInventory(input: StagingInventoryInput): StagingInventory {
  const inputSignature = stagingInputSignature(input);
  const preflight = preflightCargoInput(input.cargo);
  const cargo = new Map(preflight.cargo.map(row => [row.id, row]));
  const issues: string[] = [];
  const plans = approvedPlans(input, inputSignature, preflight.cargo, issues);
  const identity: StagingIdentityHints = { unitToStableId: { ...(input.identity?.unitToStableId ?? {}) } };
  const available = new Map<string, StagingBoxIdentity>();
  const byCargo = new Map<string, string[]>();
  for (const row of [...preflight.cargo].sort((a, b) => a.id.localeCompare(b.id))) {
    const ids: string[] = [];
    // Same text as stableBoxId(scope, cargo, ordinal); the encoded prefix is built once per row.
    const prefix = stableBoxId(input.scopeKey, row.id, 0).slice(0, -1);
    for (let ordinal = 0; ordinal < row.quantity; ordinal++) {
      const id = prefix + ordinal;
      available.set(id, { id, stableId: id, cargoId: row.id }); ids.push(id);
    }
    byCargo.set(row.id, ids);
  }
  // A pallet's content key is asked for by the sort below on every comparison and again
  // when placed and waiting pallets are matched. No load changes during this call, so
  // each key is built once per load object.
  const loadKeys = new Map<PalletLoad, string>();
  const loadKey = (load: PalletLoad) => {
    let key = loadKeys.get(load);
    if (key === undefined) { key = stagingLoadKey(load); loadKeys.set(load, key); }
    return key;
  };
  const nextByCargo = new Map<string, number>();
  function take(p: Pick<Placement, 'cargoId' | 'unitId'>, vehicleId = 'yard'): StagingBoxIdentity | undefined {
    const alias = p.unitId ? JSON.stringify([vehicleId, p.unitId]) : undefined;
    let stable = alias ? identity.unitToStableId[alias] : undefined;
    if (!stable && p.unitId?.startsWith('staging-box:')) stable = p.unitId;
    if (!stable && p.unitId) {
      try {
        const old = JSON.parse(p.unitId) as unknown;
        if (Array.isArray(old) && old[1] === p.cargoId && Number.isSafeInteger(old[2]) && Number(old[2]) >= 0) {
          stable = stableBoxId(input.scopeKey, p.cargoId, Number(old[2]));
        }
      } catch { /* Legacy engine IDs can be opaque strings. */ }
    }
    let box = stable ? available.get(stable) : undefined;
    if (box?.cargoId !== p.cargoId) box = undefined;
    if (!box) {
      const ids = byCargo.get(p.cargoId) ?? [];
      let index = nextByCargo.get(p.cargoId) ?? 0;
      while (index < ids.length && !available.has(ids[index])) index++;
      nextByCargo.set(p.cargoId, index + 1);
      box = available.get(ids[index]);
    }
    if (!box) return undefined;
    available.delete(box.stableId);
    const id = p.unitId ?? box.stableId;
    identity.unitToStableId[JSON.stringify([vehicleId, id])] = box.stableId;
    return { ...box, id };
  }
  function boxUnit(box: StagingBoxIdentity, location: StagingUnit['location'], extra: Partial<StagingUnit> = {}): StagingUnit {
    const row = cargo.get(box.cargoId)!;
    return { id: box.stableId, kind: 'box', name: row.name || row.id, cargoId: row.id, cargoIds: [row.id],
      length: row.length, width: row.width, height: row.height, weightKg: row.weightKg, boxCount: 1,
      displayColor: row.displayColor, contents: [{ cargoId: row.id, name: row.productName || row.name || row.id, boxCount: 1, displayColor: row.displayColor, labelCode: row.boxId || row.id, unitsPerPackage: row.unitsPerPackage }], unloadPriorities: priorities([row.id], cargo), location,
      verdict: location === 'yard' ? 'pending' : 'placed', reasons: [], boxUnits: [box], ...extra };
  }
  function palletUnit(load: PalletLoad, boxUnits: StagingBoxIdentity[], location: StagingUnit['location'], extra: Partial<StagingUnit> = {}): StagingUnit {
    const cargoIds = [...new Set(boxUnits.map(box => box.cargoId))].sort();
    const memberCounts = new Map<string, number>(); boxUnits.forEach(box => memberCounts.set(box.cargoId, (memberCounts.get(box.cargoId) ?? 0) + 1));
    const height = Math.max(load.height, ...load.cargoPlacements.map(p => p.z - load.z + p.height)) + load.packagingExtraHeightM;
    const id = 'staging-pallet:' + encodeURIComponent(input.scopeKey) + ':' + fingerprint(boxUnits.map(box => box.stableId).sort());
    return { id, kind: 'pallet', name: 'P-' + load.palletIndex, cargoIds,
      contents: cargoIds.map(cargoId => { const row = cargo.get(cargoId)!; return { cargoId, name: row.productName || row.name || cargoId, boxCount: memberCounts.get(cargoId)!, displayColor: row.displayColor, labelCode: row.boxId || row.id, unitsPerPackage: row.unitsPerPackage }; }),
      length: load.length, width: load.width, height, weightKg: load.totalWeightKg,
      boxCount: boxUnits.length, displayColor: cargo.get(cargoIds[0])?.displayColor,
      unloadPriorities: priorities(cargoIds, cargo), location, verdict: location === 'yard' ? 'pending' : 'placed',
      reasons: [], boxUnits, pallet: load, palletSpec: input.palletSpec ?? defaultPalletSpec,
      sourcePalletIndex: load.palletIndex,
      localPlacements: load.cargoPlacements.map((p, index) => ({ ...localPlacement(p, load), unitId: boxUnits[index].id })),
      packaging: { bandingStraps: Number.isInteger(load.bandingPlan?.straps) && load.bandingPlan!.straps >= 0 && load.bandingPlan!.straps <= 4 ? load.bandingPlan!.straps : 0, wrapping: load.wrappingUsed || load.bandingPlan?.wrapping === true, cornerGuards: load.cornerGuardsUsed || load.bandingPlan?.cornerGuards === true, ...(load.bandingPlan && load.bandingPlan.securingLevel > 0 ? { source: 'transport-reinforcement' as const } : {}) }, ...extra };
  }
  const placed: StagingUnit[] = [];
  const reservedCounts = new Map(preflight.cargo.map(row => [row.id, 0]));
  const placedLoadKeys = new Map<string, number>();
  for (const { plan, current, vehicleId } of plans) {
    const location = current ? 'vehicle' : 'other-vehicle';
    const indexes = new Map<string, number[]>();
    plan.result.placements.forEach((p, index) => {
      const key = placementKey(p), known = indexes.get(key);
      if (known) known.push(index); else indexes.set(key, [index]);
    });
    const insidePallet = new Set<number>();
    for (const load of [...(plan.pallets ?? [])].sort((a, b) => loadKey(a).localeCompare(loadKey(b)) || a.palletIndex - b.palletIndex)) {
      const boxes = load.cargoPlacements.map(p => take(p, vehicleId)!);
      const sourcePlacementIndexes = load.cargoPlacements.map(p => indexes.get(placementKey(p))!.shift()!);
      sourcePlacementIndexes.forEach(index => insidePallet.add(index));
      placed.push(palletUnit(load, boxes, location, { vehicleId, sourcePlacementIndexes }));
      placedLoadKeys.set(loadKey(load), (placedLoadKeys.get(loadKey(load)) ?? 0) + 1);
    }
    plan.result.placements.forEach((p, index) => {
      reservedCounts.set(p.cargoId, (reservedCounts.get(p.cargoId) ?? 0) + 1);
      if (insidePallet.has(index)) return;
      const box = take(p, vehicleId);
      if (box) placed.push(boxUnit(box, location, { vehicleId, placement: p, sourcePlacementIndex: index,
        length: p.length, width: p.width, height: p.height, weightKg: p.weightKg }));
    });
  }
  let packagingStatus: StagingInventory['packagingStatus'] = input.mode === 'boxes' ? 'not-required' : 'pending';
  let packaging = input.packaging;
  if (packaging && packaging.inputSignature !== inputSignature) {
    issues.push('현재 입력과 다른 과거 포장 결과'); packaging = undefined;
  }
  if (packaging?.scope === 'yard' && preflight.cargo.some(row =>
    (packaging!.reservedCounts?.[row.id] ?? 0) !== (reservedCounts.get(row.id) ?? 0))) {
    issues.push('차량 배치량과 다른 과거 대기장 포장 결과'); packaging = undefined;
  }
  if (input.mode !== 'boxes' && packaging) packagingStatus = packaging.status;
  const reasonRows = plans.flatMap(({ plan }) => plan.result.remaining).map(row => ({ ...row, left: row.quantity }));
  const packagingErrors = (packaging?.remaining ?? []).map(row => ({ ...row, left: row.quantity }));
  function yardState(boxes: StagingBoxIdentity[], requiresPackaging: boolean): Pick<StagingUnit, 'verdict' | 'reasons'> {
    const reasons: StagingReason[] = [];
    let failed = false; let pending = !plans.length;
    for (const box of boxes) {
      const packError = requiresPackaging && packagingStatus === 'error'
        ? packagingErrors.find(row => row.cargoId === box.cargoId && row.left > 0) : undefined;
      if (packError) { packError.left--; failed = true; reasons.push({ reason: packError.reason }); }
      const row = reasonRows.find(row => row.cargoId === box.cargoId && row.left > 0);
      if (row) {
        row.left--; reasons.push({ reason: row.reason || '사유 정보 없음', ...('reasonCode' in row && row.reasonCode ? { reasonCode: row.reasonCode } : {}) });
        if ('reasonCode' in row && (row.reasonCode === 'STAGING_PENDING' || row.reasonCode === 'STAGING_WITHDRAWN')) pending = true;
      }
    }
    if (failed) return { verdict: 'error', reasons };
    if (input.calculating) return { verdict: 'checking', reasons };
    if (requiresPackaging && packagingStatus === 'pending') return { verdict: 'pending', reasons: [{ reason: '포장 계획 계산 전' }] };
    if (pending) return { verdict: 'pending', reasons };
    return { verdict: 'unloaded', reasons: reasons.length ? reasons : [{ reason: '사유 정보 없음' }] };
  }
  const yard: StagingUnit[] = [];
  const occupiedBoxIds = new Set(placed.flatMap(unit => unit.boxUnits.map(box => box.id)));
  for (const load of input.mode === 'boxes' ? [] : packaging?.pallets ?? []) {
    if (packaging?.scope !== 'yard') {
      const used = placedLoadKeys.get(loadKey(load)) ?? 0;
      if (used > 0) { placedLoadKeys.set(loadKey(load), used - 1); continue; }
    }
    const counts = new Map<string, number>();
    load.cargoPlacements.forEach(p => counts.set(p.cargoId, (counts.get(p.cargoId) ?? 0) + 1));
    const fits = [...counts].every(([id, quantity]) => (byCargo.get(id) ?? []).filter(candidate => available.has(candidate)).length >= quantity);
    const claimedIds = load.cargoPlacements.flatMap(p => p.unitId ? [p.unitId] : []);
    const unavailableStableId = load.cargoPlacements.some(p => {
      const stable = p.unitId && (identity.unitToStableId[JSON.stringify(['yard', p.unitId])]
        ?? (p.unitId.startsWith('staging-box:') ? p.unitId : undefined));
      return stable && !available.has(stable);
    });
    if (!fits || !load.cargoPlacements.length || load.cargoPlacements.some(p => !placementValid(p))
      || new Set(claimedIds).size !== claimedIds.length || claimedIds.some(id => occupiedBoxIds.has(id)) || unavailableStableId) {
      issues.push('포장 구성과 현재 잔량 불일치: P-' + load.palletIndex); continue;
    }
    const boxes = load.cargoPlacements.map(p => take(p)!);
    boxes.forEach(box => occupiedBoxIds.add(box.id));
    yard.push(palletUnit(load, boxes, 'yard', yardState(boxes, false)));
  }
  for (const box of available.values()) {
    const requiresPackaging = input.mode === 'pallets' || input.mode === 'mixed' && cargo.get(box.cargoId)?.mixedLoadingMethod !== 'direct';
    let state = yardState([box], requiresPackaging);
    if (requiresPackaging && packagingStatus === 'ready') {
      state = { verdict: 'error', reasons: [{ reason: '이 화물과 일치하는 파렛트 포장 구성이 없습니다.' }] };
    }
    yard.push(boxUnit(box, 'yard', { ...state, requiresPackaging }));
  }
  const vehicleUnits = placed.filter(unit => unit.location === 'vehicle');
  const otherVehicleUnits = placed.filter(unit => unit.location === 'other-vehicle');
  const units = [...placed, ...yard];
  return { inputSignature, units, yardUnits: yard, vehicleUnits, otherVehicleUnits,
    summary: { total: countUnits(units), vehicle: countUnits(vehicleUnits), otherVehicles: countUnits(otherVehicleUnits),
      yard: countUnits(yard), unloaded: countUnits(yard.filter(unit => unit.verdict === 'unloaded')) },
    excluded: preflight.rejected, issues, packagingStatus,
    referenceResult: Boolean(input.selectedPlan && !plans.some(plan => plan.current)), identity };
}

/** Attach missing legacy identities once before a manual command. Existing engine IDs are preserved. */
export function identifyStagingPlan(plan: StagingSelectedPlan, inventory: StagingInventory): StagingSelectedPlan {
  if (plan.inputSignature !== inventory.inputSignature) return plan;
  const vehicleId = plan.vehicleId ?? 'current';
  const identities = new Map<number, string>();
  const palletIdentities = new Map<number, StagingBoxIdentity[]>();
  for (const unit of inventory.units.filter(candidate => candidate.vehicleId === vehicleId)) {
    if (unit.sourcePlacementIndex !== undefined) identities.set(unit.sourcePlacementIndex, unit.boxUnits[0].id);
    unit.sourcePlacementIndexes?.forEach((index, boxIndex) => identities.set(index, unit.boxUnits[boxIndex].id));
    if (unit.kind === 'pallet' && unit.sourcePalletIndex !== undefined) palletIdentities.set(unit.sourcePalletIndex, unit.boxUnits);
  }
  return { ...plan, result: { ...plan.result, placements: plan.result.placements.map((p, index) =>
    p.unitId || !identities.has(index) ? p : { ...p, unitId: identities.get(index) }) },
    ...(plan.pallets ? { pallets: plan.pallets.map(load => ({ ...load, cargoPlacements: load.cargoPlacements.map((p, index) =>
      p.unitId || !palletIdentities.get(load.palletIndex)?.[index] ? p : { ...p, unitId: palletIdentities.get(load.palletIndex)![index].id }) })) } : {}) };
}
