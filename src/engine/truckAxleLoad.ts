import type { ContainerSpec, LoadingResult, Placement, TruckAxleModel } from './types';

const EPS = 1e-9;

export type TruckAxleAssessment = {
  configured: boolean;
  validGeometry: boolean;
  cargoWeightKg: number;
  cargoCogX: number;
  frontCargoReactionKg: number;
  rearCargoReactionKg: number;
  frontTotalKg: number;
  rearTotalKg: number;
  frontUtilization?: number;
  rearUtilization?: number;
  outsideSupportSpan: boolean;
  severity: 'ok' | 'warning' | 'over' | 'invalid';
  penalty: number;
  messages: string[];
};

function placementWeight(placements: Placement[]) {
  return placements.reduce((sum, item) => sum + Math.max(0, item.weightKg), 0);
}

function weightedCogX(placements: Placement[]) {
  const total = placementWeight(placements);
  if (total <= EPS) return 0;
  return placements.reduce((sum, item) => sum + (item.x + item.length / 2) * Math.max(0, item.weightKg), 0) / total;
}

function utilization(load: number, max?: number) {
  return max && max > EPS ? load / max : undefined;
}

export function isValidTruckAxleModel(container: ContainerSpec, model: TruckAxleModel | undefined): model is TruckAxleModel {
  if (!model) return false;
  return Number.isFinite(model.frontSupportX)
    && Number.isFinite(model.rearSupportX)
    && model.frontSupportX >= 0
    && model.rearSupportX <= container.length + EPS
    && model.rearSupportX - model.frontSupportX > 0.2;
}

/**
 * 화물 적재공간을 두 지지점 사이의 단순보로 보는 내부 비교 모델이다.
 * 실제 축중/축군 하중은 차량 구조·킹핀·서스펜션·공차축중에 따라 달라지므로
 * 작업지시 전 실제 차량 계근/제원으로 확인해야 한다.
 */
export function assessTruckAxlePlacements(container: ContainerSpec, placements: Placement[]): TruckAxleAssessment | undefined {
  if (container.transportKind !== 'truck' || !container.truckAxles) return undefined;
  const model = container.truckAxles;
  const cargoWeightKg = placementWeight(placements);
  const cargoCogX = weightedCogX(placements);
  const validGeometry = isValidTruckAxleModel(container, model);

  if (!validGeometry) {
    return {
      configured: true,
      validGeometry: false,
      cargoWeightKg,
      cargoCogX,
      frontCargoReactionKg: 0,
      rearCargoReactionKg: 0,
      frontTotalKg: Math.max(0, model.tareFrontKg ?? 0),
      rearTotalKg: Math.max(0, model.tareRearKg ?? 0),
      outsideSupportSpan: false,
      severity: 'invalid',
      penalty: 500,
      messages: ['축 위치가 유효하지 않습니다. 앞 지지축 < 뒤 지지축이고 둘 다 적재공간 안에 있어야 합니다.'],
    };
  }

  const span = model.rearSupportX - model.frontSupportX;
  const rearCargoReactionKg = cargoWeightKg * (cargoCogX - model.frontSupportX) / span;
  const frontCargoReactionKg = cargoWeightKg - rearCargoReactionKg;
  const frontTotalKg = frontCargoReactionKg + Math.max(0, model.tareFrontKg ?? 0);
  const rearTotalKg = rearCargoReactionKg + Math.max(0, model.tareRearKg ?? 0);
  const frontUtilization = utilization(frontTotalKg, model.frontMaxKg);
  const rearUtilization = utilization(rearTotalKg, model.rearMaxKg);
  const outsideSupportSpan = cargoCogX < model.frontSupportX - EPS || cargoCogX > model.rearSupportX + EPS;
  const over = outsideSupportSpan || (frontUtilization ?? 0) > 1 || (rearUtilization ?? 0) > 1;
  const warning = !over && ((frontUtilization ?? 0) > 0.9 || (rearUtilization ?? 0) > 0.9);
  const severity: TruckAxleAssessment['severity'] = over ? 'over' : warning ? 'warning' : 'ok';
  const maxUtilization = Math.max(frontUtilization ?? 0, rearUtilization ?? 0);
  const imbalance = cargoWeightKg > EPS ? Math.abs(frontCargoReactionKg - rearCargoReactionKg) / cargoWeightKg : 0;
  const penalty = (outsideSupportSpan ? 300 : 0)
    + Math.max(0, maxUtilization - 0.82) * 260
    + imbalance * 18;
  const messages: string[] = [];

  if (outsideSupportSpan) messages.push('화물 무게중심이 입력한 앞/뒤 지지축 사이를 벗어났습니다.');
  if (frontUtilization !== undefined) messages.push(`앞축/축군 추정 ${frontTotalKg.toFixed(0)}kg · 허용치 대비 ${(frontUtilization * 100).toFixed(1)}%`);
  else messages.push(`앞축/축군 화물 반력 ${frontCargoReactionKg.toFixed(0)}kg · 허용하중 미입력`);
  if (rearUtilization !== undefined) messages.push(`뒤축/축군 추정 ${rearTotalKg.toFixed(0)}kg · 허용치 대비 ${(rearUtilization * 100).toFixed(1)}%`);
  else messages.push(`뒤축/축군 화물 반력 ${rearCargoReactionKg.toFixed(0)}kg · 허용하중 미입력`);

  return {
    configured: true,
    validGeometry,
    cargoWeightKg,
    cargoCogX,
    frontCargoReactionKg,
    rearCargoReactionKg,
    frontTotalKg,
    rearTotalKg,
    frontUtilization,
    rearUtilization,
    outsideSupportSpan,
    severity,
    penalty,
    messages,
  };
}

export function assessTruckAxleLoad(container: ContainerSpec, result: Pick<LoadingResult, 'placements'>): TruckAxleAssessment | undefined {
  return assessTruckAxlePlacements(container, result.placements);
}
