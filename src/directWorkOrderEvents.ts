import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';

export const REQUEST_DIRECT_WORK_ORDER_EVENT = 'container-loading:request-direct-work-order';

export type DirectWorkOrderRequest = {
  container: ContainerSpec;
  cargo: CargoItem[];
  result: LoadingResult;
  /**
   * true(기본): 사용자가 작업지시서를 요청한 흐름. 검증 완료 후 보고서를 연다.
   * false: 최종 적재 진행의 자동 관성 검증 흐름. 동일한 검증/재배치를 수행하되 보고서는 열지 않는다.
   */
  openReport?: boolean;
};

export function requestDirectWorkOrder(
  container: ContainerSpec,
  cargo: CargoItem[],
  result: LoadingResult,
  options?: { openReport?: boolean },
) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<DirectWorkOrderRequest>(REQUEST_DIRECT_WORK_ORDER_EVENT, {
    detail: { container, cargo, result, openReport: options?.openReport ?? true },
  }));
}
