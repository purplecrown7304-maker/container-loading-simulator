import type { ContainerSpec } from './engine/types';

export type ContainerPresetId =
  | '20-standard'
  | '20-high-cube'
  | '40-standard'
  | '40-high-cube'
  | '45-high-cube'
  | 'custom';

export type ContainerPreset = {
  id: ContainerPresetId;
  label: string;
  shortLabel: string;
  category: 'dry' | 'custom';
  spec?: ContainerSpec;
  note: string;
};

const commonFloor = {
  floorLoadLimitKgPerM2: 1500,
  floorLoadWarningMultiplier: 3,
  transportKind: 'container' as const,
  transportType: 'dry',
  sideWallModel: 'rigid' as const,
  roofModel: 'rigid' as const,
};

export const CONTAINER_PRESETS: ContainerPreset[] = [
  {
    id: '20-standard',
    label: "20' STANDARD",
    shortLabel: '20FT Standard',
    category: 'dry',
    spec: { length: 5.898, width: 2.352, height: 2.39, maxPayloadKg: 21750, ...commonFloor },
    note: '일반 Dry · 내부 약 5,898×2,352×2,390 mm',
  },
  {
    id: '20-high-cube',
    label: "20' HIGH-CUBE",
    shortLabel: '20FT High Cube',
    category: 'dry',
    spec: { length: 5.898, width: 2.352, height: 2.698, maxPayloadKg: 28180, ...commonFloor },
    note: '높이 여유가 큰 Dry 계열 · 실제 장비 사양 확인 권장',
  },
  {
    id: '40-standard',
    label: "40' STANDARD",
    shortLabel: '40FT Standard',
    category: 'dry',
    spec: { length: 12.032, width: 2.352, height: 2.39, maxPayloadKg: 26740, ...commonFloor },
    note: '일반 Dry · 내부 약 12,032×2,352×2,390 mm',
  },
  {
    id: '40-high-cube',
    label: "40' HIGH-CUBE",
    shortLabel: '40FT High Cube',
    category: 'dry',
    spec: { length: 12.032, width: 2.352, height: 2.698, maxPayloadKg: 26540, ...commonFloor },
    note: '현재 기본 규격 · 내부 높이 약 2,698 mm',
  },
  {
    id: '45-high-cube',
    label: "45' HIGH-CUBE",
    shortLabel: '45FT High Cube',
    category: 'dry',
    spec: { length: 13.556, width: 2.352, height: 2.698, maxPayloadKg: 25760, ...commonFloor },
    note: '장척 Dry 계열 · 실제 운송사 장비 사양 확인 권장',
  },
  {
    id: 'custom',
    label: 'CUSTOM CONTAINER',
    shortLabel: 'Custom Container',
    category: 'custom',
    note: '컨테이너 강체 벽 모델을 유지한 채 길이·폭·높이·최대중량 직접 입력',
  },
];

export const SPECIAL_CONTAINER_REFERENCES = [
  { id: 'open-top', label: 'OPEN TOP', icon: 'open-top', note: '천장 개방 형상 모델 필요' },
  { id: 'flat-rack', label: 'FLAT RACK', icon: 'flat-rack', note: '측벽·천장 없는 형상 모델 필요' },
  { id: 'reefer', label: 'REFRIGERATED', icon: 'reefer', note: '냉동기 돌출·통풍공간 모델 필요' },
  { id: 'platform', label: 'PLATFORM', icon: 'platform', note: '바닥 플랫폼 전용 구속조건 필요' },
  { id: 'tank', label: 'TANK', icon: 'tank', note: '박스/팔레트 적재 대상이 아니므로 별도 엔진 필요' },
] as const;

const near = (a: number, b: number) => Math.abs(a - b) < 0.015;

export function matchContainerPreset(container: ContainerSpec): ContainerPresetId {
  if (container.transportKind === 'truck') return 'custom';
  const match = CONTAINER_PRESETS.find(preset => preset.spec
    && near(container.length, preset.spec.length)
    && near(container.width, preset.spec.width)
    && near(container.height, preset.spec.height));
  return match?.id ?? 'custom';
}

export function clonePresetSpec(preset: ContainerPreset): ContainerSpec | undefined {
  return preset.spec ? { ...preset.spec } : undefined;
}
