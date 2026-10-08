import type { RulesContext, LoadingRuleset } from './loadingRuleset';
import type { Orientation, Dims } from './loadSimA/types';
/** Explicit numerical scenarios never amend equipment ratings or certify transport. */
export type LimitReviewConfig = {
  mode: 'what-if';
  maxPayloadKg?: number;
  floorLoadLimitKgPerM2?: number;
  minimumSupportRatio?: number;
  cargoLimits?: Record<string, { maxStackLayers?: number; maxTopLoadKg?: number }>;
  simulation?: { maxDisplacementMm?: number; maxRotationDeg?: number };
};
export type LimitReviewMetric = {
  key: 'payload' | 'floor-load' | 'support' | 'stack-layers' | 'top-load' | 'displacement' | 'rotation';
  cargoId?: string;
  unit: 'kg' | 'kg/m²' | 'ratio' | 'layers' | 'mm' | 'deg';
  originalLimit: number | null;
  scenarioLimit: number;
  actual: number;
  excess: number | null;
  excessPercent: number | null;
  provenance: 'configured' | 'app-default' | 'unverified' | 'unknown';
  direction: 'maximum' | 'minimum';
};
export type LimitReviewMetadata = {
  mode: 'what-if';
  label: 'WHAT-IF REVIEW';
  status: 'active' | 'invalid' | 'unsupported';
  config: LimitReviewConfig;
  metrics: LimitReviewMetric[];
  errors: string[];
};
export type ContainerSpec = {
  limitReview?: LimitReviewConfig;
  /** Independent from the optimization objective. Omitted preserves historical behavior. */
  unloadingPolicy?: 'strict' | 'soft';
  palletDestination?: {
    transport: 'domestic' | 'export';
    region: 'europe' | 'north-america' | 'asia' | 'other';
    requiredSize: '' | '1100x1100' | '1200x1000' | '1200x800' | '1219x1016';
  };
  rules?: RulesContext;
  length: number;
  width: number;
  height: number;
  maxPayloadKg: number;
  /** 컨테이너/운영 기준 바닥 허용하중. 미입력 시 1,500 kg/m²를 사용한다. */
  floorLoadLimitKgPerM2?: number;
  /** 평균 바닥하중 대비 국부하중 경고 배수. 미입력 시 3배를 사용한다. */
  floorLoadWarningMultiplier?: number;
  /** 함께 실을 수 없는 `segregationClass` 쌍. 위반은 판정 오류(INCOMPATIBLE_CARGO)이며 배치를 막지는 않는다. */
  incompatiblePairs?: Array<[string, string]>;
  /** 길이·폭 절반 한쪽의 중량 비율 경고 기준(0.5 이상 1 미만). 미입력 시 0.6. 경고 전용이며 배치를 바꾸지 않는다. */
  halfWeightWarningRatio?: number;
  /** Capacity compactness is disabled above this payload-utilization / volume-utilization ratio. */
  weightLimitedBalanceRatio?: number;
};

export type CargoItem = {
  /** Explicit instruction for MIXED only; omitted keeps automatic tail conversion. */
  mixedLoadingMethod?: 'pallet' | 'direct';
  allowedOrientations?: Orientation[];
  thisSideUp?: boolean;
  cgOffsetMm?: Dims;
  friction?: number;
  maxTopPressureKgPerM2?: number;
  segregationClass?: string;
  tempZone?: string;
  id: string;
  name: string;
  length: number;
  width: number;
  height: number;
  weightKg: number;
  quantity: number;
  maxStackLayers?: number;
  maxTopLoadKg?: number;
  /** Box management explicitly saved this limit; zero must never be treated as a legacy default. */
  topLoadLimitExplicit?: boolean;
  /** Strength is not measured; operational loading remains one layer/no top load. */
  strengthUnverified?: boolean;
  /** Provenance only; changing either limit invalidates this recorded explanation. */
  stackLimitOrigin?: {
    kind: 'unverified-carton' | 'direct-product' | 'box-catalog';
    maxStackLayers?: number;
    maxTopLoadKg?: number;
  };
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
  unitId?: string;
  orientation?: Orientation;
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

export type VoidFillKind = 'side-gap' | 'door-face' | 'height-step' | 'row-gap' | 'top-void';
export type VoidFillMaterial = 'dunnage-airbag' | 'paper-honeycomb' | 'load-bar' | 'unresolved';
export type VoidFill = {
  id: string;
  kind: VoidFillKind;
  material: VoidFillMaterial;
  quantity: number;
  weightKg: number;
  fixedSupportEligible: boolean;
  gapM: number;
  voidVolumeM3: number;
  x: number;
  y: number;
  z: number;
  length: number;
  width: number;
  height: number;
};
export type VoidFillPlan = {
  fills: VoidFill[];
  sideGapM: number;
  rearGapM: number;
  volumeM3: number;
  weightKg: number;
  unresolvedCount: number;
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
  limitReview?: LimitReviewMetadata;
  /** Planning budget only; this does not assert physics certification. */
  securingBudget?: { level: 1 | 2 | 3; reservedWeightKg: number; requiredWeightKg: number; totalTransportWeightKg: number };
  /** Actual direct-box gap plan used for payload, 3D, exports and restore. Planning data only, not a material rating. */
  voidFillPlan?: VoidFillPlan;
  ruleset?: LoadingRuleset;
  placements: Placement[];
  remaining: Array<{ cargoId: string; quantity: number; reason: string; reasonCode?: string }>;
  loadedWeightKg: number;
  usedVolumeM3: number;
  validationIssues: ValidationIssue[];
  /** 외부 load-sim 규칙 모듈을 현재 m/kg 모델에 맞춰 적용한 운영 검증 결과. */
  operationalFindings?: OperationalRuleFinding[];
  /** 적재 완료 후 자동 형상 보정이 실제 수행된 경우의 이력. */
  autoCorrections?: AutoCorrectionRecord[];
};
