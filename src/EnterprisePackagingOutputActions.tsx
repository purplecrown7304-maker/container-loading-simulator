import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { defaultEnterprisePackagingOptions, optimizeEnterprisePackaging, type EnterprisePackagingPlan } from './engine/enterprisePackagingOptimizer';
import type { BoxCatalogItem, ProductItem } from './engine/productPackagingOptimizer';
import type { ContainerSpec } from './engine/types';
import { downloadEnterprisePackagingWorkbook } from './enterprisePackagingExcelExport';
import {
  clearEnterprisePackagingManifest,
  createEnterprisePackagingManifest,
  enterprisePackagingManifestMatchesState,
  readEnterprisePackagingManifest,
  writeEnterprisePackagingManifest,
} from './enterprisePackagingManifest';
import { readStoredState, STORAGE_UPDATED_EVENT, type StoredState } from './storage';

const PLANNER_STORAGE_KEY = 'container-loading-product-packaging-v1';

type PlannerSettings = {
  allowCustom?: boolean;
  maxGrossKg?: number;
  generatedBoxUnitCost?: number;
  familyEnabled?: boolean;
  targetBoxTypes?: number;
  maxScoreLossPct?: number;
  allowMixedResidual?: boolean;
  containerFreightCost?: number;
  handlingCostPerCarton?: number;
  newBoxSetupCost?: number;
  cartonSkuCarryCost?: number;
  currency?: string;
};

type StoredPlanner = {
  products: ProductItem[];
  boxes: BoxCatalogItem[];
  container: ContainerSpec;
  settings?: PlannerSettings;
};

function readPlanner(): StoredPlanner | null {
  try {
    const raw = window.localStorage.getItem(PLANNER_STORAGE_KEY);
    return raw ? JSON.parse(raw) as StoredPlanner : null;
  } catch {
    return null;
  }
}

function buildPlan(): { plan: EnterprisePackagingPlan; stored: StoredPlanner } | null {
  const stored = readPlanner();
  if (!stored?.products?.length) return null;
  const settings = stored.settings ?? {};
  const plan = optimizeEnterprisePackaging(stored.container, stored.products, stored.boxes ?? [], {
    ...defaultEnterprisePackagingOptions,
    packaging: {
      ...defaultEnterprisePackagingOptions.packaging,
      allowCustomBoxDesign: settings.allowCustom ?? true,
      maxGeneratedGrossWeightKg: Math.max(1, settings.maxGrossKg ?? 22),
      generatedBoxUnitCost: (settings.generatedBoxUnitCost ?? 0) > 0 ? settings.generatedBoxUnitCost : undefined,
    },
    family: {
      ...defaultEnterprisePackagingOptions.family,
      enabled: settings.familyEnabled ?? true,
      targetMaxBoxTypes: Math.max(1, Math.floor(settings.targetBoxTypes ?? 4)),
      maxAssignmentScoreLoss: Math.min(1, Math.max(0, (settings.maxScoreLossPct ?? 8) / 100)),
    },
    allowMixedResidualCartons: settings.allowMixedResidual ?? false,
    cost: {
      containerFreightCost: Math.max(0, settings.containerFreightCost ?? 0),
      handlingCostPerCarton: Math.max(0, settings.handlingCostPerCarton ?? 0),
      newBoxSetupCost: Math.max(0, settings.newBoxSetupCost ?? 0),
      cartonSkuCarryCost: Math.max(0, settings.cartonSkuCarryCost ?? 0),
      currency: settings.currency?.trim() || 'KRW',
    },
  });
  return { plan, stored };
}

function persistIfApplied(state?: StoredState | null) {
  const current = state ?? readStoredState();
  if (!current?.cargo?.length || !current.cargo.some((item) => item.id.startsWith('PKG-'))) {
    if (readEnterprisePackagingManifest()) clearEnterprisePackagingManifest();
    return;
  }
  const rebuilt = buildPlan();
  if (!rebuilt) {
    if (readEnterprisePackagingManifest()) clearEnterprisePackagingManifest();
    return;
  }
  const nextManifest = createEnterprisePackagingManifest(rebuilt.plan, rebuilt.stored.container, rebuilt.stored.products, rebuilt.stored.boxes);
  if (!enterprisePackagingManifestMatchesState(nextManifest, current.container, current.cargo)) {
    if (readEnterprisePackagingManifest()) clearEnterprisePackagingManifest();
    return;
  }
  writeEnterprisePackagingManifest(nextManifest);
}

export default function EnterprisePackagingOutputActions() {
  const [target, setTarget] = useState<Element | null>(null);

  useEffect(() => {
    const locate = () => setTarget(document.querySelector('.enterprise-packaging-result .result-head'));
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

  if (!target) return null;
  return createPortal(<button type="button" onClick={download}>포장계획 Excel</button>, target);
}
