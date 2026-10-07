import { useMemo, useState } from 'react';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { cgCompliantAlternativeForResult } from './engine/cgCompliantPlan';
import { readLoadingStrategyPreference } from './loadingStrategyPreference';

type Choice = 'full' | 'cg';

type Props = {
  container: ContainerSpec;
  cargo: CargoItem[];
  fullResult: LoadingResult;
  onChoose: (choice: Choice, result: LoadingResult) => void;
};

function cgFinding(result: LoadingResult) {
  return (result.operationalFindings ?? []).find(f => f.code === 'CG_LONGITUDINAL' && f.severity === 'error');
}

function transportWeight(result: LoadingResult) {
  return result.securingBudget?.totalTransportWeightKg ?? result.loadedWeightKg;
}

export default function CgPlanChoice({ container, cargo, fullResult, onChoose }: Props) {
  const [selected, setSelected] = useState<Choice | null>(null);
  const finding = cgFinding(fullResult);
  const alternative = useMemo(() => {
    if (!finding) return null;
    return cgCompliantAlternativeForResult(container, cargo, fullResult, {
      strategy: readLoadingStrategyPreference() ?? 'capacity',
      publish: false,
    });
  }, [container, cargo, fullResult, finding?.value, finding?.limit]);

  if (!finding || !alternative) return null;
  const removed = alternative.removed.reduce((sum, row) => sum + row.quantity, 0);
  const removedLabel = alternative.removed.map(row => `${row.cargoId} ${row.quantity}EA`).join(' · ');

  const choose = (choice: Choice, result: LoadingResult) => {
    setSelected(choice);
    onChoose(choice, result);
  };

  return <section className="cg-plan-choice" aria-label="전체 적재안과 CG 충족안 선택">
    <header>
      <div>
        <b>길이 방향 무게중심 선택 필요</b>
        <span>전체 수량을 유지할지, 일부를 제외해 CG 허용범위를 맞출지 선택하세요.</span>
      </div>
      <strong>선택 후 관성 최종검증 진행</strong>
    </header>

    <div className="cg-plan-choice-grid">
      <article className={selected === 'full' ? 'selected' : ''}>
        <span>전체 적재안</span>
        <b>{fullResult.placements.length.toLocaleString()} EA</b>
        <dl>
          <div><dt>길이 CG</dt><dd className="bad">오류 표시 유지</dd></div>
          <div><dt>편차 / 허용</dt><dd>{((finding.value ?? 0) * 1000).toFixed(0)} / ±{((finding.limit ?? 0) * 1000).toFixed(0)} mm</dd></div>
          <div><dt>총 운송중량</dt><dd>{transportWeight(fullResult).toFixed(1)} kg</dd></div>
          <div><dt>제외 수량</dt><dd>0 EA</dd></div>
        </dl>
        <button type="button" onClick={() => choose('full', fullResult)}>전체 적재안 선택</button>
      </article>

      <article className={selected === 'cg' ? 'selected' : ''}>
        <span>CG 충족안</span>
        <b>{alternative.result.placements.length.toLocaleString()} EA</b>
        <dl>
          <div><dt>길이 CG</dt><dd className="good">허용범위 이내</dd></div>
          <div><dt>제외 수량</dt><dd>{removed.toLocaleString()} EA · CG_LIMIT</dd></div>
          <div><dt>총 운송중량</dt><dd>{transportWeight(alternative.result).toFixed(1)} kg</dd></div>
          <div><dt>제외 품목</dt><dd>{removedLabel || '-'}</dd></div>
        </dl>
        <button type="button" className="primary" onClick={() => choose('cg', alternative.result)}>CG 충족안 선택</button>
      </article>
    </div>

    <p>전체 적재안을 선택하면 CG 오류를 숨기지 않고 결과와 작업지시서에 유지합니다. CG 충족안을 선택하면 제외 수량을 CG_LIMIT으로 기록합니다.</p>
  </section>;
}
