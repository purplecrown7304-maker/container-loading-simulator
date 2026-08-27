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
  if (!item.id?.trim()) return 'SKU 코드가 비어 있어 적재 대상에서 제외됨';
  if (!finitePositive(item.length) || !finitePositive(item.width) || !finitePositive(item.height)) {
    return '박스 길이·폭·높이는 0보다 큰 유한한 값이어야 함';
  }
  if (!finitePositive(item.weightKg)) return '박스 중량은 0보다 큰 유한한 값이어야 함';
  if (!Number.isInteger(item.quantity) || item.quantity <= 0) return '수량은 1 이상의 정수여야 함';
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
    && a.unloadPriority === b.unloadPriority;
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
