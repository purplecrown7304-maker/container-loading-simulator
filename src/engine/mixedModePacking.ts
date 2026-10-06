import { isARules } from './loadingRuleset';
import { packWithARules } from './loadSimAdapter';
import { packByBlockSpaceBeamV2 } from './blockSpaceBeamPackerV2';
import { defaultPalletSpec, packOnPallets, type OptimizedPalletPackingResult, type PalletLoad, type PalletSpec } from './palletOptimization';
import type { LoadingStrategy } from './loadingEngine';
import type { CargoItem, ContainerSpec, Placement } from './types';

const EPS = 1e-9;
const PALLET_UNIT_PREFIX = '__MIXED_PALLET_UNIT__';

export type MixedModeOptions = {
  /** Below this 3-D fill ratio, a partial pallet may be converted back to loose boxes. */
  minPalletFillRatio?: number;
  /** Deterministic cap on the number of demotion candidates evaluated. */
  maxDemotionCandidates?: number;
};

export type MixedModeMeta = {
  enabled: true;
  directBoxCount: number;
  directFloorBoxCount: number;
  palletBoxCount: number;
  palletCount: number;
  demotedPalletCount: number;
  candidateCount: number;
  minPalletFillRatio: number;
  totalLoadedWeightKg: number;
  palletFillRates: Array<{ palletIndex: number; fillRate: number; eligibleForDirect: boolean }>;
};

export type MixedModePackingResult = OptimizedPalletPackingResult & {
  mixed: MixedModeMeta;
};

function cargoTop(load: PalletLoad) {
  return Math.max(load.z + load.height, ...load.cargoPlacements.map((p) => p.z + p.height));
}

function palletUnitHeight(load: PalletLoad) {
  return Math.max(load.height, cargoTop(load) - load.z + load.packagingExtraHeightM);
}

function palletFillRate(load: PalletLoad) {
  if (!load.cargoPlacements.length) return 0;
  const cargoHeight = Math.max(EPS, cargoTop(load) - load.z - load.height);
  const envelope = Math.max(EPS, load.length * load.width * cargoHeight);
  const cargoVolume = load.cargoPlacements.reduce((sum, p) => sum + p.length * p.width * p.height, 0);
  return Math.max(0, Math.min(1, cargoVolume / envelope));
}

function totalCargoQuantity(cargo: CargoItem[]) {
  return cargo.reduce((sum, item) => sum + Math.max(0, item.quantity), 0);
}

function builderContainer(container: ContainerSpec, cargo: CargoItem[], pallet: PalletSpec): ContainerSpec {
  const quantity = Math.max(1, totalCargoQuantity(cargo));
  const grossUpperBound = cargo.reduce((sum, item) => sum + item.weightKg * item.quantity, 0)
    + quantity * (pallet.tareWeightKg + pallet.cornerGuardWeightKg + pallet.wrappingWeightKg);
  return {
    unloadingPolicy: container.unloadingPolicy,
    palletDestination: container.palletDestination,
    length: Math.max(pallet.length, pallet.length * quantity),
    width: pallet.width,
    height: container.height,
    maxPayloadKg: Math.max(container.maxPayloadKg, grossUpperBound + 1),
  };
}

function cargoCountsFromLoads(loads: PalletLoad[]) {
  const counts = new Map<string, number>();
  for (const load of loads) {
    for (const placement of load.cargoPlacements) {
      counts.set(placement.cargoId, (counts.get(placement.cargoId) ?? 0) + 1);
    }
  }
  return counts;
}

function mergeCounts(target: Map<string, number>, source: Map<string, number>) {
  for (const [id, quantity] of source) target.set(id, (target.get(id) ?? 0) + quantity);
}

function directCargo(
  original: CargoItem[],
  builderRemaining: Array<{ cargoId: string; quantity: number }>,
  demoted: PalletLoad[],
) {
  const counts = new Map<string, number>();
  for (const row of builderRemaining) counts.set(row.cargoId, (counts.get(row.cargoId) ?? 0) + row.quantity);
  mergeCounts(counts, cargoCountsFromLoads(demoted));
  const byId = new Map(original.map((item) => [item.id, item]));
  return [...counts.entries()].flatMap(([id, quantity]) => {
    const item = byId.get(id);
    return item && quantity > 0 ? [{ ...item, quantity, demandUnits: 1, unitKind: 'box' as const }] : [];
  });
}

function unloadPriorityForPallet(load: PalletLoad, cargoById: Map<string, CargoItem>) {
  const priorities = load.cargoPlacements
    .map((p) => cargoById.get(p.cargoId)?.unloadPriority)
    .filter((value): value is number => Number.isFinite(value));
  if (!priorities.length) return undefined;
  return Math.max(...priorities);
}

function palletUnitItem(load: PalletLoad, cargoById: Map<string, CargoItem>): CargoItem {
  return {
    id: `${PALLET_UNIT_PREFIX}${load.palletIndex}`,
    name: `Pallet unit ${load.palletIndex}`,
    length: load.length,
    width: load.width,
    height: palletUnitHeight(load),
    weightKg: load.totalWeightKg,
    cgOffsetMm: { l: (load.centerOfGravity.x-load.x-load.length/2)*1000, w: (load.centerOfGravity.y-load.y-load.width/2)*1000, h: (load.centerOfGravity.z-load.z-palletUnitHeight(load)/2)*1000 },
    quantity: 1,
    maxStackLayers: 1,
    maxTopLoadKg: 0,
    allowRotation: false,
    unloadPriority: unloadPriorityForPallet(load, cargoById),
    demandUnits: Math.max(1, load.cargoPlacements.length),
    floorOnly: true,
    unitKind: 'pallet',
    sourcePalletIndex: load.palletIndex,
  };
}

function moveLoad(load: PalletLoad, unit: Placement, newIndex: number): PalletLoad {
  const dx = unit.x - load.x;
  const dy = unit.y - load.y;
  const dz = unit.z - load.z;
  return {
    ...load,
    palletIndex: newIndex,
    x: unit.x,
    y: unit.y,
    z: unit.z,
    stackLevel: 1,
    stackColumn: newIndex,
    cargoPlacements: load.cargoPlacements.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy, z: p.z + dz })),
    centerOfGravity: {
      x: load.centerOfGravity.x + dx,
      y: load.centerOfGravity.y + dy,
      z: load.centerOfGravity.z + dz,
    },
  };
}

function deterministicDropCounts(eligible: number, cap: number) {
  if (eligible <= 0) return [0];
  if (eligible + 1 <= cap) return Array.from({ length: eligible + 1 }, (_, index) => index);
  const values = new Set<number>([0, 1, 2, 3, Math.ceil(eligible / 2), Math.max(0, eligible - 1), eligible]);
  return [...values].filter((value) => value >= 0 && value <= eligible).sort((a, b) => a - b).slice(0, cap);
}

function waitingRows(
  packedRemaining: Array<{ cargoId: string; quantity: number; reason: string }>,
  palletByUnitId: Map<string, PalletLoad>,
) {
  const rows = new Map<string, { quantity: number; reason: string }>();
  for (const row of packedRemaining) {
    if (row.cargoId.startsWith(PALLET_UNIT_PREFIX)) {
      const load = palletByUnitId.get(row.cargoId);
      if (!load) continue;
      for (const [cargoId, quantity] of cargoCountsFromLoads([load])) {
        const previous = rows.get(cargoId);
        rows.set(cargoId, {
          quantity: (previous?.quantity ?? 0) + quantity,
          reason: '파렛트 단위가 컨테이너의 안전한 EMS에 배치되지 못함',
        });
      }
      continue;
    }
    const previous = rows.get(row.cargoId);
    rows.set(row.cargoId, {
      quantity: (previous?.quantity ?? 0) + row.quantity,
      reason: row.reason,
    });
  }
  return [...rows.entries()].map(([cargoId, value]) => ({ cargoId, ...value }));
}

type Candidate = {
  hardErrors: number;
  result: MixedModePackingResult;
  loadedCount: number;
  palletCount: number;
  floorLoose: number;
  usedVolumeM3: number;
};

function better(a: Candidate, b: Candidate | null) {
  if (!b) return true;
  if (a.hardErrors !== b.hardErrors) return a.hardErrors < b.hardErrors;
  if (a.loadedCount !== b.loadedCount) return a.loadedCount > b.loadedCount;
  if (a.palletCount !== b.palletCount) return a.palletCount < b.palletCount;
  if (a.floorLoose !== b.floorLoose) return a.floorLoose < b.floorLoose;
  if (Math.abs(a.usedVolumeM3 - b.usedVolumeM3) > EPS) return a.usedVolumeM3 > b.usedVolumeM3;
  return false;
}

/**
 * MIXED mode:
 * 1) build pallet units independently;
 * 2) only partial pallets below the configurable fill threshold are eligible to become loose boxes;
 * 3) pallet units and direct boxes then enter the SAME deterministic EMS/Beam Search.
 *
 * This intentionally does not demote well-filled pallets. Otherwise a naive "minimize pallet count"
 * objective degenerates into BOX_ONLY whenever every carton can be floor-loaded.
 */
export function packMixedMode(
  container: ContainerSpec,
  cargo: CargoItem[],
  pallet: PalletSpec = defaultPalletSpec,
  strategy: LoadingStrategy = 'capacity',
  options: MixedModeOptions = {},
): MixedModePackingResult {
  if (container.limitReview !== undefined) return {...packOnPallets(container,cargo,pallet,strategy),mixed:{enabled:true,directBoxCount:0,directFloorBoxCount:0,palletBoxCount:0,palletCount:0,demotedPalletCount:0,candidateCount:0,minPalletFillRatio:options.minPalletFillRatio??0.7,totalLoadedWeightKg:0,palletFillRates:[]}};
  const active = cargo.filter((item) => item.quantity > 0);
  const threshold = Math.max(0, Math.min(1, options.minPalletFillRatio ?? 0.7));
  const candidateCap = Math.max(2, Math.floor(options.maxDemotionCandidates ?? 10));
  const buildSpec = { ...pallet, maxStackLevels: 1 };
  const palletCargo = active.filter(item => item.mixedLoadingMethod !== 'direct');
  const explicitDirect = active.filter(item => item.mixedLoadingMethod === 'direct');
  const built = packOnPallets(builderContainer(container, palletCargo, buildSpec), palletCargo, buildSpec, strategy);
  const cargoById = new Map(active.map((item) => [item.id, item]));
  const fillRows = built.pallets.map((load) => ({
    load,
    fillRate: palletFillRate(load),
  }));
  const eligible = fillRows
    .filter((row) => row.fillRate + EPS < threshold && row.load.cargoPlacements.every(p => cargoById.get(p.cargoId)?.mixedLoadingMethod !== 'pallet'))
    .sort((a, b) => a.fillRate - b.fillRate || b.load.palletIndex - a.load.palletIndex);

  let best: Candidate | null = null;
  let evaluated = 0;

  for (const dropCount of deterministicDropCounts(eligible.length, candidateCap)) {
    const demotedSet = new Set(eligible.slice(0, dropCount).map((row) => row.load.palletIndex));
    const kept = built.pallets.filter((load) => !demotedSet.has(load.palletIndex));
    const demoted = built.pallets.filter((load) => demotedSet.has(load.palletIndex));
    const unitItems = kept.map((load) => palletUnitItem(load, cargoById));
    const unitMap = new Map(unitItems.map((item, index) => [item.id, kept[index]]));
    const protectedRemaining = built.remaining.filter(row => cargoById.get(row.cargoId)?.mixedLoadingMethod === 'pallet');
    const looseCargo = directCargo(active, [
      ...built.remaining.filter(row => cargoById.get(row.cargoId)?.mixedLoadingMethod !== 'pallet'),
      ...explicitDirect.map(item => ({ cargoId: item.id, quantity: item.quantity })),
    ], demoted);
    const combined = [...unitItems, ...looseCargo];

    const packed = isARules(container) ? packWithARules(container, combined, strategy) : packByBlockSpaceBeamV2(container, combined, strategy);
    const unitPlacement = new Map(
      packed.placements
        .filter((p) => p.cargoId.startsWith(PALLET_UNIT_PREFIX))
        .map((p) => [p.cargoId, p] as const),
    );
    const movedPallets = unitItems.flatMap((item) => {
      const placement = unitPlacement.get(item.id);
      const source = unitMap.get(item.id);
      return placement && source ? [moveLoad(source, placement, 0)] : [];
    });
    movedPallets.sort((a, b) => a.x - b.x || a.y - b.y || a.palletIndex - b.palletIndex);
    movedPallets.forEach((load, index) => {
      load.palletIndex = index + 1;
      load.stackColumn = index + 1;
    });

    const directPlacements = packed.placements.filter((p) => !p.cargoId.startsWith(PALLET_UNIT_PREFIX));
    const palletPlacements = movedPallets.flatMap((load) => load.cargoPlacements);
    const placements = [...palletPlacements, ...directPlacements];
    const loadedCargoWeightKg = placements.reduce((sum, p) => sum + p.weightKg, 0);
    const palletGross = movedPallets.reduce((sum, load) => sum + load.totalWeightKg, 0);
    const directWeight = directPlacements.reduce((sum, p) => sum + p.weightKg, 0);
    const totalWeight = palletGross + directWeight;
    const remaining = waitingRows([...packed.remaining, ...protectedRemaining], unitMap);
    const floorLoose = directPlacements.filter((p) => p.z <= 0.0015).length;
    const optimization = {
      strategy,
      selectedStackTarget: 1,
      candidateCount: deterministicDropCounts(eligible.length, candidateCap).length,
      floorPositions: movedPallets.length,
      redistributedForLowUtilization: dropCount > 0,
      consolidationPasses: dropCount,
    };

    const result: MixedModePackingResult = {
      pallets: movedPallets,
      placements,
      remaining,
      palletCount: movedPallets.length,
      loadedCargoWeightKg,
      totalPackagingWeightKg: movedPallets.reduce((sum, load) => sum + load.packagingWeightKg, 0),
      avoidedPackagingWeightKg: demoted.reduce((sum, load) => sum + load.packagingWeightKg + pallet.tareWeightKg, 0),
      packagedPalletCount: movedPallets.filter((load) => load.cornerGuardsUsed || load.wrappingUsed).length,
      totalPalletizedWeightKg: palletGross,
      consolidatedPallets: built.consolidatedPallets + demoted.length,
      lateralImbalanceKg: 0,
      stackedPallets: 0,
      maxUsedStackLevel: movedPallets.length ? 1 : 0,
      optimization,
      mixed: {
        enabled: true,
        directBoxCount: directPlacements.length,
        directFloorBoxCount: floorLoose,
        palletBoxCount: palletPlacements.length,
        palletCount: movedPallets.length,
        demotedPalletCount: demoted.length,
        candidateCount: optimization.candidateCount,
        minPalletFillRatio: threshold,
        totalLoadedWeightKg: totalWeight,
        palletFillRates: fillRows.map((row) => ({
          palletIndex: row.load.palletIndex,
          fillRate: row.fillRate,
          eligibleForDirect: eligible.includes(row),
        })),
      },
    };

    const candidate: Candidate = {
      hardErrors: isARules(container) && 'operationalFindings' in packed ? ((packed.operationalFindings as import('./types').OperationalRuleFinding[] | undefined)??[]).filter(f=>f.severity==='error').length : 0,
      result,
      loadedCount: placements.length,
      palletCount: movedPallets.length,
      floorLoose,
      usedVolumeM3: packed.usedVolumeM3,
    };
    evaluated += 1;
    if (better(candidate, best)) best = candidate;
  }

  if (best) {
    best.result.optimization.candidateCount = evaluated;
    best.result.mixed.candidateCount = evaluated;
    return best.result;
  }

  return {
    ...built,
    optimization: {
      strategy,
      selectedStackTarget: 1,
      candidateCount: 0,
      floorPositions: built.palletCount,
      redistributedForLowUtilization: false,
      consolidationPasses: 0,
    },
    mixed: {
      enabled: true,
      directBoxCount: 0,
      directFloorBoxCount: 0,
      palletBoxCount: built.placements.length,
      palletCount: built.palletCount,
      demotedPalletCount: 0,
      candidateCount: 0,
      minPalletFillRatio: threshold,
      totalLoadedWeightKg: built.totalPalletizedWeightKg,
      palletFillRates: fillRows.map((row) => ({
        palletIndex: row.load.palletIndex,
        fillRate: row.fillRate,
        eligibleForDirect: eligible.includes(row),
      })),
    },
  };
}
