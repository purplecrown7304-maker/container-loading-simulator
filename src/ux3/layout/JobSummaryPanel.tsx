type Props = {
  equipmentName: string;
  dimensions: string;
  requestedQty: number;
  selectedKinds: number;
  loadedQty: number;
  remainingQty: number;
  fillRate: number;
  weightRate: number;
  loadedWeightKg: number;
  hardFailure: boolean;
  warning: boolean;
};

export default function JobSummaryPanel({ equipmentName, dimensions, requestedQty, selectedKinds, loadedQty, remainingQty, fillRate, weightRate, loadedWeightKg, hardFailure, warning }: Props) {
  const tone = hardFailure ? 'danger' : warning ? 'warning' : 'success';
  return <aside className="ux3-summary-panel" aria-label="현재 작업 요약">
    <section><span>장비</span><b>{equipmentName}</b><small>{dimensions}</small></section>
    <section><span>화물</span><b>{requestedQty} EA</b><small>{selectedKinds}종 선택</small></section>
    <section><span>현재 결과</span><b>{loadedQty} EA 적재</b><small>{remainingQty} EA 미적재</small></section>
    <section><span>용적 / 중량</span><b>{fillRate.toFixed(1)}% / {weightRate.toFixed(1)}%</b><small>{loadedWeightKg.toLocaleString()} kg</small></section>
    <section className={`ux3-summary-status ${tone}`}><span>판정</span><b>{hardFailure ? '안전 실패 확인' : warning ? '경고 확인' : '양호'}</b><small>작업지시서 생성은 항상 가능</small></section>
  </aside>;
}
