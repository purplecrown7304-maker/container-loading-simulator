import type { ContainerSpec } from './engine/types';

export type TruckPresetId =
  | 'tautliner'
  | 'refrigerated-truck'
  | 'isotherm-truck'
  | 'mega-trailer'
  | 'custom-truck';

export type TruckPreset = {
  id: TruckPresetId;
  label: string;
  shortLabel: string;
  icon: 'curtainsider' | 'reefer-truck' | 'isotherm-truck' | 'mega' | 'custom-truck';
  spec?: ContainerSpec;
  pallets?: string;
  note: string;
};

const commonFloor = {
  floorLoadLimitKgPerM2: 1500,
  floorLoadWarningMultiplier: 3,
};

/**
 * SeaRates 공개 reference 값을 시뮬레이터 시작점으로 사용한다.
 * 실제 차량 내부치수/허용중량은 제작사·축구성·운송사별 차이가 크므로
 * 작업지시 전 현장 차량 사양으로 수정하는 것을 전제로 한다.
 */
export const TRUCK_PRESETS: TruckPreset[] = [
  {
    id: 'tautliner',
    label: 'TAUTLINER (CURTAINSIDER)',
    shortLabel: 'Tautliner',
    icon: 'curtainsider',
    spec: {
      length: 13.6,
      width: 2.5,
      height: 2.65,
      maxPayloadKg: 25000,
      ...commonFloor,
      transportKind: 'truck',
      transportType: 'tautliner',
      sideWallModel: 'curtain',
      roofModel: 'soft',
    },
    pallets: '33 팔레트 참고',
    note: '커튼사이더 · 측면 커튼/슬라이딩 루프는 화물 지지벽으로 계산하지 않음',
  },
  {
    id: 'refrigerated-truck',
    label: 'REFRIGERATED TRUCK',
    shortLabel: 'Refrigerated Truck',
    icon: 'reefer-truck',
    spec: {
      length: 8,
      width: 2.5,
      height: 2.5,
      maxPayloadKg: 20000,
      ...commonFloor,
      transportKind: 'truck',
      transportType: 'refrigerated-truck',
      sideWallModel: 'rigid',
      roofModel: 'rigid',
      temperatureControlled: true,
    },
    pallets: '12~24 팔레트 참고',
    note: '냉동 박스형 · 강체 벽/지붕 모델 · 실제 냉동기 돌출과 통풍 여유는 별도 확인',
  },
  {
    id: 'isotherm-truck',
    label: 'ISOTHERM TRUCK',
    shortLabel: 'Isotherm Truck',
    icon: 'isotherm-truck',
    spec: {
      length: 8,
      width: 2.5,
      height: 2.5,
      maxPayloadKg: 20000,
      ...commonFloor,
      transportKind: 'truck',
      transportType: 'isotherm-truck',
      sideWallModel: 'rigid',
      roofModel: 'rigid',
      temperatureControlled: true,
    },
    pallets: '12~14 팔레트 참고',
    note: '보냉 박스형 · 일정 온도 유지 화물용 · 강체 벽/지붕 모델',
  },
  {
    id: 'mega-trailer',
    label: 'MEGA-TRAILER',
    shortLabel: 'Mega Trailer',
    icon: 'mega',
    spec: {
      length: 13.6,
      width: 2.47,
      height: 3.0,
      maxPayloadKg: 24000,
      ...commonFloor,
      transportKind: 'truck',
      transportType: 'mega-trailer',
      sideWallModel: 'curtain',
      roofModel: 'soft',
    },
    pallets: '33 팔레트 참고',
    note: '대용적 커튼사이더 · 높은 내부고 · 커튼/슬라이딩 루프를 구조 지지벽으로 사용하지 않음',
  },
  {
    id: 'custom-truck',
    label: 'CUSTOM TRUCK',
    shortLabel: 'Custom Truck',
    icon: 'custom-truck',
    note: '현재 치수를 유지한 채 트럭 모드로 전환 후 직접 치수 입력',
  },
];

export const TRUCK_REFERENCE_ONLY = [
  {
    id: 'jumbo',
    label: 'JUMBO',
    icon: 'jumbo',
    note: '2분할/연결 차체 적재공간 모델이 필요해 단일 직육면체 엔진에서는 아직 계산하지 않음',
  },
] as const;

const near = (a: number, b: number) => Math.abs(a - b) < 0.02;

export function matchTruckPreset(container: ContainerSpec): TruckPresetId | undefined {
  if (container.transportKind !== 'truck') return undefined;
  const byType = TRUCK_PRESETS.find(item => item.id === container.transportType);
  if (byType) return byType.id;
  const bySize = TRUCK_PRESETS.find(item => item.spec
    && near(container.length, item.spec.length)
    && near(container.width, item.spec.width)
    && near(container.height, item.spec.height));
  return bySize?.id ?? 'custom-truck';
}

export function cloneTruckSpec(preset: TruckPreset): ContainerSpec | undefined {
  return preset.spec ? { ...preset.spec } : undefined;
}
