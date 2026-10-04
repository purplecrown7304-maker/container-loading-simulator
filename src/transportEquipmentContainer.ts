import type { ContainerSpec } from './engine/types';
import type { TransportEquipment } from './transportEquipment';

export const APPLY_TRANSPORT_EQUIPMENT_EVENT = 'container-loading:apply-transport-equipment';
export type ApplyTransportEquipmentDetail = { equipment: TransportEquipment; applied: boolean };

export function equipmentGeometryMatches(container: ContainerSpec, equipment: TransportEquipment) {
  return container.length === equipment.length
    && container.width === equipment.width
    && container.height === equipment.height
    && container.maxPayloadKg === equipment.maxPayloadKg;
}

/** An equipment transition replaces its physical source; kg/m² never becomes kg/m. */
export function containerWithEquipment(current: ContainerSpec, equipment: TransportEquipment, preservePhysical = false): ContainerSpec {
  const source: ContainerSpec = {
    length: equipment.length,
    width: equipment.width,
    height: equipment.height,
    maxPayloadKg: equipment.maxPayloadKg,
    floorLoadLimitKgPerM2: equipment.floorLoadLimitKgPerM2,
    transportKind: equipment.category,
    doorWidth: equipment.doorWidth,
    doorHeight: equipment.doorHeight,
    access: equipment.access ?? ['rear', ...(equipment.sideLoading ? ['left', 'right'] as const : []), ...(equipment.topLoading ? ['top'] as const : [])],
    tareKg: equipment.tareKg,
    floorLineLoadKgPerM: equipment.floorLineLoadKgPerM,
    heightLimitM: equipment.heightLimitM,
    axles: equipment.axles ? { ...equipment.axles } : undefined,
  };
  if (!preservePhysical) return source;
  // Observer refreshes of the same equipment must not erase actual user-entered data.
  return { ...source, ...current, length: source.length, width: source.width, height: source.height,
    maxPayloadKg: source.maxPayloadKg, floorLoadLimitKgPerM2: source.floorLoadLimitKgPerM2 };
}

