import { useEffect, useState } from 'react';
import type { ContainerSpec, LoadingResult } from './engine/types';
import UnityLoadingViewer from './UnityLoadingViewer';
import BoxLoadingViewerEquipment from './BoxLoadingViewerEquipment';
import { BOX_VIEW_SNAPSHOT_EVENT } from './RemainingLengthIndicator';

type Props = { result: LoadingResult; container: ContainerSpec };
type SnapshotWindow = Window & {
  __containerLoadingBoxViewSnapshot?: Props;
};

export default function BoxLoadingViewer(props: Props) {
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    const publish = () => {
      (window as SnapshotWindow).__containerLoadingBoxViewSnapshot = props;
      window.dispatchEvent(new CustomEvent<Props>(BOX_VIEW_SNAPSHOT_EVENT, { detail: props }));
    };
    publish();
    return () => {
      (window as SnapshotWindow).__containerLoadingBoxViewSnapshot = undefined;
      window.dispatchEvent(new CustomEvent<undefined>(BOX_VIEW_SNAPSHOT_EVENT, { detail: undefined }));
    };
  }, [props.container, props.result]);

  return fallback ? <div className="legacy-viewer-wrap"><button type="button" onClick={() => setFallback(false)}>Unity 3D로 돌아가기</button><BoxLoadingViewerEquipment {...props} /></div> : <UnityLoadingViewer {...props} onFallback={() => setFallback(true)} />;
}
