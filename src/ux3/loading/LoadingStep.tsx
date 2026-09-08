import { lazy, Suspense } from 'react';
import type { CargoItem, ContainerSpec, LoadingResult } from '../../engine/types';
import type { LoadingMode } from '../types';

const BoxLoadingViewerEquipment = lazy(() => import('../../BoxLoadingViewerEquipment'));
const PalletModePanel = lazy(() => import('../../PalletModePanel'));

function ViewerFallback() {
  return <div className="ux3-viewer-fallback"><b>3D 뷰어 준비 중</b><span>적재 결과를 불러오고 있습니다.</span></div>;
}

type Props = {
  mode: LoadingMode;
  container: ContainerSpec;
  cargo: CargoItem[];
  boxResult: LoadingResult;
  palletRunToken: number;
  requestedQty: number;
  running: boolean;
  progressMessage: string;
};

export default function LoadingStep({ mode, container, cargo, boxResult, palletRunToken, requestedQty, running, progressMessage }: Props) {
  return <section className="ux3-step-page ux3-loading-page">
    <div className="ux3-page-heading">
      <div><span>STEP 3</span><h1>자동 적재</h1><p>무게중심은 적재 차단 조건이 아니라 품질 경고입니다. 물리 안전 한도 안에서 가능한 화물은 계속 적재합니다.</p></div>
      <div className="ux3-loading-meta"><span>{mode === 'boxes' ? 'DIRECT BOX' : 'PALLET'}</span><b>{requestedQty} EA 요청</b></div>
    </div>
    <section className="ux3-viewer-card">
      {running && <div className="ux3-progress-overlay"><span className="ux3-spinner" /><b>최적 적재 계산 중</b><p>{progressMessage || '적재 후보를 비교하고 있습니다.'}</p></div>}
      <div className="ux3-viewer-host">
        <Suspense fallback={<ViewerFallback />}>
          {mode === 'boxes'
            ? <BoxLoadingViewerEquipment result={boxResult} container={container} cargo={cargo} />
            : <PalletModePanel container={container} cargo={cargo} runToken={palletRunToken} />}
        </Suspense>
      </div>
    </section>
    <div className="ux3-loading-note"><b>3D 조작</b><span>전체/상단/측면/문 방향, 박스 정보, 무게 분포 보기 기능은 기존 3D 뷰어를 그대로 사용합니다.</span></div>
  </section>;
}
