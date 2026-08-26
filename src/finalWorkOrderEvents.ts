import type { CargoItem, ContainerSpec } from './engine/types';

export const REQUEST_FINAL_WORK_ORDER_EVENT = 'container-loading:request-final-work-order';

export type FinalWorkOrderRequest = {
  container: ContainerSpec;
  cargo: CargoItem[];
};

export function requestFinalWorkOrder(container: ContainerSpec, cargo: CargoItem[]) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<FinalWorkOrderRequest>(REQUEST_FINAL_WORK_ORDER_EVENT, {
    detail: { container, cargo },
  }));
}
