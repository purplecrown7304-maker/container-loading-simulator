import BoxLoadingViewerReference from './BoxLoadingViewerReference';
import TruckBoxLoadingViewer from './TruckBoxLoadingViewer';
import type { ContainerSpec, LoadingResult } from './engine/types';

export default function BoxLoadingViewer({ result, container }: { result: LoadingResult; container: ContainerSpec }) {
  return container.transportKind === 'truck'
    ? <TruckBoxLoadingViewer result={result} container={container} />
    : <BoxLoadingViewerReference result={result} container={container} />;
}
