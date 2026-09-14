import { useEffect } from 'react';

const LEGACY_CONFIRMED_PACKAGING_KEY = 'container-loading:guided-confirmed-packaging-state:v1';

/**
 * 제품 포장 확정의 canonical source는 shipmentInstruction.ts 하나만 사용한다.
 * 과거에는 이 컴포넌트가 별도의 confirmed-packaging localStorage 스냅샷을 만들고
 * run-loading을 다시 가로채면서 shipmentInstruction과 서로 다른 시점의 cargo를 보관했다.
 *
 * 실행/검증 책임은 이제 GuidedLoadingExecutionBridge + PackagingDataIntegrityGuard가
 * shipmentInstruction 스냅샷 하나를 기준으로 담당한다. 이 컴포넌트는 이전 버전의
 * 중복 스냅샷만 제거하는 호환 정리 역할만 남긴다.
 */
export default function ConfirmedPackagingLoadingBridge() {
  useEffect(() => {
    try { window.localStorage.removeItem(LEGACY_CONFIRMED_PACKAGING_KEY); } catch { /* storage unavailable */ }
  }, []);

  return null;
}
