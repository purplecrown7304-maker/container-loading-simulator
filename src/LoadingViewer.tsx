import { lazy, Suspense, type ComponentProps } from 'react';
import UnityLoadingViewer from './UnityLoadingViewer';
import { setComparisonRenderer, useViewerComparison } from './viewerComparison';
import './three-comparison.css';

export type LoadingViewerProps = ComponentProps<typeof UnityLoadingViewer>;
const ThreeLoadingViewer = lazy(() => import('./ThreeLoadingViewer'));

/** Unity remains the default. ?renderer=three or ?renderer=compare opts this session in. */
export default function LoadingViewer(props: LoadingViewerProps) {
  const comparison = useViewerComparison();
  if (!comparison.enabled) return <UnityLoadingViewer {...props} />;
  return <div className="renderer-comparison" data-renderer={comparison.renderer}>
    <div className="renderer-comparison-switch" role="group" aria-label="비교용 3D 엔진">
      <span>비교 모드 · 동일 적재 결과</span>
      <button type="button" data-view-only="true" aria-pressed={comparison.renderer === 'unity'} onClick={() => setComparisonRenderer('unity')}>Unity</button>
      <button type="button" data-view-only="true" aria-pressed={comparison.renderer === 'three'} onClick={() => setComparisonRenderer('three')}>Three.js · 기존 모델</button>
    </div>
    <Suspense fallback={<div className="three-comparison-pending" role="status">Three.js 비교 화면 준비 중</div>}>
      {comparison.renderer === 'three' ? <ThreeLoadingViewer {...props} /> : <UnityLoadingViewer {...props} />}
    </Suspense>
  </div>;
}
