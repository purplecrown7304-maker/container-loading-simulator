import type { TransportEquipment } from './transportEquipment';

const porter = 'https://www.hyundai.com/contents/repn-car/catalog/porter2-special-catalog.pdf';
const mighty = 'https://www.hyundai.com/ccontents/carmng/CP00000003/mighty-2026-05-catalog.pdf';
const pavise = 'https://www.hyundai.com/ccontents/carmng/CP00000304/pavise-2026-01-price.pdf';
const floorNote = '바닥하중은 적재중량÷바닥면적을 10kg/m² 단위로 올린 임시 유도값입니다. 실제 바닥 강도·국부 하중과 등록증은 실차 값으로 확인·편집하세요.';
function truck(values: Omit<TransportEquipment, 'category' | 'floorLoadLimitKgPerM2' | 'volumeM3'>): TransportEquipment {
  return { ...values, category: 'truck', floorLoadLimitKgPerM2: Math.ceil(values.maxPayloadKg / (values.length * values.width) / 10) * 10,
    volumeM3: values.length * values.width * values.height, note: `${values.note ?? '제조사 대표 완성 특장 사양. 내부 치수와 화물 적재중량이며 차량 전체 치수·총중량이 아닙니다.'} ${floorNote}` };
}

/** Factory completed bodies, checked 2026-10-09. Tonnage is payload, not GVW.
 * A different body/cab/wheelbase requires its own registration, not extrapolation. */
export const DOMESTIC_TRUCK_EQUIPMENT: TransportEquipment[] = [
  truck({ id: 'kr-1t-box', name: '1톤 내장탑차', shortName: '1톤 내장탑', geometry: 'isotherm-truck', length: 2.83, width: 1.67, height: 1.58, maxPayloadKg: 1000, vehicleProfile: 'small', sourceLabel: '현대 포터 II 특장 · 슈퍼캡 내장탑', sourceUrl: `${porter}#page=34` }),
  truck({ id: 'kr-2.5t-wing', name: '2.5톤 윙바디', shortName: '2.5톤 윙바디', geometry: 'curtain', length: 5, width: 2.15, height: 2.015, maxPayloadKg: 2500, sideLoading: true, vehicleProfile: 'medium', sourceLabel: '현대 마이티 특장 · 8톤 GVW 장축 고상 윙바디', sourceUrl: `${mighty}#page=32` }),
  truck({ id: 'kr-2.4t-box', name: '2.5톤급 내장탑 (허용 2.4톤)', shortName: '2.4톤 내장탑', geometry: 'isotherm-truck', length: 4.33, width: 1.96, height: 1.85, maxPayloadKg: 2400, vehicleProfile: 'medium', sourceLabel: '현대 마이티 특장 · 7.5톤 GVW 장축 고상 내장탑', sourceUrl: `${mighty}#page=31` }),
  truck({ id: 'kr-5.5t-wing', name: '5톤급 윙바디 (허용 5.5톤)', shortName: '5.5톤 윙바디', geometry: 'curtain', length: 7.82, width: 2.4, height: 2.56, maxPayloadKg: 5500, sideLoading: true, vehicleProfile: 'heavy', sourceLabel: '현대 파비스 · 초장축플러스 7.0 윙바디', sourceUrl: `${pavise}#page=9` }),
  truck({ id: 'kr-7t-wing', name: '7톤 후2축 윙바디', shortName: '7톤 후2축 윙바디', geometry: 'curtain', length: 9.2, width: 2.4, height: 2.6, maxPayloadKg: 7000, sideLoading: true, vehicleProfile: 'heavy-tandem', sourceLabel: '현대 파비스 · 8.3 경량화 윙바디 후2축', sourceUrl: `${pavise}#page=9` }),
  // No unverified 11/14/25t body or GVW masquerading as a payload preset.
  // The known Fuel Cell body is an editable dimensional reference only.
  { id: 'custom-heavy-truck', category: 'truck', name: '대형 윙바디 · 실차 등록', shortName: '대형 실차 등록', geometry: 'curtain', length: 10.02, width: 2.4, height: 2.48, maxPayloadKg: 0, floorLoadLimitKgPerM2: 0, vehicleProfile: 'heavy-tandem', sideLoading: true, requiresSpecification: true, sourceLabel: '엑시언트 Fuel Cell 내측 참고 · 허용중량 미확인', sourceUrl: 'https://www.hyundai.com/ccontents/carmng/CP00000307/xcient-fuel-cell-Catalog.pdf#page=16', note: '11·14·25톤 특장차는 차체에 따라 다릅니다. 실차 내측 치수, 등록증 적재중량과 바닥하중을 입력한 뒤 적용하세요. 참고 치수는 10.02×2.40×2.48m이며 총중량 28톤을 적재중량으로 사용하지 않습니다.' },
  truck({ id: 'custom-truck', name: '사용자 트럭 · 실차 규격', shortName: 'Custom Truck', geometry: 'custom', length: 2.83, width: 1.67, height: 1.58, maxPayloadKg: 1000, sourceLabel: '사용자 입력값', note: '초기 입력은 1톤 내장탑 참고값입니다. 실차 제원으로 수정하세요.' }),
];
