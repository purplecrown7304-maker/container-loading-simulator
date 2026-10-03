export type ContainerSpec = {
  length: number;
  width: number;
  height: number;
  maxPayloadKg: number;
  /** 컨테이너/운영 기준 바닥 허용하중. 미입력 시 1,500 kg/m²를 사용한다. */
  floorLoadLimitKgPerM2?: number;
  /** 평균 바닥하중 대비 국부하중 경고 배수. 미입력 시 3배를 사용한다. */
  floorLoadWarningMultiplier?: number;
};

export type CargoType = 'carton' | 'pallet' | 'drum' | 'bag' | 'roll' | 'long' | 'machine';
export type CargoOrientation = 'LWH' | 'WLH' | 'LHW' | 'HLW' | 'WHL' | 'HWL';

export type CargoItem = {
  id: string;
  name: string;
  /** load-sim 규칙의 화물 유형. 기존 데이터는 carton으로 마이그레이션한다. */
  cargoType?: CargoType;
  length: number;
  width: number;
  height: number;
  weightKg: number;
  quantity: number;
  maxStackLayers?: number;
  maxTopLoadKg?: number;
  /** 사용자 목록/엑셀 등록 시 부여되는 화면 표시용 고유 색상. */
  displayColor?: string;
  /** 제품 포장 흐름에서 생성된 화물의 원 제품 코드. */
  productId?: string;
  /** 제품 포장 흐름에서 생성된 화물의 원 제품명. */
  productName?: string;
  /** 제품 포장 단계에서 확정된 박스 마스터 코드. 직접 적재면 생략한다. */
  boxId?: string;
  /** 제품 포장 단계에서 확정된 박스명. */
  boxName?: string;
  /** 이 적재단위(박스/직접적재) 1개 안에 실제 들어 있는 제품 EA. */
  unitsPerPackage?: number;
  /** 박스 자중을 제외한, 이 적재단위 안 제품들의 실제 총중량. */
  contentWeightKg?: number;
  /** 바닥면 기준 회전 허용. cargoType/thisSideUp 규칙과 함께 적용한다. */
  allowRotation?: boolean;
  /** 천지무용. true면 수직축 회전(LWH/WLH)만 허용한다. */
  thisSideUp?: boolean;
  /** false면 다른 화물 위에 놓을 수 없다. */
  canBePlacedOnTop?: boolean;
  /** 바닥면 마찰계수. 생략 시 0.45. */
  friction?: number;
  segregationClass?: string;
  tempZone?: string;
  /** 하역 순서. 1이 가장 먼저 하역되며 큰 숫자일수록 컨테이너 안쪽에 배치하는 것을 우선한다. */
  unloadPriority?: number;
  /** 내부 최적화에서 이 적재단위 1개가 대표하는 실제 출하 EA. 일반 박스는 1. */
  demandUnits?: number;
  /** 팔레트 같은 강체 단위가 반드시 바닥에 놓여야 할 때 사용한다. */
  floorOnly?: boolean;
  /** MIXED 엔진 내부 적재단위 종류. 일반 입력에서는 생략한다. */
  unitKind?: 'box' | 'pallet';
  /** MIXED 팔레트 단위가 원래 어느 팔레트였는지 추적하기 위한 내부 메타데이터. */
  sourcePalletIndex?: number;
};

export type Placement = {
  cargoId: string;
  x: number;
  y: number;
  z: number;
  length: number;
  width: number;
  height: number;
  weightKg: number;
  /** 원래 길이/폭 대비 90도 회전되어 배치됐는지 여부 */
  rotated?: boolean;
  /** load-sim 6방향 회전 표기. 없으면 기존 rotated 값에서 LWH/WLH로 해석한다. */
  orientation?: CargoOrientation;
};

export type ValidationIssue = {
  type: 'OUT_OF_BOUNDS' | 'COLLISION' | 'INVALID_CARGO' | 'UNSUPPORTED' | 'QUANTITY' | 'STACK_LIMIT' | 'TOP_LOAD' | 'PAYLOAD';
  message: string;
  placementIndexes: number[];
};

export type OperationalRuleFinding = {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  placementIndexes: number[];
  value?: number;
  limit?: number;
};

export type AutoCorrectionRecord = {
  kind: 'SHAPE' | 'LOW_ROW' | 'ZONE_HEIGHT';
  label: string;
  description: string;
  cargoId?: string;
  from?: { x: number; y: number; z: number };
  to?: { x: number; y: number; z: number };
  beforeScore?: number;
  afterScore?: number;
};

export type LoadingResult = {
  placements: Placement[];
  remaining: Array<{ cargoId: string; quantity: number; reason: string }>;
  loadedWeightKg: number;
  usedVolumeM3: number;
  validationIssues: ValidationIssue[];
  /** 외부 load-sim 규칙 모듈을 현재 m/kg 모델에 맞춰 적용한 운영 검증 결과. */
  operationalFindings?: OperationalRuleFinding[];
  /** 적재 완료 후 자동 형상 보정이 실제 수행된 경우의 이력. */
  autoCorrections?: AutoCorrectionRecord[];
};
