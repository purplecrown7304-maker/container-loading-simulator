import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { downloadEnterprisePackagingWorkbook } from './enterprisePackagingExcelExport';
import {
  clearEnterprisePackagingManifest,
  enterprisePackagingManifestMatchesState,
  readEnterprisePackagingManifest,
} from './enterprisePackagingManifest';
import {
  buildEnterprisePackagingPlanFromPlanner,
  readEnterprisePackagingPlannerState,
  type EnterprisePackagingPlannerState,
} from './enterprisePackagingPlannerStore';
import { openEnterprisePackagingWorkOrder } from './enterprisePackagingWorkOrder';
import { readStoredState, STORAGE_UPDATED_EVENT, type StoredState } from './storage';

function buildPlan(): { plan: ReturnType<typeof buildEnterprisePackagingPlanFromPlanner>; stored: EnterprisePackagingPlannerState } | null {
  const stored = readEnterprisePackagingPlannerState();
  if (!stored?.products?.length) return null;
  return { plan: buildEnterprisePackagingPlanFromPlanner(stored), stored };
}

function persistIfApplied(state?: StoredState | null) {
  const current = state ?? readStoredState();
  // Applying a plan stores its existing manifest. A storage notification must
  // never re-run enterprise optimization (including the guided packaging flow).
  const manifest = readEnterprisePackagingManifest();
  if (manifest && !enterprisePackagingManifestMatchesState(manifest, current?.container, current?.cargo)) clearEnterprisePackagingManifest();
}

export default function EnterprisePackagingOutputActions() {
  const [target, setTarget] = useState<Element | null>(null);

  useEffect(() => {
    const locate = () => {
      const next = document.querySelector('.enterprise-packaging-result .result-head');
      setTarget((current) => current === next ? current : next);
    };
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    const onStorage = (event: Event) => persistIfApplied((event as CustomEvent<StoredState>).detail);
    window.addEventListener(STORAGE_UPDATED_EVENT, onStorage);
    persistIfApplied();
    return () => {
      observer.disconnect();
      window.removeEventListener(STORAGE_UPDATED_EVENT, onStorage);
    };
  }, []);

  const download = () => {
    const rebuilt = buildPlan();
    if (!rebuilt) return window.alert('내보낼 기업 포장계획이 없습니다. 먼저 포장 최적화를 실행하세요.');
    downloadEnterprisePackagingWorkbook(rebuilt.plan, rebuilt.stored.container, rebuilt.stored.products, rebuilt.stored.boxes);
  };

  const workOrder = () => {
    const rebuilt = buildPlan();
    if (!rebuilt) return window.alert('생성할 포장 작업지시서가 없습니다. 먼저 포장 최적화를 실행하세요.');
    const opened = openEnterprisePackagingWorkOrder(rebuilt.plan, rebuilt.stored.container, rebuilt.stored.products, rebuilt.stored.boxes);
    if (!opened) window.alert('팝업이 차단되어 포장 작업지시서를 열지 못했습니다.');
  };

  if (!target) return null;
  return createPortal(<>
    <button type="button" onClick={workOrder}>포장 작업지시서</button>
    <button type="button" onClick={download}>포장계획 Excel</button>
  </>, target);
}
