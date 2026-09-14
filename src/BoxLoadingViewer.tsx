import { useEffect } from 'react';
import type { ContainerSpec, LoadingResult } from './engine/types';
import BoxLoadingViewerEquipment from './BoxLoadingViewerEquipment';
import { BOX_VIEW_SNAPSHOT_EVENT } from './RemainingLengthIndicator';

type Props = { result: LoadingResult; container: ContainerSpec };
type SnapshotWindow = Window & {
  __containerLoadingBoxViewSnapshot?: Props;
};

/**
 * 3D 박스 뷰어의 신뢰 원천은 App이 내려주는 props 하나뿐이다.
 * 전역 결과 스냅샷과 localStorage를 다시 비교해 다른 결과를 선택하지 않는다.
 * RemainingLengthIndicator용 스냅샷은 같은 props를 그대로 브로드캐스트한다.
 */
export default function BoxLoadingViewer(props: Props) {
  useEffect(() => {
    (window as SnapshotWindow).__containerLoadingBoxViewSnapshot = props;
    window.dispatchEvent(new CustomEvent<Props>(BOX_VIEW_SNAPSHOT_EVENT, { detail: props }));
  }, [props.container, props.result]);

  useEffect(() => () => {
    (window as SnapshotWindow).__containerLoadingBoxViewSnapshot = undefined;
    window.dispatchEvent(new CustomEvent<undefined>(BOX_VIEW_SNAPSHOT_EVENT, { detail: undefined }));
  }, []);

  return <BoxLoadingViewerEquipment {...props} />;
}
