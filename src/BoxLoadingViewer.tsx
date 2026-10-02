import { useEffect, useState } from 'react';
import { INERTIA_CERTIFICATION_EVENT, readLatestInertiaCertification, type InertiaCertification } from './inertiaCertification';
import LoadingViewer, { type LoadingViewerProps } from './LoadingViewer';
import { BOX_VIEW_SNAPSHOT_EVENT } from './RemainingLengthIndicator';

type Props = LoadingViewerProps & { mode?: 'boxes' | 'pallets' | 'mixed'; isPreview?: boolean };
type SnapshotWindow = Window & {
  __containerLoadingBoxViewSnapshot?: Props;
};

/** Stable main host shared by box, pallet and mixed scenes. */
export default function BoxLoadingViewer({ mode = 'boxes', isPreview = false, ...props }: Props) {
  const [certification, setCertification] = useState<InertiaCertification | undefined>(() => readLatestInertiaCertification() ?? undefined);
  useEffect(() => {
    const update = (event: Event) => setCertification((event as CustomEvent<InertiaCertification | undefined>).detail);
    window.addEventListener(INERTIA_CERTIFICATION_EVENT, update);
    return () => window.removeEventListener(INERTIA_CERTIFICATION_EVENT, update);
  }, []);
  useEffect(() => {
    const publish = () => {
      const snapshot = mode === 'boxes' && !isPreview ? props : undefined;
      (window as SnapshotWindow).__containerLoadingBoxViewSnapshot = snapshot;
      window.dispatchEvent(new CustomEvent<Props | undefined>(BOX_VIEW_SNAPSHOT_EVENT, { detail: snapshot }));
    };
    publish();
    return () => {
      (window as SnapshotWindow).__containerLoadingBoxViewSnapshot = undefined;
      window.dispatchEvent(new CustomEvent<undefined>(BOX_VIEW_SNAPSHOT_EVENT, { detail: undefined }));
    };
  }, [props.container, props.result, mode, isPreview]);

  const certificationMode = mode === 'boxes' ? 'boxes' : 'pallets';
  return <LoadingViewer {...props} inertiaHost preview={isPreview} syncSelection={mode === 'boxes' && !isPreview}
    securing={!isPreview && certification?.mode === certificationMode ? certification.securing : null} />;
}
