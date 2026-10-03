import { findMatchingEquipment } from '../transportEquipment';
import { CONTAINERS, TRUCKS, DEFAULT_CONFIG, pack, validate, orientedSize } from '../loadSim';
import type { Item, ItemType, Orientation, Placement as RulePlacement, Space, Violation } from '../loadSim';
import type { CargoItem, ContainerSpec, LoadingResult, OperationalRuleFinding, Placement, ValidationIssue } from './types';

const MM = 1000;
const SOURCE_PRESET_BY_EQUIPMENT: Record<string, Space> = {
  '20-standard': CONTAINERS['20GP'],
  '40-standard': CONTAINERS['40GP'],
  '40-high-cube': CONTAINERS['40HC'],
  '45-high-cube': CONTAINERS['45HC'],
};

const RULE_TO_LEGACY: Record<string, ValidationIssue['type']> = {
  OUT_OF_BOUNDS: 'OUT_OF_BOUNDS',
  HEIGHT_EXCEEDED: 'OUT_OF_BOUNDS',
  LOAD_LINE_EXCEEDED: 'OUT_OF_BOUNDS',
  OVERLAP: 'COLLISION',
  FLOATING: 'UNSUPPORTED',
  INSUFFICIENT_SUPPORT: 'UNSUPPORTED',
  CG_OUTSIDE_SUPPORT: 'UNSUPPORTED',
  TOP_LOAD_EXCEEDED: 'TOP_LOAD',
  NO_STACK_ON_TOP: 'TOP_LOAD',
  TOP_PRESSURE_EXCEEDED: 'TOP_LOAD',
  TIER_EXCEEDED: 'STACK_LIMIT',
  MUST_BE_ON_FLOOR: 'STACK_LIMIT',
  PAYLOAD_EXCEEDED: 'PAYLOAD',
};

function mm(value: number) { return value * MM; }
function m(value: number) { return value / MM; }

function cloneSpace(space: Space): Space {
  return {
    ...space,
    inner: { ...space.inner },
    door: space.door ? { ...space.door } : undefined,
    access: [...space.access],
    axles: space.axles ? { ...space.axles } : undefined,
  };
}

export function loadSimSpaceFromContainer(container: ContainerSpec): Space {
  const equipment = findMatchingEquipment(container.length, container.width, container.height, container.maxPayloadKg);
  const preset = equipment ? SOURCE_PRESET_BY_EQUIPMENT[equipment.id] : undefined;
  if (preset) {
    const space = cloneSpace(preset);
    space.inner = { l: mm(container.length), w: mm(container.width), h: mm(container.height) };
    space.maxPayload = container.maxPayloadKg;
    return space;
  }

  const category = equipment?.category ?? 'container';
  const access: Space['access'] = category === 'container'
    ? ['rear']
    : [
        ...(equipment?.sideLoading ? (['left', 'right'] as const) : []),
        'rear' as const,
        ...(equipment?.topLoading ? (['top'] as const) : []),
      ];
  const door = equipment?.doorWidth && equipment?.doorHeight
    ? { w: mm(equipment.doorWidth), h: mm(equipment.doorHeight) }
    : undefined;

  const truckPreset = category === 'truck'
    ? (Math.abs(container.length - 6.2) < .2 ? TRUCKS['5T_WING'] : Math.abs(container.length - 9.1) < .3 ? TRUCKS['11T_WING'] : undefined)
    : undefined;

  return {
    id: equipment?.id ?? 'CUSTOM',
    kind: category,
    inner: { l: mm(container.length), w: mm(container.width), h: mm(container.height) },
    door,
    access: access.length ? access : ['rear'],
    maxPayload: container.maxPayloadKg,
    tare: truckPreset?.tare ?? 0,
    floorLineLoad: preset?.floorLineLoad,
    axles: truckPreset?.axles ? { ...truckPreset.axles } : undefined,
  };
}

function itemType(cargo: CargoItem): ItemType {
  return cargo.loadType ?? 'carton';
}

function allowedOrientations(cargo: CargoItem): Orientation[] | undefined {
  if (cargo.allowRotation === false) return ['LWH'];
  return undefined;
}

function ruleItem(cargo: CargoItem, id: string): Item {
  return {
    id,
    type: itemType(cargo),
    dims: { l: mm(cargo.length), w: mm(cargo.width), h: mm(cargo.height) },
    weight: cargo.weightKg,
    allowedOrientations: allowedOrientations(cargo),
    thisSideUp: cargo.thisSideUp,
    maxTopLoad: cargo.maxTopLoadKg,
    maxTopPressure: cargo.maxTopPressureKgPerM2,
    maxTier: cargo.maxStackLayers,
    canBePlacedOnTop: cargo.floorOnly ? false : undefined,
    stopSeq: cargo.unloadPriority,
    groupId: cargo.groupId ?? cargo.productId,
    segregationClass: cargo.segregationClass,
    tempZone: cargo.tempZone,
    friction: cargo.friction,
    forklift: cargo.forklift,
  };
}

function expandCargo(cargo: CargoItem[]) {
  const items: Item[] = [];
  const originalId = new Map<string, string>();
  for (const row of cargo) {
    const quantity = Math.max(0, Math.floor(row.quantity));
    for (let index = 0; index < quantity; index += 1) {
      const unique = `${row.id}::${index + 1}`;
      items.push(ruleItem(row, unique));
      originalId.set(unique, row.id);
    }
  }
  return { items, originalId };
}

function toPlacement(p: RulePlacement, originalId: Map<string, string>): Placement {
  const size = orientedSize(p.item.dims, p.orientation);
  return {
    cargoId: originalId.get(p.item.id) ?? p.item.id,
    x: m(p.pos.x),
    y: m(p.pos.y),
    z: m(p.pos.z),
    length: m(size.x),
    width: m(size.y),
    height: m(size.z),
    weightKg: p.item.weight,
    rotated: p.orientation !== 'LWH',
    loadSimOrientation: p.orientation,
  };
}

function toRulePlacement(p: Placement, cargo: CargoItem, uniqueId: string): RulePlacement {
  const orientation: Orientation = p.loadSimOrientation ?? (p.rotated === true ? 'WLH' : 'LWH');
  return {
    item: ruleItem(cargo, uniqueId),
    pos: { x: mm(p.x), y: mm(p.y), z: mm(p.z) },
    orientation,
  };
}

function finding(v: Violation, indexByItemId: Map<string, number[]>): OperationalRuleFinding {
  const placementIndexes = v.itemIds.flatMap(id => indexByItemId.get(id) ?? []);
  return {
    code: v.code,
    severity: v.severity,
    message: v.message,
    placementIndexes: [...new Set(placementIndexes)],
    value: v.value,
    limit: v.limit,
  };
}

export function legacyIssuesFromLoadSim(findings: OperationalRuleFinding[]): ValidationIssue[] {
  return findings
    .filter(v => v.severity === 'error')
    .map(v => ({
      type: RULE_TO_LEGACY[v.code] ?? 'RULE',
      message: `[${v.code}] ${v.message}`,
      placementIndexes: v.placementIndexes,
    }));
}

function findingsFromValidation(violations: Violation[], ids: string[]) {
  const indexes = new Map<string, number[]>();
  ids.forEach((id, index) => {
    const list = indexes.get(id) ?? [];
    list.push(index);
    indexes.set(id, list);
  });
  return violations.map(v => finding(v, indexes));
}

function remainingFromUnplaced(unplaced: Item[], originalId: Map<string, string>) {
  const counts = new Map<string, number>();
  for (const item of unplaced) {
    const id = originalId.get(item.id) ?? item.id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()].map(([cargoId, quantity]) => ({
    cargoId,
    quantity,
    reason: '업로드된 load-sim 규칙에서 배치 가능한 위치를 찾지 못했습니다.',
  }));
}

export function packWithLoadSimRules(container: ContainerSpec, cargo: CargoItem[]): LoadingResult {
  const active = cargo.filter(row => row.quantity > 0);
  const { items, originalId } = expandCargo(active);
  if (!items.length) return {
    placements: [], remaining: [], loadedWeightKg: 0, usedVolumeM3: 0,
    validationIssues: [], operationalFindings: [], autoCorrections: [],
  };

  const space = loadSimSpaceFromContainer(container);
  const packed = pack(items, space, { iterations: 8 });
  const placements = packed.placements.map(p => toPlacement(p, originalId));
  const findings = findingsFromValidation(packed.validation.violations, packed.placements.map(p => p.item.id));
  return {
    placements,
    remaining: remainingFromUnplaced(packed.unplaced, originalId),
    loadedWeightKg: packed.validation.metrics.totalWeight,
    usedVolumeM3: placements.reduce((sum, p) => sum + p.length * p.width * p.height, 0),
    validationIssues: legacyIssuesFromLoadSim(findings),
    operationalFindings: findings,
    autoCorrections: [],
  };
}

export function validateWithLoadSimRules(container: ContainerSpec, cargo: CargoItem[], placements: Placement[]) {
  const cargoMap = new Map(cargo.map(row => [row.id, row]));
  const seen = new Map<string, number>();
  const rulePlacements: RulePlacement[] = [];
  const ids: string[] = [];
  placements.forEach(p => {
    const row = cargoMap.get(p.cargoId);
    if (!row) return;
    const n = (seen.get(row.id) ?? 0) + 1;
    seen.set(row.id, n);
    const unique = `${row.id}::manual::${n}`;
    rulePlacements.push(toRulePlacement(p, row, unique));
    ids.push(unique);
  });
  const validation = validate(rulePlacements, loadSimSpaceFromContainer(container), DEFAULT_CONFIG);
  return {
    validation,
    findings: findingsFromValidation(validation.violations, ids),
  };
}
