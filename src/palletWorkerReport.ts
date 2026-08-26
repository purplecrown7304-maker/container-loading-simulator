export * from './palletWorkerReportV2';

import type { CargoItem, ContainerSpec } from './engine/types';
import { requestFinalWorkOrder } from './finalWorkOrderEvents';
import { readPhysicsTarget } from './physicsTarget';
import { openPalletLoadingReport as openPalletLoadingReportV2 } from './palletWorkerReportV2';

/**
 * 팔레트 작업지시서는 바로 출력하지 않고 작업지시서 전용 최종 최적화 루프를 먼저 통과한다.
 * 최종 최적화 엔진 내부에서는 V2 원본 함수를 직접 호출하므로 재귀 호출되지 않는다.
 */
export function openPalletLoadingReport(container: ContainerSpec, cargo: CargoItem[]): boolean {
  const target = readPhysicsTarget();
  if (target?.mode === 'pallets' && target.result.placements.length > 0) {
    requestFinalWorkOrder(target.container, target.cargo);
    return true;
  }
  return openPalletLoadingReportV2(container, cargo);
}
