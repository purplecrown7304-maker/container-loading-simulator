import { useSyncExternalStore } from 'react';

export type TransportCategory = 'container' | 'truck';
export type EquipmentGeometry =
  | 'closed'
  | 'open-top'
  | 'flat-rack'
  | 'platform'
  | 'reefer'
  | 'bulk'
  | 'tank'
  | 'curtain'
  | 'reefer-truck'
  | 'isotherm-truck'
  | 'mega-truck'
  | 'jumbo-truck'
  | 'custom';

export type TransportEquipment = {
  id: string;
  category: TransportCategory;
  name: string;
  shortName: string;
  geometry: EquipmentGeometry;
  length: number;
  width: number;
  height: number;
  maxPayloadKg: number;
  floorLoadLimitKgPerM2: number;
  doorWidth?: number;
  doorHeight?: number;
  volumeM3?: number;
  sideLoading?: boolean;
  topLoading?: boolean;
  temperatureControlled?: boolean;
  specializedCargo?: boolean;
  sourceLabel: string;
  note?: string;
};

const containerSource = 'Hapag-Lloyd / Maersk 대표 장비값';
const truckSource = 'DSV / 국제 도로운송 대표 장비값';

export const CONTAINER_EQUIPMENT: TransportEquipment[] = [
  { id: '20-standard', category: 'container', name: "20' STANDARD", shortName: '20FT Standard', geometry: 'closed', length: 5.9, width: 2.352, height: 2.395, maxPayloadKg: 28130, floorLoadLimitKgPerM2: 1500, doorWidth: 2.34, doorHeight: 2.292, volumeM3: 33.2, sourceLabel: containerSource },
  { id: '40-standard', category: 'container', name: "40' STANDARD", shortName: '40FT Standard', geometry: 'closed', length: 12.032, width: 2.352, height: 2.395, maxPayloadKg: 28750, floorLoadLimitKgPerM2: 1500, doorWidth: 2.34, doorHeight: 2.292, volumeM3: 67.7, sourceLabel: containerSource },
  { id: '40-high-cube', category: 'container', name: "40' HIGH-CUBE", shortName: '40FT High Cube', geometry: 'closed', length: 12.032, width: 2.35, height: 2.7, maxPayloadKg: 28600, floorLoadLimitKgPerM2: 1500, doorWidth: 2.34, doorHeight: 2.597, volumeM3: 76.3, sourceLabel: containerSource },
  { id: '45-high-cube', category: 'container', name: "45' HIGH-CUBE", shortName: '45FT High Cube', geometry: 'closed', length: 13.556, width: 2.352, height: 2.7, maxPayloadKg: 27700, floorLoadLimitKgPerM2: 1500, doorWidth: 2.34, doorHeight: 2.597, volumeM3: 86, sourceLabel: containerSource },
  { id: '20-open-top', category: 'container', name: "20' OPEN TOP", shortName: '20FT Open Top', geometry: 'open-top', length: 5.895, width: 2.35, height: 2.34, maxPayloadKg: 30050, floorLoadLimitKgPerM2: 1500, doorWidth: 2.338, doorHeight: 2.28, volumeM3: 32.5, topLoading: true, sourceLabel: containerSource, note: '천장 개방형. 기본 계산은 등록된 내부 높이를 안전 한계로 사용합니다.' },
  { id: '40-open-top', category: 'container', name: "40' OPEN TOP", shortName: '40FT Open Top', geometry: 'open-top', length: 12.029, width: 2.35, height: 2.344, maxPayloadKg: 28450, floorLoadLimitKgPerM2: 1500, doorWidth: 2.34, doorHeight: 2.276, volumeM3: 66.8, topLoading: true, sourceLabel: containerSource, note: '천장 개방형. OOG 초과높이는 실제 운송조건 확인 후 사용자 규격으로 조정하세요.' },
  { id: '20-flatrack', category: 'container', name: "20' FLATRACK", shortName: '20FT Flatrack', geometry: 'flat-rack', length: 5.638, width: 2.438, height: 2.233, maxPayloadKg: 42100, floorLoadLimitKgPerM2: 2000, topLoading: true, sideLoading: true, sourceLabel: containerSource, note: '측면/상부 개방. 시뮬레이터는 안전상 입력 폭·높이를 기본 적재 한계로 사용합니다.' },
  { id: '40-flatrack', category: 'container', name: "40' FLATRACK", shortName: '40FT Flatrack', geometry: 'flat-rack', length: 11.652, width: 2.347, height: 2.265, maxPayloadKg: 49100, floorLoadLimitKgPerM2: 2000, topLoading: true, sideLoading: true, sourceLabel: containerSource, note: '측면/상부 개방. OOG 화물은 실제 승인치수로 사용자 규격을 입력하세요.' },
  { id: '20-flatrack-collapsible', category: 'container', name: "20' FLATRACK COLLAPSIBLE", shortName: '20FT Flatrack Collapsible', geometry: 'flat-rack', length: 6.058, width: 2.438, height: 2.6, maxPayloadKg: 42100, floorLoadLimitKgPerM2: 2000, topLoading: true, sideLoading: true, sourceLabel: containerSource, note: '접이식 엔드월. 적재 높이는 보수적 작업 한계값이며 실제 장비 승인값으로 수정 가능합니다.' },
  { id: '40-flatrack-collapsible', category: 'container', name: "40' FLATRACK COLLAPSIBLE", shortName: '40FT Flatrack Collapsible', geometry: 'flat-rack', length: 12.192, width: 2.245, height: 2.7, maxPayloadKg: 49100, floorLoadLimitKgPerM2: 2000, topLoading: true, sideLoading: true, sourceLabel: containerSource },
  { id: '20-platform', category: 'container', name: "20' PLATFORM", shortName: '20FT Platform', geometry: 'platform', length: 6.058, width: 2.438, height: 2.7, maxPayloadKg: 42100, floorLoadLimitKgPerM2: 2200, topLoading: true, sideLoading: true, sourceLabel: containerSource, note: '벽/천장 없음. 입력 높이는 시뮬레이션 작업 한계입니다.' },
  { id: '40-platform', category: 'container', name: "40' PLATFORM", shortName: '40FT Platform', geometry: 'platform', length: 12.192, width: 2.245, height: 2.7, maxPayloadKg: 49100, floorLoadLimitKgPerM2: 2200, topLoading: true, sideLoading: true, sourceLabel: containerSource },
  { id: '20-reefer', category: 'container', name: "20' REFRIGERATED", shortName: '20FT Reefer', geometry: 'reefer', length: 5.45, width: 2.28, height: 2.159, maxPayloadKg: 29140, floorLoadLimitKgPerM2: 1500, doorWidth: 2.29, doorHeight: 2.264, volumeM3: 28.1, temperatureControlled: true, sourceLabel: containerSource },
  { id: '40-reefer', category: 'container', name: "40' REFRIGERATED", shortName: '40FT Reefer High Cube', geometry: 'reefer', length: 11.599, width: 2.29, height: 2.425, maxPayloadKg: 29580, floorLoadLimitKgPerM2: 1500, doorWidth: 2.29, doorHeight: 2.557, volumeM3: 67.7, temperatureControlled: true, sourceLabel: containerSource },
  { id: '20-bulk', category: 'container', name: "20' BULK", shortName: '20FT Bulk', geometry: 'bulk', length: 5.9, width: 2.35, height: 2.39, maxPayloadKg: 28000, floorLoadLimitKgPerM2: 1500, specializedCargo: true, sourceLabel: 'ISO 20FT 대표 외형값', note: '벌크 전용 장비입니다. 박스 적재 결과는 참고용으로만 사용하세요.' },
  { id: '20-tank', category: 'container', name: "20' TANK", shortName: '20FT Tank', geometry: 'tank', length: 5.9, width: 2.35, height: 2.39, maxPayloadKg: 26000, floorLoadLimitKgPerM2: 1500, specializedCargo: true, sourceLabel: 'ISO 20FT 탱크 프레임 대표값', note: '액체/가스 탱크 전용 장비로 박스 적재 대상이 아닙니다.' },
  { id: 'custom-container', category: 'container', name: 'CUSTOM CONTAINER', shortName: 'Custom Container', geometry: 'custom', length: 12.032, width: 2.35, height: 2.7, maxPayloadKg: 28600, floorLoadLimitKgPerM2: 1500, sourceLabel: '사용자 입력값' },
];

export const TRUCK_EQUIPMENT: TransportEquipment[] = [
  { id: 'tautliner', category: 'truck', name: 'TAUTLINER (CURTAINSIDER)', shortName: 'Tautliner / Curtainsider', geometry: 'curtain', length: 13.62, width: 2.48, height: 2.7, maxPayloadKg: 32800, floorLoadLimitKgPerM2: 1700, doorWidth: 2.45, doorHeight: 2.67, volumeM3: 91, sideLoading: true, sourceLabel: truckSource, note: '측면 커튼 개방 적재 가능. 제조사·국가 규정에 따라 제원이 달라질 수 있습니다.' },
  { id: 'refrigerated-truck', category: 'truck', name: 'REFRIGERATED TRUCK', shortName: 'Refrigerated Truck', geometry: 'reefer-truck', length: 13.31, width: 2.48, height: 2.6, maxPayloadKg: 31000, floorLoadLimitKgPerM2: 1700, doorWidth: 2.46, doorHeight: 2.6, volumeM3: 85, temperatureControlled: true, sourceLabel: truckSource },
  { id: 'isotherm-truck', category: 'truck', name: 'ISOTHERM TRUCK', shortName: 'Isotherm Truck', geometry: 'isotherm-truck', length: 13.31, width: 2.48, height: 2.6, maxPayloadKg: 30000, floorLoadLimitKgPerM2: 1700, doorWidth: 2.46, doorHeight: 2.6, volumeM3: 85, sourceLabel: '냉장 트레일러 대표 내측치수 기반', note: '단열차량 대표값입니다. 실제 차량 등록증/제조사 제원으로 수정하세요.' },
  { id: 'mega-trailer', category: 'truck', name: 'MEGA-TRAILER', shortName: 'Mega Trailer', geometry: 'mega-truck', length: 13.62, width: 2.48, height: 2.94, maxPayloadKg: 32800, floorLoadLimitKgPerM2: 1700, doorWidth: 2.45, doorHeight: 2.9, volumeM3: 100, sideLoading: true, topLoading: true, sourceLabel: truckSource },
  { id: 'jumbo', category: 'truck', name: 'JUMBO', shortName: 'Jumbo 120m³', geometry: 'jumbo-truck', length: 15.4, width: 2.48, height: 3, maxPayloadKg: 23000, floorLoadLimitKgPerM2: 1600, volumeM3: 120, sideLoading: true, topLoading: true, sourceLabel: '유럽 Jumbo 120m³ 대표값', note: '7.7m + 7.7m 조합형 대표 적재공간을 하나의 연속 공간으로 근사합니다.' },
  { id: 'custom-truck', category: 'truck', name: 'CUSTOM TRUCK', shortName: 'Custom Truck', geometry: 'custom', length: 13.62, width: 2.48, height: 2.7, maxPayloadKg: 28000, floorLoadLimitKgPerM2: 1700, sourceLabel: '사용자 입력값' },
];

export const TRANSPORT_EQUIPMENT = [...CONTAINER_EQUIPMENT, ...TRUCK_EQUIPMENT];
export const TRANSPORT_EQUIPMENT_EVENT = 'container-loading:transport-equipment-updated';
export const OPEN_TRANSPORT_SELECTOR_EVENT = 'container-loading:open-transport-selector';
const STORAGE_KEY = 'container-loading:transport-equipment-v1';

let selected: TransportEquipment = TRANSPORT_EQUIPMENT.find(item => item.id === '40-high-cube')!;
let loadedFromStorage = false;
const listeners = new Set<() => void>();

function clone(value: TransportEquipment): TransportEquipment { return { ...value }; }

function loadStored() {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as TransportEquipment;
    if (parsed && typeof parsed.id === 'string' && Number.isFinite(parsed.length) && Number.isFinite(parsed.width) && Number.isFinite(parsed.height) && Number.isFinite(parsed.maxPayloadKg)) {
      selected = parsed;
      loadedFromStorage = true;
    }
  } catch { /* ignore malformed legacy value */ }
}
loadStored();

function emit() {
  listeners.forEach(listener => listener());
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<TransportEquipment>(TRANSPORT_EQUIPMENT_EVENT, { detail: clone(selected) }));
}

export function readTransportEquipment() { return selected; }
export function hasStoredTransportEquipment() { return loadedFromStorage; }
export function subscribeTransportEquipment(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }
export function useTransportEquipment() { return useSyncExternalStore(subscribeTransportEquipment, readTransportEquipment, readTransportEquipment); }

export function selectTransportEquipment(value: TransportEquipment) {
  selected = clone(value);
  loadedFromStorage = true;
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selected));
  emit();
}

export function getTransportEquipment(id: string) { return TRANSPORT_EQUIPMENT.find(item => item.id === id); }

export function findMatchingEquipment(length: number, width: number, height: number, maxPayloadKg: number, tolerance = 0.012) {
  return TRANSPORT_EQUIPMENT.find(item => !item.id.startsWith('custom-')
    && Math.abs(item.length - length) <= tolerance
    && Math.abs(item.width - width) <= tolerance
    && Math.abs(item.height - height) <= tolerance
    && Math.abs(item.maxPayloadKg - maxPayloadKg) <= Math.max(50, item.maxPayloadKg * 0.01));
}

export function createCustomEquipment(category: TransportCategory, values: Pick<TransportEquipment, 'length' | 'width' | 'height' | 'maxPayloadKg' | 'floorLoadLimitKgPerM2'>): TransportEquipment {
  return {
    id: category === 'container' ? 'custom-container' : 'custom-truck',
    category,
    name: category === 'container' ? 'CUSTOM CONTAINER' : 'CUSTOM TRUCK',
    shortName: category === 'container' ? 'Custom Container' : 'Custom Truck',
    geometry: 'custom',
    ...values,
    sourceLabel: '사용자 입력값',
  };
}
