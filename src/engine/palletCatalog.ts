import { defaultPalletSpec, type PalletSpec } from './palletPacking';

export type PalletMaterial = 'wood' | 'plastic';
export type PalletForkEntry = 2 | 4;

/**
 * One pallet product the loader can choose. Load values are representative published
 * figures for the class, not a certificate: the operator confirms the maker's sheet.
 * `maxLoadKg` is the dynamic (forklift/handling) capacity the loading engine enforces;
 * `staticLoadKg` is shown for reference only.
 */
export type PalletType = {
  id: string;
  name: string;
  standard: string;
  material: PalletMaterial;
  length: number;
  width: number;
  height: number;
  tareWeightKg: number;
  maxLoadKg: number;
  /** Static (stacked, at rest) load; null when the source gives none. */
  staticLoadKg: number | null;
  forkEntry: PalletForkEntry;
  note: string;
};

// Source: 대표 제공 표 "표준 규격별 L×W×T" (2026-09-29, 네이버 블로그 ljhoon1023/222489007909
// 발췌). Where the table gives a range the conservative end is used: the heavier tare and
// the lower load. A static load shown as "—" is recorded as null.
export const PALLET_CATALOG: readonly PalletType[] = [
  {
    // 대표 결정 2026-09-29 (#88): the company's own pallet carries 1,500 kg of cargo.
    id: 'company-default', name: '사내 기본 T11 (허용 1,500kg)', standard: '대표 지정 사내 기본 파렛트 · 1100×1100', material: 'wood',
    length: defaultPalletSpec.length, width: defaultPalletSpec.width, height: defaultPalletSpec.height,
    tareWeightKg: defaultPalletSpec.tareWeightKg, maxLoadKg: defaultPalletSpec.maxLoadKg, staticLoadKg: null, forkEntry: 4,
    note: '현장에서 실제로 쓰는 파렛트의 허용중량(1,500kg)을 기준으로 한 기본값입니다.',
  },
  {
    id: 't11-plastic', name: 'T11 플라스틱 (일반용)', standard: 'KS T 1002 · 1100×1100 국내 표준', material: 'plastic',
    length: 1.1, width: 1.1, height: 0.15, tareWeightKg: 25, maxLoadKg: 1000, staticLoadKg: 3000, forkEntry: 4,
    note: '국내 유통·제조 기본 규격. 반복 사용하며 목재 검역이 필요 없습니다.',
  },
  {
    id: 't11-plastic-export', name: 'T11 플라스틱 (수출용 경량)', standard: '1100×1100 · 수출용 경량', material: 'plastic',
    length: 1.1, width: 1.1, height: 0.12, tareWeightKg: 6, maxLoadKg: 1000, staticLoadKg: 1000, forkEntry: 4,
    note: '자중이 가장 가볍고 높이가 낮아 운임 중량과 높이를 줄입니다. 정하중이 낮아 파렛트 위 적층에 주의하세요.',
  },
  {
    id: 't11-wood', name: 'T11 목재', standard: 'KS T 1002 · 1100×1100 국내 표준', material: 'wood',
    length: 1.1, width: 1.1, height: 0.15, tareWeightKg: 40, maxLoadKg: 1000, staticLoadKg: 1700, forkEntry: 4,
    note: '국내 표준 목재. 수출 시 열처리(ISPM 15) 표시가 필요합니다.',
  },
  {
    id: 't12-plastic', name: 'T12 플라스틱 (일반용)', standard: 'KS T 1002 · ISO 6780 1200×1000', material: 'plastic',
    length: 1.2, width: 1.0, height: 0.15, tareWeightKg: 19, maxLoadKg: 1000, staticLoadKg: 3000, forkEntry: 4,
    note: '유럽·아시아 창고 규격과 호환되는 플라스틱 파렛트.',
  },
  {
    id: 't12-wood-epal3', name: 'T12 목재 (EPAL 3)', standard: 'EPAL 3 · 1200×1000', material: 'wood',
    length: 1.2, width: 1.0, height: 0.144, tareWeightKg: 30, maxLoadKg: 1500, staticLoadKg: null, forkEntry: 4,
    note: '유럽 표준 1200×1000 목재. 동하중이 높아 무거운 화물에 유리합니다.',
  },
  {
    id: 't12-wood-epal2', name: 'T12 목재 (EPAL 2)', standard: 'EPAL 2 · 1200×1000', material: 'wood',
    length: 1.2, width: 1.0, height: 0.162, tareWeightKg: 35, maxLoadKg: 1250, staticLoadKg: null, forkEntry: 4,
    note: '화학·산업재에 쓰는 보강형 1200×1000 목재.',
  },
  {
    id: 'eur-epal1', name: '유로 EPAL 1', standard: 'EPAL 1 · ISO 6780 1200×800', material: 'wood',
    length: 1.2, width: 0.8, height: 0.144, tareWeightKg: 25, maxLoadKg: 1500, staticLoadKg: 4000, forkEntry: 4,
    note: '유럽 유통·식품 물류 표준 유로 파렛트.',
  },
  {
    id: 'eur-epal6', name: '유로 하프 EPAL 6', standard: 'EPAL 6 · 800×600', material: 'wood',
    length: 0.8, width: 0.6, height: 0.145, tareWeightKg: 9.5, maxLoadKg: 500, staticLoadKg: 1500, forkEntry: 4,
    note: '소량·매장 진열용 하프 파렛트. 가벼운 화물에만 적합합니다.',
  },
  {
    id: 'gma-48x40', name: '미국 GMA (48×40인치)', standard: 'ISO 6780 1219×1016 · 북미 표준', material: 'wood',
    length: 1.219, width: 1.016, height: 0.14, tareWeightKg: 30, maxLoadKg: 1200, staticLoadKg: 2500, forkEntry: 2,
    note: '북미 수출용. 스트링거형이라 포크가 두 방향으로만 들어갑니다.',
  },
];

export function findPalletType(id: string | null | undefined) {
  return PALLET_CATALOG.find(type => type.id === id) ?? null;
}

/**
 * Pallet product fields replace footprint/tare/load; job-level settings such as stack
 * levels, top-load and packaging stay as configured.
 */
export function palletSpecForType(type: PalletType, base: PalletSpec = defaultPalletSpec): PalletSpec {
  return {
    ...base,
    material: type.material,
    length: type.length,
    width: type.width,
    height: type.height,
    tareWeightKg: type.tareWeightKg,
    maxLoadKg: type.maxLoadKg,
  };
}

export function palletMaterialLabel(material: PalletMaterial) {
  return material === 'wood' ? '목재' : '플라스틱';
}
