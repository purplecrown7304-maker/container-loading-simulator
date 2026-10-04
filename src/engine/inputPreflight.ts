import { ALL_ORIENTATIONS } from './loadSimA/types';
import type { CargoItem, ContainerSpec } from './types';

export type RejectedCargoRow = {
  cargoId: string;
  quantity: number;
  reason: string;
};

export type CargoPreflightResult = {
  cargo: CargoItem[];
  rejected: RejectedCargoRow[];
};

const finitePositive = (value: number) => Number.isFinite(value) && value > 0;
const finiteNonNegative = (value: number) => Number.isFinite(value) && value >= 0;

function safeRejectedQuantity(item: CargoItem) {
  return Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1;
}

function rowError(item: CargoItem) {
  if (item.allowedOrientations && (!item.allowedOrientations.length || item.allowedOrientations.some(o=>!ALL_ORIENTATIONS.includes(o)))) return '허용 회전 입력 오류';
  if (item.cgOffsetMm && !Object.values(item.cgOffsetMm).every(Number.isFinite)) return '화물 무게중심 입력 오류';
  if (item.friction !== undefined && (!Number.isFinite(item.friction) || item.friction<0)) return '마찰계수 입력 오류';
  if (item.maxTopPressureKgPerM2 !== undefined && (!Number.isFinite(item.maxTopPressureKgPerM2)||item.maxTopPressureKgPerM2<0)) return '허용 면압 입력 오류';
  if (!item.id?.trim()) return 'SKU 코드가 비어 있어 적재 대상에서 제외됨';
  if (!finitePositive(item.length) || !finitePositive(item.width) || !finitePositive(item.height)) {
    return '박스 길이·폭·높이는 0보다 큰 유한한 값이어야 함';
  }
  if (!finitePositive(item.weightKg)) return '박스 중량은 0보다 큰 유한한 값이어야 함';
  if (!Number.isInteger(item.quantity) || item.quantity < 0) return '수량은 0 이상의 정수여야 함';
  if (item.maxStackLayers != null && (!Number.isInteger(item.maxStackLayers) || item.maxStackLayers < 1)) {
    return '최대 적층단은 1 이상의 정수여야 함';
  }
  if (item.maxTopLoadKg != null && !finiteNonNegative(item.maxTopLoadKg)) {
    return '상부 허용중량은 0 이상의 유한한 값이어야 함';
  }
  if (item.unloadPriority != null && (!Number.isInteger(item.unloadPriority) || item.unloadPriority < 1)) {
    return '하역 우선순위는 1 이상의 정수여야 함';
  }
  return null;
}

function samePhysicalSpec(a: CargoItem, b: CargoItem) {
  return a.length === b.length
    && a.width === b.width
    && a.height === b.height
    && a.weightKg === b.weightKg
    && a.maxStackLayers === b.maxStackLayers
    && a.maxTopLoadKg === b.maxTopLoadKg
    && a.allowRotation === b.allowRotation
    && a.unloadPriority === b.unloadPriority
    && JSON.stringify([a.allowedOrientations,a.thisSideUp,a.cgOffsetMm,a.friction,a.maxTopPressureKgPerM2,a.segregationClass,a.tempZone,a.floorOnly,a.unitKind]) === JSON.stringify([b.allowedOrientations,b.thisSideUp,b.cgOffsetMm,b.friction,b.maxTopPressureKgPerM2,b.segregationClass,b.tempZone,b.floorOnly,b.unitKind]);
}

export function preflightCargoInput(rows: CargoItem[]): CargoPreflightResult {
  const rejected: RejectedCargoRow[] = [];
  const valid: CargoItem[] = [];

  for (const row of rows) {
    const normalized = { ...row, id: row.id?.trim() ?? '', name: row.name?.trim() ?? '' };
    const error = rowError(normalized);
    if (error) {
      rejected.push({ cargoId: normalized.id || '(빈 SKU)', quantity: safeRejectedQuantity(normalized), reason: error });
      continue;
    }
    if (normalized.quantity === 0) continue;
    valid.push(normalized);
  }

  const grouped = new Map<string, CargoItem[]>();
  for (const item of valid) {
    const group = grouped.get(item.id) ?? [];
    group.push(item);
    grouped.set(item.id, group);
  }

  const cargo: CargoItem[] = [];
  for (const [id, group] of grouped) {
    const first = group[0];
    const conflict = group.some((item) => !samePhysicalSpec(first, item));
    if (conflict) {
      rejected.push({
        cargoId: id,
        quantity: group.reduce((sum, item) => sum + item.quantity, 0),
        reason: '동일 SKU 코드에 서로 다른 규격·중량·적층조건이 입력되어 전체 행을 제외함',
      });
      continue;
    }
    cargo.push({ ...first, quantity: group.reduce((sum, item) => sum + item.quantity, 0) });
  }

  return { cargo, rejected };
}

export function containerInputError(container: ContainerSpec) {
  if(container.rules){
    const r=container.rules, ax=r.axles;
    if(r.door && ![r.door.w,r.door.h].every(finitePositive))return '문 개구 입력 오류';
    if(r.tareKg!==undefined&&!finiteNonNegative(r.tareKg))return '차량 자중 입력 오류';
    if(r.floorLineLoadKgPerM!==undefined&&!finitePositive(r.floorLineLoadKgPerM))return '바닥 선하중 입력 오류';
    if(ax && (![ax.frontX,ax.rearX].every(Number.isFinite)||ax.rearX<=ax.frontX||![ax.emptyFront,ax.emptyRear].every(finiteNonNegative)||![ax.maxFront,ax.maxRear,ax.maxGross].every(finitePositive)||![ax.frontAxleCount??1,ax.rearAxleCount].every(n=>Number.isInteger(n)&&n>0)))return '실제 축 제원 입력 오류';
    if(!r.access.length)return '적재 접근면 입력 오류';
  }
  if (!finitePositive(container.length) || !finitePositive(container.width) || !finitePositive(container.height)) {
    return '컨테이너 길이·폭·높이는 0보다 큰 유한한 값이어야 함';
  }
  if (!finitePositive(container.maxPayloadKg)) return '컨테이너 최대 적재중량은 0보다 큰 유한한 값이어야 함';
  if (container.floorLoadLimitKgPerM2 != null && !finitePositive(container.floorLoadLimitKgPerM2)) {
    return '바닥 허용하중은 0보다 큰 유한한 값이어야 함';
  }
  if (container.floorLoadWarningMultiplier != null && !finitePositive(container.floorLoadWarningMultiplier)) {
    return '바닥하중 경고 배수는 0보다 큰 유한한 값이어야 함';
  }
  return null;
}
