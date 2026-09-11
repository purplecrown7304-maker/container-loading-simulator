export type ContainerSpec = {
  length: number;
  width: number;
  height: number;
  maxPayloadKg: number;
  /** 컨테이너/운영 기준 바닥 허용하중. 미입력 시 1,500 kg/m²를 사용한다. */
  floorLoadLimitKgPerM2?: number;
  /** 평균 바닥하중 대비 국부하중 경고 배수. 미입력 시 3배를 사용한다. */
  floorLoadWarningMultiplier?: number;
  /** 트럭 적재공간 x=0 기준 앞축 작용점. 실제 차량 제원이 있을 때만 입력한다. */
  frontAxleX?: number;
  /** 트럭 적재공간 x=0 기준 뒤축 작용점. 실제 차량 제원이 있을 때만 입력한다. */
  rearAxleX?: number;
  /** 앞축 허용하중. 차체 자체 중량을 포함한 법정 축중이 아니라 적재 시뮬레이션에서 사용할 명시적 제원. */
  frontAxleMaxKg?: number;
  /** 뒤축 허용하중. 실제 차량 제원이 없으면 생략한다. */
  rearAxleMaxKg?: number;
};

export type CargoItem = {
  id: string;
  name: string;
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
  /** 바닥면 기준 90도 회전 허용. 생략 시 허용으로 간주한다. */
  allowRotation?: boolean;
  /** 하역 순서. 1이 가장 먼저 하역되며 큰 숫자일수록 컨테이너 안쪽에 배치하는 것을 우선한다. */
  unloadPriority?: number;
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
};

export type ValidationIssue = {
  type: 'OUT_OF_BOUNDS' | 'COLLISION';
  message: string;
  placementIndexes: number[];
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
  /** 적재 완료 후 자동 형상 보정이 실제 수행된 경우의 이력. */
  autoCorrections?: AutoCorrectionRecord[];
};