import { useMemo, useState } from 'react';
import { defaultEnterprisePackagingOptions, optimizeEnterprisePackaging, type EnterprisePackagingOptions } from './engine/enterprisePackagingOptimizer';
import { approveGeneratedCarton } from './engine/generatedCartonApproval';
import type { BoxCatalogItem, ProductItem, ProductPackagingAssignment } from './engine/productPackagingOptimizer';
import type { ContainerSpec } from './engine/types';
import { readStoredState } from './storage';

const PLANNER_STORAGE_KEY = 'container-loading-product-packaging-v1';
const defaultContainer: ContainerSpec = { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500, floorLoadLimitKgPerM2: 1500, floorLoadWarningMultiplier: 3 };

type PlannerSettings = {
  allowCustom?: boolean; maxGrossKg?: number; generatedBoxUnitCost?: number;
  familyEnabled?: boolean; targetBoxTypes?: number; maxScoreLossPct?: number; allowMixedResidual?: boolean;
  containerFreightCost?: number; handlingCostPerCarton?: number; newBoxSetupCost?: number; cartonSkuCarryCost?: number; currency?: string;
};
type StoredPlanner = { products?: ProductItem[]; boxes?: BoxCatalogItem[]; container?: ContainerSpec; settings?: PlannerSettings };

type ApprovalDraft = {
  catalogId: string;
  catalogName: string;
  tareWeightKg: number;
  maxGrossWeightKg: number;
  verifiedTopLoadKg: number;
  unitCost: number | '';
};

function readPlanner(): StoredPlanner | null {
  try {
    const raw = localStorage.getItem(PLANNER_STORAGE_KEY);
    return raw ? JSON.parse(raw) as StoredPlanner : null;
  } catch {
    return null;
  }
}

function optionsFrom(settings: PlannerSettings | undefined): EnterprisePackagingOptions {
  return {
    ...defaultEnterprisePackagingOptions,
    packaging: {
      ...defaultEnterprisePackagingOptions.packaging,
      allowCustomBoxDesign: settings?.allowCustom ?? true,
      maxGeneratedGrossWeightKg: Math.max(1, settings?.maxGrossKg ?? defaultEnterprisePackagingOptions.packaging.maxGeneratedGrossWeightKg),
      generatedBoxUnitCost: (settings?.generatedBoxUnitCost ?? 0) > 0 ? settings?.generatedBoxUnitCost : undefined,
    },
    family: {
      ...defaultEnterprisePackagingOptions.family,
      enabled: settings?.familyEnabled ?? true,
      targetMaxBoxTypes: Math.max(1, Math.floor(settings?.targetBoxTypes ?? defaultEnterprisePackagingOptions.family.targetMaxBoxTypes)),
      maxAssignmentScoreLoss: Math.min(1, Math.max(0, (settings?.maxScoreLossPct ?? 8) / 100)),
    },
    allowMixedResidualCartons: settings?.allowMixedResidual ?? false,
    cost: {
      containerFreightCost: Math.max(0, settings?.containerFreightCost ?? 0),
      handlingCostPerCarton: Math.max(0, settings?.handlingCostPerCarton ?? 0),
      newBoxSetupCost: Math.max(0, settings?.newBoxSetupCost ?? 0),
      cartonSkuCarryCost: Math.max(0, settings?.cartonSkuCarryCost ?? 0),
      currency: settings?.currency?.trim() || 'KRW',
    },
  };
}

function initialDraft(item: ProductPackagingAssignment): ApprovalDraft {
  return {
    catalogId: `VER-${item.boxId}`,
    catalogName: `검증 ${item.boxName}`,
    tareWeightKg: Math.max(0.1, Math.round((item.grossWeightKg * 0.04) * 100) / 100),
    maxGrossWeightKg: Math.ceil(item.grossWeightKg),
    verifiedTopLoadKg: Math.ceil(item.requiredTopLoadKg),
    unitCost: item.boxUnitCost ?? '',
  };
}

const mm = (value: number) => Math.round(value * 1000);

export default function GeneratedCartonApprovalPanel() {
  const stored = useMemo(() => typeof window === 'undefined' ? null : readPlanner(), []);
  const products = stored?.products ?? [];
  const boxes = stored?.boxes ?? [];
  const container = stored?.container ?? readStoredState()?.container ?? defaultContainer;
  const plan = useMemo(() => products.length ? optimizeEnterprisePackaging(container, products, boxes, optionsFrom(stored?.settings)) : null, [stored]);
  const generated = useMemo(() => {
    const map = new Map<string, ProductPackagingAssignment>();
    for (const assignment of plan?.assignments ?? []) {
      if (assignment.source === 'generated' && assignment.strengthStatus === 'design-target' && !map.has(assignment.boxId)) map.set(assignment.boxId, assignment);
    }
    return [...map.values()];
  }, [plan]);
  const [selectedId, setSelectedId] = useState(generated[0]?.boxId ?? '');
  const selected = generated.find((item) => item.boxId === selectedId) ?? generated[0];
  const [drafts, setDrafts] = useState<Record<string, ApprovalDraft>>(() => Object.fromEntries(generated.map((item) => [item.boxId, initialDraft(item)])));
  const [message, setMessage] = useState(generated.length ? '제조사 시험/사양서에서 받은 실제 강도값을 입력한 뒤 검증 박스로 등록하세요.' : '현재 최적안에는 제조 강도 승인이 필요한 자동설계 박스가 없습니다.');

  if (!generated.length) return null;
  const draft = selected ? (drafts[selected.boxId] ?? initialDraft(selected)) : undefined;
  const updateDraft = (patch: Partial<ApprovalDraft>) => {
    if (!selected || !draft) return;
    setDrafts((current) => ({ ...current, [selected.boxId]: { ...draft, ...patch } }));
  };

  const approve = () => {
    if (!selected || !draft) return;
    const approved = approveGeneratedCarton(selected, {
      catalogId: draft.catalogId,
      catalogName: draft.catalogName,
      tareWeightKg: draft.tareWeightKg,
      maxGrossWeightKg: draft.maxGrossWeightKg,
      verifiedTopLoadKg: draft.verifiedTopLoadKg,
      unitCost: draft.unitCost === '' ? undefined : draft.unitCost,
    });
    if (!approved.box || approved.error) return setMessage(approved.error ?? '검증 박스를 만들지 못했습니다.');
    const latest = readPlanner();
    const currentBoxes = latest?.boxes ?? boxes;
    if (currentBoxes.some((box) => box.id === approved.box!.id)) return setMessage(`이미 존재하는 박스 코드입니다: ${approved.box.id}`);
    const strengthText = approved.meetsDesignTarget
      ? '설계 목표 상부하중 이상을 확인했습니다.'
      : `검증 상부하중이 설계 목표 ${selected.requiredTopLoadKg.toFixed(1)}kg보다 낮습니다. 실제 적층단은 입력 강도 기준으로 자동 축소됩니다.`;
    if (!window.confirm(`${approved.box.id}를 검증된 보유 박스로 등록할까요?\n${strengthText}\n등록 후 포장 최적화를 다시 계산합니다.`)) return;
    const next: StoredPlanner = {
      products: latest?.products ?? products,
      boxes: [...currentBoxes, approved.box],
      container: latest?.container ?? container,
      settings: latest?.settings ?? stored?.settings,
    };
    localStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify(next));
    window.location.reload();
  };

  return <section className="generated-carton-approval" aria-label="자동설계 박스 제조 강도 승인">
    <header><div><span>MANUFACTURER VALIDATION</span><h2>자동설계 박스 → 검증된 보유박스 승격</h2><p>자동설계 규격은 제조 강도 확인 전 1단 적재만 허용됩니다. 제조사 시험/사양서의 실제 자중·총중량·상부 허용중량을 입력하면 카탈로그 박스로 승격해 다단 적재를 다시 계산합니다.</p></div></header>
    <div className="approval-grid">
      <label>승인할 자동규격<select value={selected?.boxId ?? ''} onChange={(e) => setSelectedId(e.target.value)}>{generated.map((item) => <option key={item.boxId} value={item.boxId}>{item.boxId} · {mm(item.outerLength)}×{mm(item.outerWidth)}×{mm(item.outerHeight)}mm</option>)}</select></label>
      {selected && draft && <>
        <label>검증 박스 코드<input value={draft.catalogId} onChange={(e) => updateDraft({ catalogId: e.target.value })} /></label>
        <label>검증 박스 이름<input value={draft.catalogName} onChange={(e) => updateDraft({ catalogName: e.target.value })} /></label>
        <label>실제 자중(kg)<input type="number" min="0" step="0.01" value={draft.tareWeightKg} onChange={(e) => updateDraft({ tareWeightKg: Number(e.target.value) })} /></label>
        <label>검증 최대총중량(kg)<input type="number" min="0.01" step="0.1" value={draft.maxGrossWeightKg} onChange={(e) => updateDraft({ maxGrossWeightKg: Number(e.target.value) })} /></label>
        <label>검증 상부허용중량(kg)<input type="number" min="0" step="0.1" value={draft.verifiedTopLoadKg} onChange={(e) => updateDraft({ verifiedTopLoadKg: Number(e.target.value) })} /></label>
        <label>실제 단가<input type="number" min="0" step="0.01" value={draft.unitCost} onChange={(e) => updateDraft({ unitCost: e.target.value === '' ? '' : Number(e.target.value) })} /></label>
      </>}
    </div>
    {selected && <div className="approval-target"><b>설계 요구치</b><span>외경 {mm(selected.outerLength)}×{mm(selected.outerWidth)}×{mm(selected.outerHeight)}mm</span><span>현재 설계 총중량 {selected.grossWeightKg.toFixed(2)}kg</span><span>치수상 추천 {selected.recommendedStackLayers}단</span><span>목표 상부하중 {selected.requiredTopLoadKg.toFixed(1)}kg</span></div>}
    <div className="approval-actions"><button className="primary" onClick={approve}>검증값으로 보유박스 등록</button><small>등록 후 현재 자동설계 결과는 폐기하고 새 카탈로그 조건으로 다시 최적화합니다.</small></div>
    <p className="approval-message" role="status">{message}</p>
  </section>;
}
