import { useEffect, useMemo, useState } from 'react';
import { approveGeneratedCarton } from './engine/cartonStrengthApproval';
import type { ProductPackagingAssignment } from './engine/productPackagingOptimizer';
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

export default function EnterpriseCartonApprovalCenter() {
  const [stored, setStored] = useState<EnterprisePackagingPlannerState | null>(null);
  const [assignments, setAssignments] = useState<ProductPackagingAssignment[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<VerificationDraft>(() => emptyVerification());
  const [message, setMessage] = useState('제조사 강도 검증이 끝난 자동설계 박스를 승인할 수 있습니다.');

  const selected = useMemo(() => assignments.find((item) => item.productId === selectedId), [assignments, selectedId]);
  const product = useMemo(() => stored?.products.find((item) => item.id === selected?.productId), [stored, selected]);

  useEffect(() => {
    const invalidate = () => {
      setStored(null);
      setAssignments([]);
      setSelectedId('');
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
      setAssignments([]);
      setSelectedId('');
      return setMessage('먼저 기업 제품 목록을 등록하고 포장 최적화를 실행하세요.');
    }
    const plan = buildEnterprisePackagingPlanFromPlanner(current);
    const pending = plan.assignments.filter((item) => item.strengthStatus === 'design-target');
    setStored(current);
    setAssignments(pending);
    const first = pending[0];
    setSelectedId(first?.productId ?? '');
    setDraft(emptyVerification(first ? `VER-${first.boxId}` : ''));
    setMessage(pending.length ? `강도 미검증 자동/공용 규격 ${pending.length}건을 찾았습니다.` : '현재 승인 대기 중인 자동설계 규격이 없습니다.');
  };

  const choose = (productId: string) => {
    const assignment = assignments.find((item) => item.productId === productId);
    setSelectedId(productId);
    setDraft(emptyVerification(assignment ? `VER-${assignment.boxId}` : '', draft.stepMm));
  };

  const approve = () => {
    if (!stored || !selected || !product) return setMessage('승인할 자동설계 규격을 선택하세요.');
    const tareWeightKg = draft.tareWeightKg.trim() === '' ? Number.NaN : Number(draft.tareWeightKg);
    const maxTopLoadKg = draft.maxTopLoadKg.trim() === '' ? Number.NaN : Number(draft.maxTopLoadKg);
    const maxGrossWeightKg = draft.maxGrossWeightKg.trim() === '' ? Number.NaN : Number(draft.maxGrossWeightKg);
    const unitCost = draft.unitCost.trim() === '' ? undefined : Number(draft.unitCost);
    const result = approveGeneratedCarton(selected, product, {
      catalogId: draft.catalogId,
      verifiedTareWeightKg: tareWeightKg,
      verifiedMaxTopLoadKg: maxTopLoadKg,
      verifiedMaxGrossWeightKg: maxGrossWeightKg,
      unitCost,
      manufacturingStepMm: draft.stepMm,
    });
    if (!result.ok) return setMessage(result.reason);
    if (stored.boxes.some((box) => box.id === result.box.id)) return setMessage(`이미 존재하는 박스 코드입니다: ${result.box.id}`);

    const success = `${result.box.id} 검증 박스를 회사 카탈로그에 등록했습니다. 실제 자중 반영 Full ${result.verifiedFullGrossWeightKg.toFixed(2)}kg · 검증값 기준 최대 ${result.verifiedStackLayers}단 후보입니다. 전체 포장 최적화를 다시 실행하세요.`;
    const next: EnterprisePackagingPlannerState = { ...stored, boxes: [...stored.boxes, result.box] };
    // 먼저 이 컴포넌트의 로컬 상태를 정리한 뒤 공용 이벤트를 보낸다.
    setStored(null);
    setAssignments([]);
    setSelectedId('');
    setDraft(emptyVerification());
    setMessage(success);
    writeEnterprisePackagingPlannerState(next, true);
  };

  return <section className="enterprise-approval-center" aria-label="자동설계 박스 제조 강도 승인">
    <div className="approval-head">
      <div><span>PACKAGING VERIFICATION</span><h3>자동설계 박스 제조 검증 승인</h3><p>자동 계산된 요구강도/임시자중이 아니라 제조사·포장시험에서 확인한 실제 값을 입력해야 보유박스로 승격됩니다.</p></div>
      <button type="button" onClick={refresh}>승인 대기 규격 불러오기</button>
    </div>

    {assignments.length > 0 && <div className="approval-grid">
      <div className="approval-pending-list">{assignments.map((item) => <button type="button" key={item.productId} className={selectedId === item.productId ? 'active' : ''} onClick={() => choose(item.productId)}><b>{item.productId}</b><span>{item.boxName}</span><small>{mm(item.outerLength)}×{mm(item.outerWidth)}×{mm(item.outerHeight)}mm · 설계요구 {item.requiredTopLoadKg.toFixed(0)}kg</small></button>)}</div>
      {selected && product && <div className="approval-form">
        <div className="approval-design-summary"><b>{selected.productName}</b><span>자동설계 임시 Full {selected.grossWeightKg.toFixed(2)}kg · 설계목표 {selected.recommendedStackLayers}단</span><span>자동계산 요구 상부하중 {selected.requiredTopLoadKg.toFixed(1)}kg · 승인값 아님</span></div>
        <label>승인 박스 코드<input value={draft.catalogId} onChange={(event) => setDraft((value) => ({ ...value, catalogId: event.target.value }))} /></label>
        <label>완성 박스 실제 자중(kg)<input type="number" min="0" step="0.01" placeholder="필수 입력" value={draft.tareWeightKg} onChange={(event) => setDraft((value) => ({ ...value, tareWeightKg: event.target.value }))} /></label>
        <label>제조사 검증 최대총중량(kg)<input type="number" min="0.01" step="0.1" placeholder="필수 입력" value={draft.maxGrossWeightKg} onChange={(event) => setDraft((value) => ({ ...value, maxGrossWeightKg: event.target.value }))} /></label>
        <label>제조사 검증 상부허용중량(kg)<input type="number" min="0" step="0.1" placeholder="필수 입력" value={draft.maxTopLoadKg} onChange={(event) => setDraft((value) => ({ ...value, maxTopLoadKg: event.target.value }))} /></label>
        <label>실제 박스 단가<input type="number" min="0" step="0.01" placeholder="선택" value={draft.unitCost} onChange={(event) => setDraft((value) => ({ ...value, unitCost: event.target.value }))} /></label>
        <label>제조 치수 단위<select value={draft.stepMm} onChange={(event) => setDraft((value) => ({ ...value, stepMm: Number(event.target.value) }))}><option value={1}>1mm</option><option value={5}>5mm</option><option value={10}>10mm</option><option value={20}>20mm</option></select></label>
        <button type="button" className="primary" onClick={approve}>검증 박스로 승인 등록</button>
        <small>승인 후 외경은 선택한 제조 단위로 바깥쪽 올림됩니다. 제품 수용공간은 줄이지 않으며, 실제 자중으로 총중량과 적층 가능단을 다시 계산합니다.</small>
      </div>}
    </div>}
    <p className="approval-message" aria-live="polite">{message}</p>
  </section>;
}
