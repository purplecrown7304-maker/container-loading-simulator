import type { TransportEquipment } from './transportEquipment';

const STORAGE_KEY = 'container-loading:transport-equipment-spec-overrides:v1';
export const TRANSPORT_EQUIPMENT_SPEC_OVERRIDES_EVENT = 'container-loading:transport-equipment-spec-overrides-updated';

export type TransportEquipmentSpecOverride = {
  length: number;
  width: number;
  height: number;
  maxPayloadKg: number;
  floorLoadLimitKgPerM2: number;
  doorWidth?: number;
  doorHeight?: number;
};

export type TransportEquipmentSpecOverrides = Record<string, TransportEquipmentSpecOverride>;

function validPositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function sanitize(value: unknown): TransportEquipmentSpecOverride | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Partial<TransportEquipmentSpecOverride>;
  if (![source.length, source.width, source.height, source.maxPayloadKg, source.floorLoadLimitKgPerM2].every(validPositive)) return null;
  return {
    length: source.length!,
    width: source.width!,
    height: source.height!,
    maxPayloadKg: source.maxPayloadKg!,
    floorLoadLimitKgPerM2: source.floorLoadLimitKgPerM2!,
    doorWidth: validPositive(source.doorWidth) ? source.doorWidth : undefined,
    doorHeight: validPositive(source.doorHeight) ? source.doorHeight : undefined,
  };
}

export function readTransportEquipmentSpecOverrides(): TransportEquipmentSpecOverrides {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}') as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).flatMap(([id, value]) => {
      const cleaned = sanitize(value);
      return cleaned ? [[id, cleaned] as const] : [];
    }));
  } catch {
    return {};
  }
}

function writeAll(next: TransportEquipmentSpecOverrides) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent<TransportEquipmentSpecOverrides>(TRANSPORT_EQUIPMENT_SPEC_OVERRIDES_EVENT, { detail: next }));
}

export function setTransportEquipmentSpecOverride(id: string, spec: TransportEquipmentSpecOverride) {
  const cleaned = sanitize(spec);
  if (!cleaned) throw new Error('길이·폭·높이·최대 적재중량·바닥 허용하중은 모두 0보다 커야 합니다.');
  const next = { ...readTransportEquipmentSpecOverrides(), [id]: cleaned };
  writeAll(next);
  return next;
}

export function removeTransportEquipmentSpecOverride(id: string) {
  const next = { ...readTransportEquipmentSpecOverrides() };
  delete next[id];
  writeAll(next);
  return next;
}

export function applyTransportEquipmentSpecOverride(item: TransportEquipment): TransportEquipment {
  const override = readTransportEquipmentSpecOverrides()[item.id];
  if (!override) return item;
  return {
    ...item,
    ...override,
    volumeM3: override.length * override.width * override.height,
    sourceLabel: `${item.sourceLabel} · 사용자 수정 규격`,
  };
}

export function sameTransportEquipmentSpec(a: TransportEquipment, b: TransportEquipment) {
  return Math.abs(a.length - b.length) < 0.000001
    && Math.abs(a.width - b.width) < 0.000001
    && Math.abs(a.height - b.height) < 0.000001
    && Math.abs(a.maxPayloadKg - b.maxPayloadKg) < 0.001
    && Math.abs(a.floorLoadLimitKgPerM2 - b.floorLoadLimitKgPerM2) < 0.001
    && Math.abs((a.doorWidth ?? 0) - (b.doorWidth ?? 0)) < 0.000001
    && Math.abs((a.doorHeight ?? 0) - (b.doorHeight ?? 0)) < 0.000001;
}
