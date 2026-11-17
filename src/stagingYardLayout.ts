import { sceneCenter } from './threeComparisonSceneState';
import { vehicleLayout, type VehicleFootprint, type VehicleRigKind } from './threeVehicleLayout';

/** Display layout only. These distances are not transport or site safety limits. */
export const DEFAULT_STAGING_YARD_SETTINGS = Object.freeze({
  aisleWidth: 1.8,
  doorClearance: 1.6,
  cargoGap: .24,
  zoneGap: .65,
  edgeMargin: .5,
  rowsPerZone: 4,
  minimumGroundLength: 5,
  minimumBankWidth: 1.2,
});
export type StagingYardSettings = { [Key in keyof typeof DEFAULT_STAGING_YARD_SETTINGS]: number };
export type StagingLayoutUnit = {
  id: string; kind: 'box' | 'pallet'; length: number; width: number; height: number;
  cargoId?: string; groupId?: string;
};
/** Same Y-up world coordinates used by the existing Three/Rapier viewer. */
export type StagingYardFrame = {
  rearCenter: [number, number, number];
  /** Horizontal unit vector pointing out of the rear door. */
  outward: [number, number];
  groundY: number;
};
export type StagingBounds = { min: [number, number, number]; max: [number, number, number] };
export type StagingLocalRect = { start: number; end: number; minLateral: number; maxLateral: number };
export type StagingYardSlot = {
  unitId: string; zoneId: string; label: string; slotIndex: number; groupKey: string;
  center: [number, number, number]; rotationY: number;
  /** Rearward and leftward center in the yard frame; Y is the outside ground. */
  localCenter: [number, number];
  length: number; width: number; height: number;
};
export type StagingYardZone = {
  id: string; groupKey: string; kind: 'box' | 'pallet';
  unitLength: number; unitWidth: number; unitHeight: number;
  start: number; end: number; capacity: number; unitIds: string[];
  bounds: StagingBounds;
};
export type StagingYardLayout = {
  frame: StagingYardFrame; settings: StagingYardSettings;
  slots: StagingYardSlot[]; zones: StagingYardZone[];
  ground: StagingLocalRect; aisle: StagingLocalRect; doorClearance: StagingLocalRect;
  bounds: StagingBounds; focusBounds: StagingBounds;
  rejected: Array<{ unitId: string; reason: string }>;
};
export type StagingYardLayoutOptions = {
  container: VehicleFootprint; vehicleRig: VehicleRigKind;
  settings?: Partial<StagingYardSettings>;
  previous?: StagingYardLayout | null;
  /** Only needed if an owner applies an additional vehicle world transform. */
  frame?: StagingYardFrame;
};

export function stagingYardFrame(container: VehicleFootprint, rig: VehicleRigKind): StagingYardFrame {
  // X=container.length is the existing engine's +X rear door. Reuse the
  // renderer conversion instead of assuming its container centering offset.
  const rearCenter = sceneCenter({ x: container.length, y: container.width / 2, z: 0, length: 0, width: 0, height: 0 }, container);
  const groundY = vehicleLayout(rig, container).groundY;
  return { rearCenter, outward: [1, 0], groundY };
}

export function stagingYardWorldPoint(frame: StagingYardFrame, rearward: number, leftward: number, height = 0): [number, number, number] {
  const [x, z] = frame.outward;
  return [frame.rearCenter[0] + rearward * x - leftward * z, frame.groundY + height, frame.rearCenter[2] + rearward * z + leftward * x];
}

export function stagingRectBounds(frame: StagingYardFrame, rect: StagingLocalRect, height = 0): StagingBounds {
  const points = [rect.start, rect.end].flatMap(u => [rect.minLateral, rect.maxLateral].map(v => stagingYardWorldPoint(frame, u, v)));
  return {
    min: [Math.min(...points.map(p => p[0])), frame.groundY, Math.min(...points.map(p => p[2]))],
    max: [Math.max(...points.map(p => p[0])), frame.groundY + height, Math.max(...points.map(p => p[2]))],
  };
}

function groupKey(unit: StagingLayoutUnit) {
  return JSON.stringify([unit.kind, unit.groupId ?? unit.cargoId ?? '', unit.length, unit.width, unit.height]);
}
function zoneName(index: number) {
  let label = '', n = index + 1;
  while (n > 0) { n--; label = String.fromCharCode(65 + n % 26) + label; n = Math.floor(n / 26); }
  return label;
}
function settingsFor(options?: Partial<StagingYardSettings>): StagingYardSettings {
  const settings = { ...DEFAULT_STAGING_YARD_SETTINGS, ...options };
  for (const [key, value] of Object.entries(settings)) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid staging yard display setting: ${key}`);
  }
  if (settings.aisleWidth <= 0 || settings.minimumBankWidth <= 0 || settings.minimumGroundLength <= 0
    || !Number.isInteger(settings.rowsPerZone) || settings.rowsPerZone < 1 || settings.rowsPerZone > 64) throw new Error('Invalid staging yard display dimensions');
  return settings;
}
function checkedFrame(frame: StagingYardFrame): StagingYardFrame {
  if (![...frame.rearCenter, ...frame.outward, frame.groundY].every(Number.isFinite)) throw new Error('Invalid staging yard frame');
  const magnitude = Math.hypot(...frame.outward);
  if (magnitude < 1e-9) throw new Error('Staging yard requires a rearward direction');
  return { rearCenter: [...frame.rearCenter], outward: [frame.outward[0] / magnitude, frame.outward[1] / magnitude], groundY: frame.groundY };
}

/** Stable display slots, independent of loading order, placements and validation.
 * Each SKU/size gets two banks of floor slots. Existing matching slots survive
 * additions, removal and input sorting; newly needed zones extend rearward.
 */
export function buildStagingYardLayout(units: readonly StagingLayoutUnit[], options: StagingYardLayoutOptions): StagingYardLayout {
  const settings = settingsFor(options.settings), frame = checkedFrame(options.frame ?? stagingYardFrame(options.container, options.vehicleRig));
  const seen = new Set<string>(), rejected: StagingYardLayout['rejected'] = [], valid: StagingLayoutUnit[] = [];
  for (const unit of units) {
    if (!unit.id || seen.has(unit.id)) throw new Error(`Duplicate or missing staging unit identity: ${unit.id}`);
    seen.add(unit.id);
    if (![unit.length, unit.width, unit.height].every(value => Number.isFinite(value) && value > 0)) {
      rejected.push({ unitId: unit.id, reason: 'Invalid cargo display dimensions' });
    } else valid.push(unit);
  }
  const byId = new Map(valid.map(unit => [unit.id, unit]));
  const groups = new Map<string, StagingLayoutUnit[]>();
  valid.forEach(unit => { const key = groupKey(unit); const list = groups.get(key) ?? []; list.push(unit); groups.set(key, list); });
  const previous = options.previous && JSON.stringify(options.previous.settings) === JSON.stringify(settings) ? options.previous : null;
  const zones: StagingYardZone[] = (previous?.zones ?? []).filter(zone => groups.has(zone.groupKey)).map(zone => ({ ...zone, unitIds: [], bounds: zone.bounds }));
  const occupied = new Map<string, Map<number, string>>();
  zones.forEach(zone => occupied.set(zone.id, new Map()));
  const assigned = new Set<string>();
  for (const slot of previous?.slots ?? []) {
    const unit = byId.get(slot.unitId), zone = zones.find(item => item.id === slot.zoneId);
    if (unit && zone && groupKey(unit) === zone.groupKey && slot.slotIndex >= 0 && slot.slotIndex < zone.capacity) {
      occupied.get(zone.id)!.set(slot.slotIndex, unit.id); assigned.add(unit.id);
    }
  }
  let nextZone = Math.max(-1, ...(previous?.zones ?? []).map(zone => {
    let n = 0; for (const char of zone.id) n = n * 26 + char.charCodeAt(0) - 64; return n - 1;
  })) + 1;
  for (const [key, group] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    for (const unit of group.slice().sort((a, b) => a.id.localeCompare(b.id))) {
      if (assigned.has(unit.id)) continue;
      let zone = zones.find(item => item.groupKey === key && occupied.get(item.id)!.size < item.capacity);
      if (!zone) {
        const start = Math.max(settings.doorClearance + settings.edgeMargin, ...zones.map(item => item.end + settings.zoneGap));
        zone = { id: zoneName(nextZone++), groupKey: key, kind: unit.kind, unitLength: unit.length, unitWidth: unit.width, unitHeight: unit.height,
          start, end: start + settings.rowsPerZone * (unit.length + settings.cargoGap), capacity: settings.rowsPerZone * 2,
          unitIds: [], bounds: { min: [0, 0, 0], max: [0, 0, 0] } };
        zones.push(zone); occupied.set(zone.id, new Map());
      }
      const slots = occupied.get(zone.id)!;
      let index = 0; while (slots.has(index)) index++;
      slots.set(index, unit.id); assigned.add(unit.id);
    }
  }
  const rotationY = -Math.atan2(frame.outward[1], frame.outward[0]);
  const slots: StagingYardSlot[] = [];
  for (const zone of zones) {
    const bank = settings.aisleWidth / 2 + settings.cargoGap + zone.unitWidth;
    zone.bounds = stagingRectBounds(frame, { start: zone.start, end: zone.end, minLateral: -bank, maxLateral: bank }, zone.unitHeight);
    for (const [index, id] of [...occupied.get(zone.id)!].sort(([a], [b]) => a - b)) {
      const unit = byId.get(id)!;
      const u = zone.start + (Math.floor(index / 2) + .5) * (unit.length + settings.cargoGap);
      const v = (index % 2 === 0 ? 1 : -1) * (settings.aisleWidth / 2 + settings.cargoGap + unit.width / 2);
      slots.push({ unitId: id, zoneId: zone.id, label: `${zone.id}-${String(index + 1).padStart(2, '0')}`, slotIndex: index,
        groupKey: zone.groupKey, center: stagingYardWorldPoint(frame, u, v), rotationY, localCenter: [u, v], length: unit.length, width: unit.width, height: unit.height });
      zone.unitIds.push(id);
    }
  }
  const bankWidth = Math.max(settings.minimumBankWidth, ...valid.map(unit => unit.width));
  const lateral = settings.aisleWidth / 2 + settings.cargoGap + bankWidth + settings.edgeMargin;
  const ground = { start: 0, end: Math.max(settings.minimumGroundLength, ...zones.map(zone => zone.end + settings.edgeMargin)), minLateral: -lateral, maxLateral: lateral };
  const bounds = stagingRectBounds(frame, ground, Math.max(.01, ...valid.map(unit => unit.height)));
  return { frame, settings, slots, zones, ground, bounds, focusBounds: zones[0]?.bounds ?? bounds, rejected,
    aisle: { ...ground, start: settings.doorClearance, minLateral: -settings.aisleWidth / 2, maxLateral: settings.aisleWidth / 2 },
    doorClearance: { ...ground, end: settings.doorClearance } };
}
