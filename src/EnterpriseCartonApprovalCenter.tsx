import { useEffect, useMemo, useState } from 'react';
import {
  approveGeneratedCartonFamily,
  groupCartonApprovalCandidates,
  type CartonApprovalCandidateGroup,
} from './engine/cartonStrengthApproval';
import {
  buildEnterprisePackagingPlanFromPlanner,
  ENTERPRISE_PACKAGING_PLANNER_EVENT,
  readEnterprisePackagingPlannerState,
  writeEnterprisePackagingPlannerState,
  type EnterprisePackagingPlannerState,
} from './enterprisePackagingPlannerStore';

type VerificationDraft = {
  catalogId: string;
  tareWeightKg: string;
  maxTopLoadKg: string;
  maxGrossWeightKg: string;
  unitCost: string;
  stepMm: number;
};

const mm = (value: number) => Math.round(value * 1000);
const emptyVerification = (catalogId = '', stepMm = 5): VerificationDraft => ({
  catalogId,
  tareWeightKg: '',
  maxTopLoadKg: '',
  maxGrossWeightKg: '',
  unitCost: '',
  stepMm,
});

function suggestedCatalogId(group: CartonApprovalCandidateGroup | undefined) {
  if (!group) return '';
  return `VER-${mm(group.outerLength)}${mm(group.outerWidth)}${mm(group.outerHeight)}`;
}

export default function EnterpriseCartonApprovalCenter() {
  const [stored, setStored] = useState<EnterprisePackagingPlannerState | null>(null);
  const [groups, setGroups] = useState<CartonApprovalCandidateGroup[]>([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [draft, setDraft] = useState<VerificationDraft>(() => emptyVerification());
  const [message, setMessage] = useState('제조사 강도 검증이 끝난 자동설계 박스를 승인할 수 있습니다.');

  const selected = useMemo(() => groups.find((item) => item.key === selectedKey), [groups, selectedKey]);

  useEffect(() => {
    const invalidate = () => {
      setStored(null);
      setGroups([]);
      setSelectedKey('');
      setDraft(emptyVerification());
      setMessage('기업 포장 입력이 변경되었습니다. 승인 대기 규격을 다시 불러오세요.');
    };
    window.addEventListener(ENTERPRISE_PACKAGING_PLANNER_EVENT, invalidate);
    return () => window.removeEventListener(ENTERPRISE_PACKAGING_PLANNER_EVENT, invalidate);
  }, []);

  const refresh = () => {
    const current = readEnterprisePackagingPlannerState();
    if (!current?.products?.length) {
      setStored(null);
      setGroups([]);
      setSelectedKey('');
      return setMessage('먼저 기업 제품 목록을 등록하고 포장 최적화를 실행하세요.');
    }
    const plan = buildEnterprisePackagingPlanFromPlanner(current);
    const pending = groupCartonApprovalCandidates(plan.assignments);
    setStored(current);
    setGroups(pending);
    const first = pending[0];
    setSelectedKey(first?.key ?? '');
    setDraft(emptyVerification(suggestedCatalogId(first)));
    const productCount = pending.reduce((sum, group) => sum + group.productIds.length, 0);
    setMessage(pending.length
      ? `강도 미검증 물리규격 ${pending.length}종 · 적용 제품 ${productCount}종을 찾았습니다.`
      : '현재 승인 대기 중인 자동설계 규격이 없습니다.');
  };

  const choose = (key: string) => {
    const group = groups.find((item) => item.key === key);
    setSelectedKey(key);
    setDraft(emptyVerification(suggestedCatalogId(group), draft.stepMm));
  };

  const approve = () => {
    if (!stored || !selected) return setMessage('승인할 자동설계 규격을 선택하세요.');
    const tareWeightKg = draft.tareWeightKg.trim() === '' ? Number.NaN : Number(draft.tareWeightKg);
    const maxTopLoadKg = draft.maxTopLoadKg.trim() === '' ? Number.NaN : Number(draft.maxTopLoadKg);
    const maxGrossWeightKg = draft.maxGrossWeightKg.trim() === '' ? Number.NaN : Number(draft.maxGrossWeightKg);
    const unitCost = draft.unitCost.trim() === '' ? undefined : Number(draft.unitCost);
    const result = approveGeneratedCartonFamily(selected, stored.products, {
      catalogId: draft.catalogId,
      verifiedTareWeightKg: tareWeightKg,
      verifiedMaxTopLoadKg: maxTopLoadKg,
      verifiedMaxGrossWeightKg: maxGrossWeightKg,
      unitCost,
      manufacturingStepMm: draft.stepMm,
    });
    if (!result.ok) return setMessage(result.reason);
    if (stored.boxes.some((box) => box.id === result.box.id)) return setMessage(`이미 존재하는 박스 코드입니다: ${result.box.id}`);

    const success = `${result.box.id} 검증 박스를 회사 카탈로그에 등록했습니다. 제품 ${result.productCount}종 공용 · 가장 무거운 Full ${result.verifiedFullGrossWeightKg.toFixed(2)}kg · 보수적 최대 ${result.verifiedStackLayers}단 후보입니다. 전체 포장 최적화를 다시 실행하세요.`;
    const next: EnterprisePackagingPlannerState = { ...stored, boxes: [...stored.boxes, result.box] };
    setStored(null);
    setGroups([]);
    setSelectedKey('');
    setDraft(emptyVerification());
    writeEnterprisePackagingPlannerState(next, true);
    setMessage(success);
  };

  return <section className="enterprise-approval-center" aria-label="자동설계 박스 제조 강도 승인">
    <div className="approval-head">
      <div><span>PACKAGING VERIFICATION</span><h3>자동설계 박스 제조 검증 승인</h3><p>같은 물리 규격을 여러 제품이 공유하면 한 번만 승인합니다. 제조사·포장시험에서 확인한 실제 자중/강도 값을 입력해야 보유박스로 승격됩니다.</p></div>
      <button type="button" onClick={refresh}>승인 대기 규격 불러오기</button>
    </div>

    {groups.length > 0 && <div className="approval-grid">
      <div className="approval-pending-list">{groups.map((group) => <button type="button" key={group.key} className={selectedKey === group.key ? 'active' : ''} onClick={() => choose(group.key)}><b>{mm(group.outerLength)}×{mm(group.outerWidth)}×{mm(group.outerHeight)}mm</b><span>적용 제품 {group.productIds.length}종 · {group.productIds.join(', ')}</span><small>자동계산 최대 요구 {group.provisionalRequiredTopLoadKg.toFixed(0)}kg · 승인값 아님</small></button>)}</div>
      {selected && <div className="approval-form">
        <div className="approval-design-summary"><b>{mm(selected.outerLength)}×{mm(selected.outerWidth)}×{mm(selected.outerHeight)}mm 공용규격</b><span>적용 제품: {selected.productIds.join(', ')}</span><span>제품별 실제 Full 중량은 입력한 실제 박스 자중으로 재계산됩니다.</span></div>
        <label>승인 박스 코드<input value={draft.catalogId} onChange={(event) => setDraft((value) => ({ ...value, catalogId: event.target.value }))} /></label>
        <label>완성 박스 실제 자중(kg)<input type="number" min="0" step="0.01" placeholder="필수 입력" value={draft.tareWeightKg} onChange={(event) => setDraft((value) => ({ ...value, tareWeightKg: event.target.value }))} /></label>
        <label>제조사 검증 최대총중량(kg)<input type="number" min="0.01" step="0.1" placeholder="필수 입력" value={draft.maxGrossWeightKg} onChange={(event) => setDraft((value) => ({ ...value, maxGrossWeightKg: event.target.value }))} /></label>
        <label>제조사 검증 상부허용중량(kg)<input type="number" min="0" step="0.1" placeholder="필수 입력" value={draft.maxTopLoadKg} onChange={(event) => setDraft((value) => ({ ...value, maxTopLoadKg: event.target.value }))} /></label>
        <label>실제 박스 단가<input type="number" min="0" step="0.01" placeholder="선택" value={draft.unitCost} onChange={(event) => setDraft((value) => ({ ...value, unitCost: event.target.value }))} /></label>
        <label>제조 치수 단위<select value={draft.stepMm} onChange={(event) => setDraft((value) => ({ ...value, stepMm: Number(event.target.value) }))}><option value={1}>1mm</option><option value={5}>5mm</option><option value={10}>10mm</option><option value={20}>20mm</option></select></label>
        <button type="button" className="primary" onClick={approve}>검증 박스로 승인 등록</button>
        <small>승인 시 이 규격을 쓰는 모든 제품의 실제 Full 중량을 다시 계산하며, 가장 무거운 제품이 최대총중량을 넘으면 승인하지 않습니다. 외경은 선택한 제조 단위로 바깥쪽 올림됩니다.</small>
      </div>}
    </div>}
    <p className="approval-message" aria-live="polite">{message}</p>
  </section>;
}
