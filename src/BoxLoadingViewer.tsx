import { useEffect, useState } from 'react';
import { INERTIA_CERTIFICATION_EVENT, readLatestInertiaCertification, type InertiaCertification } from './inertiaCertification';
import type { ContainerSpec, LoadingResult } from './engine/types';
import UnityLoadingViewer from './UnityLoadingViewer';
import { BOX_VIEW_SNAPSHOT_EVENT } from './RemainingLengthIndicator';

type Props = { result: LoadingResult; container: ContainerSpec };
type SnapshotWindow = Window & {
  __containerLoadingBoxViewSnapshot?: Props;
};

export default function BoxLoadingViewer(props: Props) {
  const [certification, setCertification] = useState<InertiaCertification | undefined>(() => readLatestInertiaCertification() ?? undefined);
  useEffect(() => {
    const update = (event: Event) => setCertification((event as CustomEvent<InertiaCertification | undefined>).detail);
    window.addEventListener(INERTIA_CERTIFICATION_EVENT, update);
    return () => window.removeEventListener(INERTIA_CERTIFICATION_EVENT, update);
  }, []);
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

  return <UnityLoadingViewer {...props} syncSelection securing={certification?.mode === 'boxes' ? certification.securing : null} />;
}
