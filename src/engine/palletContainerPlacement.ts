import { allowedOrientations, itemCg } from '../load-sim';
import { bPlacementToLoadSim, expandCargoToLoadSim } from '../rule-engine/loadSimAdapter';
import { createPalletRuleEngineProvenance, matchesPalletSnapshotProvenance, matchesPalletPreparationSpec } from '../rule-engine/palletProvenance';
import { loadContainerWithLoadSim } from '../rule-engine/loadSimEngine';
import { preflightCargoInput } from './inputPreflight';
import type { CargoItem, ContainerSpec, LoadingResult, Placement } from './types';
import type { PalletLoad, PalletPackingResult, PalletSpec } from './palletPacking';

const EPS = 1e-6;
const PALLET_UNIT_PREFIX = '__LOAD_SIM_PALLET_UNIT__';

/** Independent preparation space, not a container layout or an alternative loading engine. */
export function palletPreparationContainer(container: ContainerSpec, cargo: CargoItem[], pallet: PalletSpec): ContainerSpec {
  const quantity = Math.max(1, cargo.reduce((sum, item) => sum + Math.max(0, item.quantity), 0));
  const gross = cargo.reduce((sum, item) => sum + item.weightKg * item.quantity, 0)
    + quantity * (pallet.tareWeightKg + pallet.cornerGuardWeightKg + pallet.wrappingWeightKg);
  return {
    length: Math.max(pallet.length, pallet.length * quantity),
    width: pallet.width,
    height: container.height,
    maxPayloadKg: Math.max(1, gross + 1),
  };
}

/** A rigid unit can carry only one stop and one handling class/temperature zone. */
export function palletPreparationGroups(cargo: CargoItem[]): CargoItem[][] {
  const groups = new Map<string, CargoItem[]>();
  for (const item of cargo) {
    const key = JSON.stringify([item.unloadPriority ?? null, item.segregationClass ?? null, item.tempZone ?? null]);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([, rows]) => rows);
}

export function combinePreparedPallets(results: PalletPackingResult[]): PalletPackingResult {
  const pallets = results.flatMap(result => result.pallets).map((load, index) => ({ ...load, palletIndex: index + 1, stackColumn: index + 1 }));
  const placements = pallets.flatMap(load => load.cargoPlacements);
  const sum = (key: 'loadedCargoWeightKg' | 'totalPackagingWeightKg' | 'avoidedPackagingWeightKg' | 'packagedPalletCount' | 'totalPalletizedWeightKg' | 'consolidatedPallets') => results.reduce((n, result) => n + result[key], 0);
  return {
    pallets, placements, remaining: results.flatMap(result => result.remaining), palletCount: pallets.length,
    loadedCargoWeightKg: sum('loadedCargoWeightKg'), totalPackagingWeightKg: sum('totalPackagingWeightKg'),
    avoidedPackagingWeightKg: sum('avoidedPackagingWeightKg'), packagedPalletCount: sum('packagedPalletCount'),
    totalPalletizedWeightKg: sum('totalPalletizedWeightKg'), consolidatedPallets: sum('consolidatedPallets'),
    lateralImbalanceKg: 0, stackedPallets: 0, maxUsedStackLevel: pallets.length ? 1 : 0,
  };
}

export function palletUnitHeight(load: PalletLoad) {
  return Math.max(load.height, ...load.cargoPlacements.map(p => p.z + p.height - load.z)) + load.packagingExtraHeightM;
}

export function palletFillRate(load: PalletLoad) {
  const cargoHeight = Math.max(EPS, palletUnitHeight(load) - load.height - load.packagingExtraHeightM);
  const volume = load.cargoPlacements.reduce((sum, p) => sum + p.length * p.width * p.height, 0);
  return Math.max(0, Math.min(1, volume / (load.length * load.width * cargoHeight)));
}

/** Gross rigid CG uses A's orientation-aware source offsets, not the deck builder's geometric centers. */
function palletGrossMass(load: PalletLoad, pallet: PalletSpec, cargoById: Map<string, CargoItem>) {
  const parts = load.cargoPlacements.map((placement, index) => {
    const source = cargoById.get(placement.cargoId);
    if (!source) throw new Error(`Prepared pallet references missing cargo: ${placement.cargoId}`);
    const cg = itemCg(bPlacementToLoadSim(placement, source, `${source.id}#${index + 1}`));
    return { weight: source.weightKg, x: cg.x / 1000, y: cg.y / 1000, z: cg.z / 1000 };
  });
  const cargoWeightKg = parts.reduce((sum, part) => sum + part.weight, 0);
  const cargoTop = Math.max(load.z + load.height, ...load.cargoPlacements.map(p => p.z + p.height));
  parts.push(
    { weight: pallet.tareWeightKg, x: load.x + load.length / 2, y: load.y + load.width / 2, z: load.z + load.height / 2 },
    // Preserve the preparation model's packaging centroid at the top envelope.
    { weight: load.packagingWeightKg, x: load.x + load.length / 2, y: load.y + load.width / 2, z: cargoTop + load.packagingExtraHeightM / 2 },
  );
  const totalWeightKg = parts.reduce((sum, part) => sum + part.weight, 0);
  return {
    cargoWeightKg, totalWeightKg,
    centerOfGravity: {
      x: parts.reduce((sum, part) => sum + part.weight * part.x, 0) / totalWeightKg,
      y: parts.reduce((sum, part) => sum + part.weight * part.y, 0) / totalWeightKg,
      z: parts.reduce((sum, part) => sum + part.weight * part.z, 0) / totalWeightKg,
    },
  };
}

function rigidCargo(load: PalletLoad, pallet: PalletSpec, cargoById: Map<string, CargoItem>, index: number): CargoItem {
  const height = palletUnitHeight(load);
  const gross = palletGrossMass(load, pallet, cargoById);
  const unitOrientations = (['LWH', 'WLH'] as const).filter(orientation => load.cargoPlacements.every(child => {
    const original = cargoById.get(child.cargoId);
    if (!original) return false;
    const { items } = expandCargoToLoadSim([{ ...original, quantity: 1 }]);
    const current = child.loadSimOrientation ?? (child.rotated ? 'WLH' : 'LWH');
    const moved = orientation === 'WLH' ? `${current[1]}${current[0]}${current[2]}` : current;
    return allowedOrientations(items[0]).includes(moved as NonNullable<Placement['loadSimOrientation']>);
  }));
  const first = cargoById.get(load.cargoPlacements[0]?.cargoId);
  let id = `${PALLET_UNIT_PREFIX}${index + 1}`;
  while (cargoById.has(id)) id = `_${id}`;
  const stops = load.cargoPlacements.map(p => cargoById.get(p.cargoId)?.unloadPriority).filter((n): n is number => n != null);
  return {
    id,
    name: `Pallet unit ${index + 1}`,
    length: load.length, width: load.width, height,
    weightKg: gross.totalWeightKg,
    quantity: 1,
    loadSimType: 'pallet', unitKind: 'pallet', sourcePalletIndex: load.palletIndex,
    allowedOrientations: unitOrientations.length === 2 ? undefined : unitOrientations,
    // These are declared pallet handling inputs; A supplies every other default.
    maxStackLayers: pallet.maxStackLevels,
    maxTopLoadKg: pallet.maxSupportedTopWeightKg,
    unloadPriority: stops.length ? Math.max(...stops) : undefined,
    segregationClass: first?.segregationClass,
    tempZone: first?.tempZone,
    groupId: first?.groupId,
    cgOffsetM: {
      l: gross.centerOfGravity.x - load.x - load.length / 2,
      w: gross.centerOfGravity.y - load.y - load.width / 2,
      h: gross.centerOfGravity.z - load.z - height / 2,
    },
  };
}

/** A's upright WLH permutation is applied to the entire rigid unit, including every child. */
export function movePreparedPallet(load: PalletLoad, unit: Placement, palletIndex: number): PalletLoad {
  const swapped = unit.loadSimOrientation === 'WLH';
  const child = (p: Placement): Placement => {
    const x = p.x - load.x, y = p.y - load.y;
    const orientation = p.loadSimOrientation ?? (p.rotated ? 'WLH' : 'LWH');
    return {
      ...p,
      x: unit.x + (swapped ? y : x),
      y: unit.y + (swapped ? x : y),
      z: unit.z + p.z - load.z,
      length: swapped ? p.width : p.length,
      width: swapped ? p.length : p.width,
      rotated: swapped ? !p.rotated : p.rotated,
      loadSimOrientation: swapped ? `${orientation[1]}${orientation[0]}${orientation[2]}` as Placement['loadSimOrientation'] : orientation,
    };
  };
  const cogX = load.centerOfGravity.x - load.x, cogY = load.centerOfGravity.y - load.y;
  return {
    ...load,
    palletIndex,
    x: unit.x, y: unit.y, z: unit.z,
    length: unit.length, width: unit.width,
    stackLevel: 1, stackColumn: palletIndex,
    cargoPlacements: load.cargoPlacements.map(child),
    centerOfGravity: {
      x: unit.x + (swapped ? cogY : cogX),
      y: unit.y + (swapped ? cogX : cogY),
      z: unit.z + load.centerOfGravity.z - load.z,
    },
  };
}

/** Display metadata only: A has already decided and validated these positions. */
function describeStacks(pallets: PalletLoad[]) {
  for (const load of [...pallets].sort((a, b) => a.z - b.z || a.palletIndex - b.palletIndex)) {
    const below = pallets.filter(other => other !== load
      && Math.abs(other.z + palletUnitHeight(other) - load.z) < .001
      && Math.min(other.x + other.length, load.x + load.length) > Math.max(other.x, load.x) + EPS
      && Math.min(other.y + other.width, load.y + load.width) > Math.max(other.y, load.y) + EPS)
      .sort((a, b) => b.stackLevel - a.stackLevel || a.palletIndex - b.palletIndex)[0];
    if (below) { load.stackLevel = below.stackLevel + 1; load.stackColumn = below.stackColumn; }
  }
}

/** The only container-placement pass for both PALLET_ONLY and MIXED. */
export function placePreparedPallets(
  container: ContainerSpec,
  originalCargo: CargoItem[],
  pallet: PalletSpec,
  prepared: PalletPackingResult,
  looseCargo: CargoItem[] = [],
  preparationRemaining = prepared.remaining,
): PalletPackingResult {
  const cargoById = new Map(preflightCargoInput(originalCargo).cargo.map(item => [item.id, item]));
  const units = prepared.pallets.map((load, index) => rigidCargo(load, pallet, cargoById, index));
  const byUnit = new Map(units.map((unit, index) => [unit.id, prepared.pallets[index]]));
  const unitById = new Map(units.map(unit => [unit.id, unit]));
  // Children are visualization data, never additional container-level weight or occupied units.
  const cargo = [...units, ...looseCargo];
  const packed = loadContainerWithLoadSim(container, cargo);
  const pallets: PalletLoad[] = [];
  const placements: Placement[] = [];
  const displayIndexes = new Map<number, number[]>();
  const palletUnits: NonNullable<LoadingResult['ruleEngineInput']>['palletUnits'] = [];
  for (const [index, unit] of packed.placements.entries()) {
    const source = byUnit.get(unit.cargoId);
    if (source) {
      const moved = movePreparedPallet(source, unit, pallets.length + 1);
      const canonicalCg = itemCg(bPlacementToLoadSim(unit, unitById.get(unit.cargoId)!));
      moved.centerOfGravity = { x: canonicalCg.x / 1000, y: canonicalCg.y / 1000, z: canonicalCg.z / 1000 };
      moved.totalWeightKg = unit.weightKg;
      moved.cargoWeightKg = moved.cargoPlacements.reduce((sum, child) => sum + cargoById.get(child.cargoId)!.weightKg, 0);
      const indexes = moved.cargoPlacements.map((_, i) => placements.length + i);
      palletUnits.push({ cargoId: unit.cargoId, sourcePalletIndex: source.palletIndex, displayPalletIndex: moved.palletIndex, displayPlacementIndexes: indexes });
      displayIndexes.set(index, indexes);
      pallets.push(moved);
      placements.push(...moved.cargoPlacements);
    } else {
      displayIndexes.set(index, [placements.length]);
      placements.push(unit);
    }
  }
  describeStacks(pallets);
  const remaining = new Map<string, { quantity: number; reason: string }>();
  const addRemaining = (cargoId: string, quantity: number, reason: string) => {
    const prior = remaining.get(cargoId);
    remaining.set(cargoId, { quantity: (prior?.quantity ?? 0) + quantity, reason });
  };
  for (const row of preparationRemaining) addRemaining(row.cargoId, row.quantity, row.reason);
  for (const row of packed.remaining) {
    const source = byUnit.get(row.cargoId);
    if (source) source.cargoPlacements.forEach(p => addRemaining(p.cargoId, 1, row.reason));
    else addRemaining(row.cargoId, row.quantity, row.reason);
  }
  const palletGross = pallets.reduce((sum, load) => sum + load.totalWeightKg, 0);
  const indexMap = (indexes: number[]) => [...new Set(indexes.flatMap(index => displayIndexes.get(index) ?? []))];
  const canonical = { cargo, placements: packed.placements, palletUnits };
  const provenance = createPalletRuleEngineProvenance(originalCargo, placements, canonical, pallets, pallet);
  return {
    ...prepared,
    pallets, placements,
    remaining: [...remaining].filter(([, row]) => row.quantity > 0).map(([cargoId, row]) => ({ cargoId, ...row })),
    palletCount: pallets.length,
    loadedCargoWeightKg: placements.reduce((sum, p) => sum + p.weightKg, 0),
    totalPackagingWeightKg: pallets.reduce((sum, p) => sum + p.packagingWeightKg, 0),
    avoidedPackagingWeightKg: pallet.minimizePackaging ? pallets.reduce((sum, p) => sum + (p.cornerGuardsUsed ? 0 : pallet.cornerGuardWeightKg) + (p.wrappingUsed ? 0 : pallet.wrappingWeightKg), 0) : 0,
    packagedPalletCount: pallets.filter(p => p.cornerGuardsUsed || p.wrappingUsed).length,
    totalPalletizedWeightKg: palletGross,
    lateralImbalanceKg: Math.abs(pallets.reduce((sum, p) => sum + (p.centerOfGravity.y < container.width / 2 - EPS ? -p.totalWeightKg : p.centerOfGravity.y > container.width / 2 + EPS ? p.totalWeightKg : 0), 0)),
    stackedPallets: pallets.filter(p => p.stackLevel > 1).length,
    maxUsedStackLevel: Math.max(0, ...pallets.map(p => p.stackLevel)),
    ruleEngine: packed.ruleEngine,
    ruleEngineStrategy: packed.ruleEngineStrategy,
    loadSimShift: packed.loadSimShift,
    ruleEngineInput: { ...canonical, provenance },
    validationIssues: packed.validationIssues.map(issue => ({ ...issue, placementIndexes: indexMap(issue.placementIndexes) })),
    operationalFindings: packed.operationalFindings?.map(finding => ({ ...finding, placementIndexes: indexMap(finding.placementIndexes) })),
  };
}

/** Preserve the canonical A input through snapshots, physics displays, and export targets. */
export function palletResultToLoadingResult(result: PalletPackingResult, preparationSpec?: PalletSpec): LoadingResult {
  const isA = result.ruleEngine === 'load-sim';
  const snapshotChanged = isA && (!result.ruleEngineInput || !matchesPalletSnapshotProvenance(result.ruleEngineInput, result.pallets));
  const specChanged = isA && preparationSpec !== undefined && (!result.ruleEngineInput || !matchesPalletPreparationSpec(result.ruleEngineInput, preparationSpec));
  // Report summary values must be derived from the generation-bound physical data.
  // Do not bind optimization candidates or obsolete strategy metadata here.
  const expectedMetrics = {
    palletCount: result.pallets.length,
    totalPalletizedWeightKg: result.pallets.reduce((sum, load) => sum + load.totalWeightKg, 0),
    loadedCargoWeightKg: result.placements.reduce((sum, child) => sum + child.weightKg, 0),
    totalPackagingWeightKg: result.pallets.reduce((sum, load) => sum + load.packagingWeightKg, 0),
    packagedPalletCount: result.pallets.filter(load => load.cornerGuardsUsed || load.wrappingUsed).length,
  };
  const metricsChanged = isA && (Object.keys(expectedMetrics) as Array<keyof typeof expectedMetrics>)
    .some(key => !Number.isFinite(result[key]) || Math.abs(result[key] - expectedMetrics[key]) > EPS);
  const validationIssues: LoadingResult['validationIssues'] = [...(result.validationIssues ?? [])];
  if (snapshotChanged || specChanged || metricsChanged) validationIssues.push({
    type: 'INVALID_CARGO',
    message: '팔레트 배치·집계·자재 규격이 생성 당시 A 검증 기록과 일치하지 않습니다. 다시 적재해야 합니다.',
    placementIndexes: [],
  });
  return {
    placements: result.placements,
    remaining: result.remaining,
    loadedWeightKg: result.ruleEngineInput?.placements.reduce((sum, p) => sum + p.weightKg, 0) ?? result.totalPalletizedWeightKg,
    usedVolumeM3: (result.ruleEngineInput?.placements ?? result.placements).reduce((sum, p) => sum + p.length * p.width * p.height, 0),
    validationIssues,
    operationalFindings: result.operationalFindings,
    ruleEngine: result.ruleEngine,
    ruleEngineStrategy: result.ruleEngineStrategy,
    ruleEngineInput: result.ruleEngineInput,
    loadSimShift: result.loadSimShift,
  };
}
