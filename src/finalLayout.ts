import type { LoadingStrategy } from './engine/loadingStrategies';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import type { InertiaCertification } from './inertiaCertification';
import type { LoadingMode } from './loadingWorkflow';

export type FinalLayout = {
  mode: LoadingMode;
  strategy: LoadingStrategy;
  container: ContainerSpec;
  cargo: CargoItem[];
  result: LoadingResult;
  certification: InertiaCertification;
  verifiedAt: string;
  source: 'baseline' | 'auto-rearranged';
};

export const FINAL_LAYOUT_EVENT = 'container-loading:final-layout';

let latest: FinalLayout | null = null;

type FinalLayoutWindow = Window & {
  __containerLoadingFinalLayout?: FinalLayout;
};

export function publishFinalLayout(layout: FinalLayout) {
  latest = layout;
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    (window as FinalLayoutWindow).__containerLoadingFinalLayout = layout;
    window.dispatchEvent(new CustomEvent<FinalLayout>(FINAL_LAYOUT_EVENT, { detail: layout }));
  }
  return layout;
}

export function readFinalLayout(): FinalLayout | null {
  if (latest) return latest;
  if (typeof window === 'undefined') return null;
  return (window as FinalLayoutWindow).__containerLoadingFinalLayout ?? null;
}

export function clearFinalLayout() {
  latest = null;
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    (window as FinalLayoutWindow).__containerLoadingFinalLayout = undefined;
    window.dispatchEvent(new CustomEvent<null>(FINAL_LAYOUT_EVENT, { detail: null }));
  }
}
