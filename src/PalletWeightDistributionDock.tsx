import UnityLoadingViewer from './UnityLoadingViewer';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { analyzeWeightDistribution } from './engine/weightDistribution';
import {
  readWeightCgPreference,
  readWeightGraphPreference,
  saveWeightCgPreference,
  saveWeightGraphPreference,
  type PreviewView,
} from './viewerPreferences';
import { usePhysicsTarget } from './physicsTarget';
import WeightDistributionPanel from './WeightDistributionPanel';
import './weight-distribution.css';

export default function PalletWeightDistributionDock() {
  const target = usePhysicsTarget();
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const [view, setView] = useState<PreviewView>('free');
  const [showGraph, setShowGraph] = useState(readWeightGraphPreference);
  const [showCg, setShowCg] = useState(readWeightCgPreference);

  useEffect(() => {
    const locate = () => setPortalTarget(document.querySelector('.pallet-viewer'));
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  // BOX 모드와 같은 기준: 팔레트 tare/support 중량을 섞지 않고 박스 placement만 분석한다.
  const analysis = useMemo(() => {
    if (!target || target.mode !== 'pallets') return null;
    return analyzeWeightDistribution(target.container, target.result, 20, 8);
  }, [target]);

  if (!portalTarget || !target || target.mode !== 'pallets') return null;

  const toggleGraph = () => setShowGraph((current) => {
    const next = !current;
    saveWeightGraphPreference(next);
    if (!next) setView('free');
    return next;
  });
  const toggleCg = () => setShowCg((current) => {
    const next = !current;
    saveWeightCgPreference(next);
    return next;
  });

  const viewButton = (nextView: Exclude<PreviewView, 'free'>, label: string) => (
    <button
      type="button"
      className={view === nextView ? 'active view-active' : ''}
      onClick={() => setView(nextView)}
    >
      {label}
    </button>
  );

  return createPortal(
    <div className={`pallet-weight-dock ${showGraph ? 'open' : ''}`}>
      <div className="pallet-weight-toolbar">
        {showGraph && <div className="pallet-weight-view-buttons">
          {viewButton('rear', '후면')}
          {viewButton('top', '상단')}
          {viewButton('side', '옆면')}
        </div>}
        <button type="button" className={showGraph ? 'active' : ''} onClick={toggleGraph}>
          3D 무게분포 {showGraph ? 'ON' : 'OFF'}
        </button>
        {showGraph && <button type="button" className={showCg ? 'active cg-active' : ''} onClick={toggleCg}>
          CG {showCg ? 'ON' : 'OFF'}
        </button>}
      </div>

      {showGraph && <section className="pallet-weight-card" aria-label="박스 기준 팔레트 3D 무게 분포">
        {analysis && analysis.totalWeightKg > 0 ? <>
          <div className="pallet-weight-canvas">
            <UnityLoadingViewer container={target.container} result={target.result} supports={target.supports} cargo={target.cargo} preview title="팔레트 무게분포" weightView showCg={showCg} view={view} />
          </div>
          <WeightDistributionPanel analysis={analysis} />
          <div className="pallet-weight-basis">
            <b>박스 기준 무게분포</b>
            <span>팔레트 자체중량 제외 · 실제 박스 중량/위치 · 20×8 바닥 격자</span>
          </div>
        </> : <div className="pallet-weight-empty">
          <b>팔레트 위 박스 적재 결과가 없습니다.</b>
          <span>화물을 등록한 뒤 자동 적재를 실행하면 박스 기준 무게분포가 표시됩니다.</span>
        </div>}
      </section>}
    </div>,
    portalTarget,
  );
}
