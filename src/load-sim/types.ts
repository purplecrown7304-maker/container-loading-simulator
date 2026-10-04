// 적재 시뮬레이터 공통 타입
// 단위: 길이 mm, 중량 kg. 좌표계: 원점 = 앞벽·좌측·바닥 모서리,
// X = 길이(앞벽 → 도어), Y = 폭(좌 → 우), Z = 높이.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Dims {
  l: number;
  w: number;
  h: number;
}

export type ItemType = 'carton' | 'pallet' | 'drum' | 'bag' | 'roll' | 'long' | 'machine';

/**
 * 회전. 세 글자는 차례로 X, Y, Z축에 놓이는 화물 치수(L/W/H)를 뜻한다.
 * 예: 'WLH' = 화물의 W가 X축, L이 Y축, H가 Z축 (수평 90도 회전).
 */
export type Orientation = 'LWH' | 'WLH' | 'LHW' | 'HLW' | 'WHL' | 'HWL';

export const ALL_ORIENTATIONS: Orientation[] = ['LWH', 'WLH', 'LHW', 'HLW', 'WHL', 'HWL'];
/** 천지무용(This side up): 수직축 회전만 허용 */
export const UPRIGHT_ORIENTATIONS: Orientation[] = ['LWH', 'WLH'];

export interface Item {
  id: string;
  type: ItemType;
  /** 외곽 치수 (파렛트 화물은 파렛트 포함) */
  dims: Dims;
  /** 총중량 (파렛트 화물은 파렛트 자중 포함) */
  weight: number;
  /** 허용 회전. 생략 시 thisSideUp 또는 type으로 결정 */
  allowedOrientations?: Orientation[];
  thisSideUp?: boolean;
  /** 이 화물 위에 올릴 수 있는 총 하중(kg). 생략 = 제한 없음, 0 = 상부 적재 금지 */
  maxTopLoad?: number;
  /** 이 화물 윗면의 허용 면압(kg/m²). 생략 = 검사 안 함 */
  maxTopPressure?: number;
  /** 이 화물이 놓일 수 있는 최대 단(1 = 바닥에만) */
  maxTier?: number;
  /** false면 다른 화물 위에 올릴 수 없음(바닥 전용) */
  canBePlacedOnTop?: boolean;
  /** 착지 순번. 작을수록 먼저 내림 */
  stopSeq?: number;
  groupId?: string;
  /** 혼적 그룹(위험물 등급 등). config.incompatiblePairs와 대조 */
  segregationClass?: string;
  tempZone?: string;
  /** 무게중심이 기하 중심에서 벗어난 정도. 화물 고유 좌표(L, W, H 방향) mm */
  cgOffset?: Dims;
  /** 바닥면 마찰계수. 생략 시 config.defaultFriction */
  friction?: number;
  /** 지게차로 적재하는지. 생략 시 pallet/machine/drum/roll은 true */
  forklift?: boolean;
}

export interface Placement {
  item: Item;
  /** 화물의 최소 좌표 모서리 */
  pos: Vec3;
  orientation: Orientation;
}

export type AccessSide = 'rear' | 'left' | 'right' | 'top';

export interface AxleModel {
  /** 전축(또는 킹핀) X좌표. 적재함 앞벽 기준이며 앞벽보다 앞이면 음수 */
  frontX: number;
  /** 후축(탠덤이면 축군 중심) X좌표 */
  rearX: number;
  /** 공차 상태 전축/후축군 하중 */
  emptyFront: number;
  emptyRear: number;
  /** 허용 하중. 후축은 축군 합계 */
  maxFront: number;
  maxRear: number;
  /** 후축군의 축 수 (법정 축하중 검사용) */
  rearAxleCount: number;
  /** 전축 축 수 */
  frontAxleCount?: number;
  /** 차량 총중량 한도 */
  maxGross: number;
}

export interface Space {
  id: string;
  kind: 'container' | 'truck';
  inner: Dims;
  /** 후방 도어 개구. 없으면 도어 검사 생략 */
  door?: { w: number; h: number };
  access: AccessSide[];
  maxPayload: number;
  tare: number;
  /** 바닥 허용 선하중 kg/m */
  floorLineLoad?: number;
  /** 적재 한계선 높이(리퍼 등) */
  heightLimit?: number;
  axles?: AxleModel;
}

export interface Accel {
  forward: number;
  rearward: number;
  sideways: number;
}

export interface Config {
  /** 최소 지지율 (0~1) */
  minSupportRatio: number;
  /** 같은 면으로 보는 높이 오차 mm */
  heightTolerance: number;
  /** 겹침·접촉 판정 오차 mm */
  epsilon: number;
  /** 적재 공간 안전 마진 mm */
  margins: Dims;
  /** 지게차 적재 화물의 상부 여유 mm */
  forkliftClearance: number;
  /** 무게중심 허용 편차(길이/폭 대비 비율) */
  cgLongTolerance: number;
  cgLatTolerance: number;
  /** 무게중심 높이 권장 한도(내부 높이 대비 비율) */
  cgHeightRatio: number;
  /** 빈틈 경고 기준 mm */
  gapWarning: number;
  /** 중량 운영 한도(최대 적재중량 대비 비율) */
  payloadRatio: number;
  /** 법정 축하중 kg */
  legalAxleLoad: number;
  /** 전축 최소 하중 비율(총중량 대비) */
  minFrontAxleRatio: number;
  defaultFriction: number;
  accel: Accel;
  /** 혼적 금지 쌍 */
  incompatiblePairs: [string, string][];
  /** 하역 순서 위반을 오류로 볼지 경고로 볼지 */
  strictUnloadOrder: boolean;
}

export type Severity = 'error' | 'warning';

export interface Violation {
  code: string;
  severity: Severity;
  itemIds: string[];
  message: string;
  value?: number;
  limit?: number;
}

export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}
