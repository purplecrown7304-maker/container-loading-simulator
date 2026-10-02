import { lazy, Suspense, useEffect, useRef, type ComponentProps } from 'react';
import UnityLoadingViewer from './UnityLoadingViewer';
import { setComparisonRenderer, useViewerComparison } from './viewerComparison';
import { inertiaHostMatchesTarget, registerInertiaCanvasHost, useInertiaCanvasPlayback } from './inertiaCanvasStore';
import { readPhysicsTarget } from './physicsTarget';
import './three-comparison.css';

export type LoadingViewerProps = ComponentProps<typeof UnityLoadingViewer> & { inertiaHost?: boolean };
const ThreeLoadingViewer = lazy(() => import('./ThreeLoadingViewer'));

/** Three.js reuses the original models. Unity remains a view-only choice. */
export default function LoadingViewer({ inertiaHost = false, ...props }: LoadingViewerProps) {
  return inertiaHost ? <MainInertiaCanvas {...props} /> : <Renderer {...props} />;
}

function MainInertiaCanvas(props: ComponentProps<typeof UnityLoadingViewer>) {
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
  // reset saved sequence controls and reset Unity's orbit camera on close.
  const scene = active ? { ...props, frameData: active.frame } : props;
  return <div className="inertia-canvas-host" data-inertia-active={Boolean(active)}>
    <Renderer {...scene} />
    <div ref={host} className="inertia-canvas-controls-host" />
  </div>;
}

function Renderer(props: ComponentProps<typeof UnityLoadingViewer>) {
  const comparison = useViewerComparison();
  if (!comparison.enabled) return <UnityLoadingViewer {...props} />;
  return <div className="renderer-comparison" data-renderer={comparison.renderer}>
    <div className="renderer-comparison-switch" role="group" aria-label="3D 엔진 선택">
      <span>3D 엔진 · 동일 적재 결과</span>
      <button type="button" data-view-only="true" aria-pressed={comparison.renderer === 'unity'} onClick={() => setComparisonRenderer('unity')}>Unity</button>
      <button type="button" data-view-only="true" aria-pressed={comparison.renderer === 'three'} onClick={() => setComparisonRenderer('three')}>Three.js · 기존 모델</button>
    </div>
    <Suspense fallback={<div className="three-comparison-pending" role="status">Three.js 화면 준비 중</div>}>
      {comparison.renderer === 'three' ? <ThreeLoadingViewer {...props} /> : <UnityLoadingViewer {...props} />}
    </Suspense>
  </div>;
}
