export type ContainerSpec = {
  length: number;
  width: number;
  height: number;
  maxPayloadKg: number;
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
  /** 바닥면 기준 90도 회전 허용. 생략 시 허용으로 간주한다. */
  allowRotation?: boolean;
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
