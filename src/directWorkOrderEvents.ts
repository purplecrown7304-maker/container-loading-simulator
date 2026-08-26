import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';

export const REQUEST_DIRECT_WORK_ORDER_EVENT = 'container-loading:request-direct-work-order';

export type DirectWorkOrderRequest = {
  container: ContainerSpec;
  cargo: CargoItem[];
  result: LoadingResult;
};

export function requestDirectWorkOrder(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<DirectWorkOrderRequest>(REQUEST_DIRECT_WORK_ORDER_EVENT, {
    detail: { container, cargo, result },
  }));
}
