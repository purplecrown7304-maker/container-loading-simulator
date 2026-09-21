import { useState } from 'react';
import type { ContainerSpec, LoadingResult } from './engine/types';
import UnityLoadingViewer from './UnityLoadingViewer';
import ThreeSpacePreview from './ThreeSpacePreview';
const empty: LoadingResult = { placements: [], remaining: [], usedVolumeM3: 0, loadedWeightKg: 0, validationIssues: [] };
export default function LoadingSpacePreview({ container }: { container: ContainerSpec }) {
  const [fallback, setFallback] = useState(false);
  return fallback ? <ThreeSpacePreview container={container}/> : <UnityLoadingViewer container={container} result={empty} preview onFallback={() => setFallback(true)}/>;
}
