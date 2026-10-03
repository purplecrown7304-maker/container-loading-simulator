import { findMatchingEquipment } from '../transportEquipment';
import type { CargoItem, ContainerSpec, LoadingResult, OperationalRuleFinding, Placement, ValidationIssue } from '../engine/types';
import { orientedSize, type Config as LoadSimConfig, type Item, type ItemType, type Orientation, type Placement as LoadSimPlacement, type Space, type ValidationResult } from '../load-sim';

const MM_PER_M = 1000;
const M3_PER_MM3 = 1_000_000_000;

export type ExpandedItem = { item: Item; cargoId: string };
export type LoadSimAdapterContext = {
  byExpandedId: Map<string, string>;
  byCargoId: Map<string, CargoItem>;
};

function pad(index: number) { return String(index).padStart(6, '0'); }

function itemType(cargo: CargoItem): ItemType {
  return cargo.loadSimType ?? (cargo.unitKind === 'pallet' ? 'pallet' : 'carton');
}

function legacyOrientationPolicy(cargo: CargoItem): Orientation[] | undefined {
  if (cargo.allowRotation === false) return ['LWH'];
  if (cargo.loadSimType == null && cargo.thisSideUp !== true) return ['LWH', 'WLH'];
  return undefined;
}

export function expandCargoToLoadSim(cargo: CargoItem[]): { items: Item[]; context: LoadSimAdapterContext } {
  const byExpandedId = new Map<string, string>();
  const byCargoId = new Map(cargo.map(row => [row.id, row]));
  const items: Item[] = [];
  for (const row of cargo) {
    for (let index = 0; index < Math.max(0, Math.floor(row.quantity)); index += 1) {
      const id = `${row.id}#${pad(index + 1)}`;
      byExpandedId.set(id, row.id);
      items.push({
        id,
        type: itemType(row),
        dims: { l: row.length * MM_PER_M, w: row.width * MM_PER_M, h: row.height * MM_PER_M },
        weight: row.weightKg,
        allowedOrientations: legacyOrientationPolicy(row),
        thisSideUp: row.thisSideUp,
        maxTopLoad: row.maxTopLoadKg,
        maxTopPressure: row.maxTopPressureKgPerM2,
        maxTier: row.maxStackLayers,
        canBePlacedOnTop: row.floorOnly === true ? false : row.canBePlacedOnTop,
        stopSeq: row.unloadPriority,
        groupId: row.groupId,
        segregationClass: row.segregationClass,
        tempZone: row.tempZone,
        cgOffset: row.cgOffsetM ? {
          l: row.cgOffsetM.l * MM_PER_M,
          w: row.cgOffsetM.w * MM_PER_M,
          h: row.cgOffsetM.h * MM_PER_M,
        } : undefined,
        friction: row.friction,
        forklift: row.forklift,
      });
    }
  }
  return { items, context: { byExpandedId, byCargoId } };
}

export function containerToLoadSimSpace(container: ContainerSpec): Space {
  const equipment = findMatchingEquipment(container.length, container.width, container.height, container.maxPayloadKg);
  const access: Space['access'] = equipment
    ? ['rear', ...(equipment.sideLoading ? ['left', 'right'] as const : []), ...(equipment.topLoading ? ['top'] as const : [])]
    : ['rear'];
  return {
    id: equipment?.id ?? 'custom',
    kind: equipment?.category ?? 'container',
    inner: { l: container.length * MM_PER_M, w: container.width * MM_PER_M, h: container.height * MM_PER_M },
    door: equipment?.doorWidth && equipment?.doorHeight
      ? { w: equipment.doorWidth * MM_PER_M, h: equipment.doorHeight * MM_PER_M }
      : undefined,
    access,
    maxPayload: container.maxPayloadKg,
    tare: 0,
    // floorLoadLimitKgPerM2 is intentionally NOT mapped: A expects kg/m line load.
  };
}

export function bPlacementToLoadSim(
  placement: Placement,
  cargo: CargoItem,
  expandedId = placement.cargoId,
): LoadSimPlacement {
  const base = { l: cargo.length * MM_PER_M, w: cargo.width * MM_PER_M, h: cargo.height * MM_PER_M };
  const actual = { x: placement.length * MM_PER_M, y: placement.width * MM_PER_M, z: placement.height * MM_PER_M };
  const orientations: Orientation[] = ['LWH','WLH','LHW','HLW','WHL','HWL'];
  const orientation = placement.loadSimOrientation ?? orientations.find(o => {
    const item: Item = { id: expandedId, type: itemType(cargo), dims: base, weight: cargo.weightKg };
    const s = orientedSize(item.dims, o);
    return Math.abs(s.x - actual.x) <= 0.5 && Math.abs(s.y - actual.y) <= 0.5 && Math.abs(s.z - actual.z) <= 0.5;
  }) ?? (placement.rotated ? 'WLH' : 'LWH');
  const item: Item = {
    id: expandedId,
    type: itemType(cargo),
    dims: base,
    weight: cargo.weightKg,
    allowedOrientations: legacyOrientationPolicy(cargo),
    thisSideUp: cargo.thisSideUp,
    maxTopLoad: cargo.maxTopLoadKg,
    maxTopPressure: cargo.maxTopPressureKgPerM2,
    maxTier: cargo.maxStackLayers,
    canBePlacedOnTop: cargo.floorOnly === true ? false : cargo.canBePlacedOnTop,
    stopSeq: cargo.unloadPriority,
    groupId: cargo.groupId,
    segregationClass: cargo.segregationClass,
    tempZone: cargo.tempZone,
    friction: cargo.friction,
    forklift: cargo.forklift,
  };
  return { item, pos: { x: placement.x * MM_PER_M, y: placement.y * MM_PER_M, z: placement.z * MM_PER_M }, orientation };
}

function validationType(code: string): ValidationIssue['type'] {
  if (code === 'OUT_OF_BOUNDS' || code === 'HEIGHT_EXCEEDED' || code === 'LOAD_LINE_EXCEEDED' || code === 'DOOR_NOT_PASSABLE') return 'OUT_OF_BOUNDS';
  if (code === 'OVERLAP') return 'COLLISION';
  if (code === 'FLOATING' || code === 'INSUFFICIENT_SUPPORT' || code === 'CG_OUTSIDE_SUPPORT' || code.startsWith('AFTER_STOP_')) return 'UNSUPPORTED';
  if (code === 'TIER_EXCEEDED' || code === 'MUST_BE_ON_FLOOR' || code === 'UNLOAD_BLOCKED' || code === 'UNLOAD_BLOCKED_ABOVE' || code === 'ORIENTATION_NOT_ALLOWED') return 'STACK_LIMIT';
  if (code === 'TOP_LOAD_EXCEEDED' || code === 'NO_STACK_ON_TOP' || code === 'TOP_PRESSURE_EXCEEDED') return 'TOP_LOAD';
  if (code === 'PAYLOAD_EXCEEDED' || code === 'LINE_LOAD_EXCEEDED' || code.includes('AXLE') || code === 'GROSS_WEIGHT_EXCEEDED' || code.startsWith('CG_')) return 'PAYLOAD';
  return 'INVALID_CARGO';
}

export function validationToFindings(result: ValidationResult, placementIndexByExpandedId = new Map<string, number>()): OperationalRuleFinding[] {
  return result.violations.map(v => ({
    code: v.code,
    severity: v.severity,
    message: v.message,
    placementIndexes: [...new Set(v.itemIds.flatMap(id => {
      const index = placementIndexByExpandedId.get(id);
      return index == null ? [] : [index];
    }))],
    value: v.value,
    limit: v.limit,
  }));
}

export function packResultToLoadingResult(
  packed: { placements: LoadSimPlacement[]; unplaced: Item[]; validation: ValidationResult; strategy: string; shiftX: number; shiftY: number },
  context: LoadSimAdapterContext,
): LoadingResult {
  const placements: Placement[] = packed.placements.map(p => {
    const cargoId = context.byExpandedId.get(p.item.id) ?? p.item.id;
    const s = orientedSize(p.item.dims, p.orientation);
    return {
      cargoId,
      x: p.pos.x / MM_PER_M,
      y: p.pos.y / MM_PER_M,
      z: p.pos.z / MM_PER_M,
      length: s.x / MM_PER_M,
      width: s.y / MM_PER_M,
      height: s.z / MM_PER_M,
      weightKg: p.item.weight,
      rotated: p.orientation !== 'LWH',
      loadSimOrientation: p.orientation,
    };
  });
  const indexByExpanded = new Map(packed.placements.map((p, index) => [p.item.id, index]));
  const counts = new Map<string, number>();
  packed.unplaced.forEach(item => {
    const cargoId = context.byExpandedId.get(item.id) ?? item.id;
    counts.set(cargoId, (counts.get(cargoId) ?? 0) + 1);
  });
  const errors = packed.validation.violations.filter(v => v.severity === 'error');
  const reasonByCargo = new Map<string, string>();
  for (const v of errors) {
    for (const id of v.itemIds) {
      const cargoId = context.byExpandedId.get(id) ?? id;
      if (!reasonByCargo.has(cargoId)) reasonByCargo.set(cargoId, `[${v.code}] ${v.message}`);
    }
  }
  return {
    placements,
    remaining: [...counts].map(([cargoId, quantity]) => ({
      cargoId,
      quantity,
      reason: reasonByCargo.get(cargoId) ?? '새 load-sim 규칙에서 안전한 배치 위치를 찾지 못함',
    })),
    loadedWeightKg: packed.validation.metrics.totalWeight,
    usedVolumeM3: placements.reduce((sum, p) => sum + p.length * p.width * p.height, 0),
    validationIssues: errors.map(v => ({
      type: validationType(v.code),
      message: `[${v.code}] ${v.message}`,
      placementIndexes: [...new Set(v.itemIds.flatMap(id => {
        const index = indexByExpanded.get(id);
        return index == null ? [] : [index];
      }))],
    })),
    operationalFindings: validationToFindings(packed.validation, indexByExpanded),
    autoCorrections: [],
    ruleEngine: 'load-sim',
    ruleEngineStrategy: packed.strategy,
    loadSimShift: { x: packed.shiftX / MM_PER_M, y: packed.shiftY / MM_PER_M },
  };
}

export function partialLoadSimConfig(config?: Partial<LoadSimConfig>) { return config; }
