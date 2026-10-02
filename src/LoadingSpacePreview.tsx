import type { ContainerSpec, LoadingResult } from './engine/types';
import LoadingViewer from './LoadingViewer';
const empty: LoadingResult = { placements: [], remaining: [], usedVolumeM3: 0, loadedWeightKg: 0, validationIssues: [] };
export default function LoadingSpacePreview({ container }: { container: ContainerSpec }) {
  return <LoadingViewer container={container} result={empty} preview />;
}
