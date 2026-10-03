import { lazy, Suspense, useEffect, useRef } from 'react';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import type { InertiaAnimationFrame } from './engine/inertiaSimulation';
import type { ViewerSceneOptions } from './viewerSceneProtocol';
import { inertiaHostMatchesTarget, registerInertiaCanvasHost, useInertiaCanvasPlayback } from './inertiaCanvasStore';
import { readPhysicsTarget } from './physicsTarget';
import './three-comparison.css';

export type LoadingViewerProps = ViewerSceneOptions & {
  container: ContainerSpec; result: LoadingResult; cargo?: CargoItem[]; preview?: boolean;
  title?: string; syncSelection?: boolean; frameData?: InertiaAnimationFrame;
  onCargoSelect?: (index: number) => void; onSupportSelect?: (index: number) => void;
  weightView?: boolean; showCg?: boolean; view?: string; inertiaHost?: boolean;
  showDiagnostics?: boolean; compact?: boolean;
};
const ThreeLoadingViewer = lazy(() => import('./ThreeLoadingViewer'));

/** All loading views share the Three.js renderer and the original models. */
export default function LoadingViewer({ inertiaHost = false, ...props }: LoadingViewerProps) {
  return inertiaHost ? <MainInertiaCanvas {...props} /> : <Renderer {...props} />;
}

function MainInertiaCanvas(props: LoadingViewerProps) {
  const host = useRef<HTMLDivElement>(null);
  const playback = useInertiaCanvasPlayback();
  useEffect(() => {
    if (!host.current) return;
    return registerInertiaCanvasHost({ element: host.current, container: props.container, result: props.result, supports: props.supports });
  }, [props.container, props.result, props.supports]);
  const active = playback && playback.target === readPhysicsTarget()
    && inertiaHostMatchesTarget({ element: host.current!, container: props.container, result: props.result, supports: props.supports }, playback.target) ? playback : null;
  // Matching already establishes the ordered bodies and geometry. Only replay
  // their poses: replacing equivalent target objects would rebuild the plan,
  // reset saved sequence controls and the orbit camera on close.
  const scene = active ? { ...props, frameData: active.frame } : props;
  return <div className="inertia-canvas-host" data-inertia-active={Boolean(active)}>
    <Renderer {...scene} />
    <div ref={host} className="inertia-canvas-controls-host" />
  </div>;
}

function Renderer(props: LoadingViewerProps) {
  return <div className="renderer-comparison" data-renderer="three">
    <Suspense fallback={<div className="three-comparison-pending" role="status">Three.js 화면 준비 중</div>}>
      <ThreeLoadingViewer {...props} />
    </Suspense>
  </div>;
}
