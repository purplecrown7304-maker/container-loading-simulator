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
  /** 적재공간 x=0 기준 앞축 작용점. 실제 차량 제원이 있을 때만 입력한다. */
  frontAxleX?: number;
  /** 적재공간 x=0 기준 뒤축 작용점. frontAxleX보다 커야 한다. */
  rearAxleX?: number;
  /** 적재화물 기준 앞축 허용하중. 미입력 시 반력만 계산한다. */
  frontAxleMaxKg?: number;
  /** 적재화물 기준 뒤축 허용하중. 미입력 시 반력만 계산한다. */
  rearAxleMaxKg?: number;
};

export type TransportEquipmentSpecOverrides = Record<string, TransportEquipmentSpecOverride>;

function validPositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
function validNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function sanitize(value: unknown): TransportEquipmentSpecOverride | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Partial<TransportEquipmentSpecOverride>;
  if (![source.length, source.width, source.height, source.maxPayloadKg, source.floorLoadLimitKgPerM2].every(validPositive)) return null;

  const hasAnyAxle = [source.frontAxleX, source.rearAxleX, source.frontAxleMaxKg, source.rearAxleMaxKg]
    .some(item => item !== undefined && item !== null);
  let axle: Pick<TransportEquipmentSpecOverride, 'frontAxleX' | 'rearAxleX' | 'frontAxleMaxKg' | 'rearAxleMaxKg'> = {};
  if (hasAnyAxle) {
    if (!validNonNegative(source.frontAxleX) || !validPositive(source.rearAxleX) || source.rearAxleX <= source.frontAxleX) return null;
    axle = {
      frontAxleX: source.frontAxleX,
      rearAxleX: source.rearAxleX,
      frontAxleMaxKg: validPositive(source.frontAxleMaxKg) ? source.frontAxleMaxKg : undefined,
      rearAxleMaxKg: validPositive(source.rearAxleMaxKg) ? source.rearAxleMaxKg : undefined,
    };
  }

  return {
    length: source.length!,
    width: source.width!,
    height: source.height!,
    maxPayloadKg: source.maxPayloadKg!,
    floorLoadLimitKgPerM2: source.floorLoadLimitKgPerM2!,
    doorWidth: validPositive(source.doorWidth) ? source.doorWidth : undefined,
    doorHeight: validPositive(source.doorHeight) ? source.doorHeight : undefined,
    ...axle,
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
  if (!cleaned) {
    throw new Error('길이·폭·높이·최대 적재중량·바닥 허용하중을 확인하세요. 차축을 입력했다면 앞축 위치 < 뒤축 위치여야 합니다.');
  }
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
  } as TransportEquipment;
}

export function sameTransportEquipmentSpec(a: TransportEquipment, b: TransportEquipment) {
  const ax = a as TransportEquipment & Partial<TransportEquipmentSpecOverride>;
  const bx = b as TransportEquipment & Partial<TransportEquipmentSpecOverride>;
  return Math.abs(a.length - b.length) < 0.000001
    && Math.abs(a.width - b.width) < 0.000001
    && Math.abs(a.height - b.height) < 0.000001
    && Math.abs(a.maxPayloadKg - b.maxPayloadKg) < 0.001
    && Math.abs(a.floorLoadLimitKgPerM2 - b.floorLoadLimitKgPerM2) < 0.001
    && Math.abs((a.doorWidth ?? 0) - (b.doorWidth ?? 0)) < 0.000001
    && Math.abs((a.doorHeight ?? 0) - (b.doorHeight ?? 0)) < 0.000001
    && Math.abs((ax.frontAxleX ?? 0) - (bx.frontAxleX ?? 0)) < 0.000001
    && Math.abs((ax.rearAxleX ?? 0) - (bx.rearAxleX ?? 0)) < 0.000001
    && Math.abs((ax.frontAxleMaxKg ?? 0) - (bx.frontAxleMaxKg ?? 0)) < 0.001
    && Math.abs((ax.rearAxleMaxKg ?? 0) - (bx.rearAxleMaxKg ?? 0)) < 0.001;
}
