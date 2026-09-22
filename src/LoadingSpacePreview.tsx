import type { ContainerSpec, LoadingResult } from './engine/types';
import UnityLoadingViewer from './UnityLoadingViewer';
const empty: LoadingResult = { placements: [], remaining: [], usedVolumeM3: 0, loadedWeightKg: 0, validationIssues: [] };
export default function LoadingSpacePreview({ container }: { container: ContainerSpec }) {
  return <UnityLoadingViewer container={container} result={empty} preview />;
}
