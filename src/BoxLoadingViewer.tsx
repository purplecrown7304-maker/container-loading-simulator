import { useEffect, useState } from 'react';
import { AUTOMATIC_LOADING_PROGRESS_EVENT, type AutomaticLoadingProgressDetail } from './engine/physicsOptimizer';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import BoxLoadingViewerEquipment from './BoxLoadingViewerEquipment';
import { BOX_VIEW_SNAPSHOT_EVENT } from './RemainingLengthIndicator';
import { readStoredState, STORAGE_UPDATED_EVENT } from './storage';

type Props = { result: LoadingResult; container: ContainerSpec };
type LoadingDetail = { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
type SnapshotWindow = Window & {
  __containerLoadingBoxViewSnapshot?: Props;
  __containerLoadingLatestResult?: LoadingDetail;
};

function cargoSignature(cargo: CargoItem[]) {
  return [...cargo]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(item => [
      item.id,
      item.quantity,
      item.length.toFixed(5),
      item.width.toFixed(5),
      item.height.toFixed(5),
      item.weightKg.toFixed(5),
    ].join(':'))
    .join('|');
}

function sameContainer(a: ContainerSpec, b: ContainerSpec) {
  return Math.abs(a.length - b.length) <= 0.001
    && Math.abs(a.width - b.width) <= 0.001
    && Math.abs(a.height - b.height) <= 0.001
    && Math.abs(a.maxPayloadKg - b.maxPayloadKg) <= 1;
}

function resolvedGuidedProps(fallback: Props): Props {
  if (typeof window === 'undefined' || typeof document === 'undefined') return fallback;
  const guided = document.documentElement.dataset.guidedWorkflow === 'true';
  const step = document.documentElement.dataset.guidedStep;
  if (!guided || step !== '5') return fallback;

  const latest = (window as SnapshotWindow).__containerLoadingLatestResult;
  const stored = readStoredState();
  if (!latest || !stored?.cargo?.length) return fallback;

  const sameInput = sameContainer(stored.container, latest.container)
    && cargoSignature(stored.cargo) === cargoSignature(latest.cargo);
  if (!sameInput) return fallback;

  return { container: latest.container, result: latest.result };
}

export default function BoxLoadingViewer(props: Props) {
  const [viewProps, setViewProps] = useState<Props>(() => resolvedGuidedProps(props));

  useEffect(() => {
    const refresh = () => setViewProps(resolvedGuidedProps(props));
    const onProgress = (event: Event) => {
      const detail = (event as CustomEvent<AutomaticLoadingProgressDetail>).detail;
      if (detail?.status === 'running') {
        // 새 계산이 시작될 때는 App이 가진 대기 결과를 보여주고,
        // 계산 완료 후 published result를 다시 가져온다.
        setViewProps(props);
        return;
      }
      refresh();
    };

    refresh();
    window.addEventListener(LOADING_RESULT_EVENT, refresh);
    window.addEventListener(STORAGE_UPDATED_EVENT, refresh);
    window.addEventListener(AUTOMATIC_LOADING_PROGRESS_EVENT, onProgress);
    return () => {
      window.removeEventListener(LOADING_RESULT_EVENT, refresh);
      window.removeEventListener(STORAGE_UPDATED_EVENT, refresh);
      window.removeEventListener(AUTOMATIC_LOADING_PROGRESS_EVENT, onProgress);
    };
  }, [props.container, props.result]);

  useEffect(() => {
    const publish = () => {
      (window as SnapshotWindow).__containerLoadingBoxViewSnapshot = viewProps;
      window.dispatchEvent(new CustomEvent<Props>(BOX_VIEW_SNAPSHOT_EVENT, { detail: viewProps }));
    };
    publish();
    return () => {
      (window as SnapshotWindow).__containerLoadingBoxViewSnapshot = undefined;
      window.dispatchEvent(new CustomEvent<undefined>(BOX_VIEW_SNAPSHOT_EVENT, { detail: undefined }));
    };
  }, [viewProps.container, viewProps.result]);

  return <BoxLoadingViewerEquipment {...viewProps} />;
}
