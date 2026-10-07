import { useMemo, useState } from 'react';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { cgCompliantAlternativeForResult } from './engine/cgCompliantPlan';
import { writeManualOverride } from './engine/manualOverride';
import { readLoadingStrategyPreference } from './loadingStrategyPreference';
import { STORAGE_UPDATED_EVENT, type StoredState } from './storage';
import { clearLatestInertiaCertification } from './inertiaCertification';
import { clearPhysicsTarget } from './physicsTarget';

type Props = {
  container: ContainerSpec;
  cargo: CargoItem[];
  result: LoadingResult;
  onApplied?: (result: LoadingResult) => void;
};

function cgError(result: LoadingResult) {
  return (result.operationalFindings ?? []).find(finding => finding.code === 'CG_LONGITUDINAL' && finding.severity === 'error');
}

function transportWeight(result: LoadingResult) {
  return result.securingBudget?.totalTransportWeightKg ?? result.loadedWeightKg;
}

export default function CgPlanChoice({ container, cargo, result, onApplied }: Props) {
  const [selected, setSelected] = useState<'full' | 'cg' | null>(null);
  const error = cgError(result);
  const alternative = useMemo(() => {
    if (!error) return null;
    return cgCompliantAlternativeForResult(container, cargo, result, {
      strategy: readLoadingStrategyPreference() ?? 'capacity',
      publish: false,
    });
  }, [container, cargo, result, error?.value, error?.limit]);

  if (!error || !alternative) return null;
  const removed = alternative.removed.reduce((sum, row) => sum + row.quantity, 0);
  const apply = (kind: 'full' | 'cg') => {
    setSelected(kind);
    if (kind === 'full') {
      onApplied?.(result);
      return;
    }
    clearLatestInertiaCertification();
    clearPhysicsTarget();
    writeManualOverride(container, cargo, alternative.result);
    window.dispatchEvent(new CustomEvent<StoredState>(STORAGE_UPDATED_EVENT, { detail: { container, cargo } }));
    onApplied?.(alternative.result);
  };

  return <section className="cg-plan-choice" aria-label="전체 적재안과 무게중심 충족안 비교">
    <header>
      <div><b>적재안 선택</b><span>적재수량을 유지한 전체안과 길이방향 CG 충족안을 비교합니다.</span></div>
      <strong>사용자 선택</strong>
    </header>
    <div className="cg-plan-choice-grid">
      <article className={selected === 'full' ? 'selected' : ''}>
        <span>전체 적재안</span>
        <b>{result.placements.length.toLocaleString()} EA</b>
        <dl>
          <div><dt>총 운송중량</dt><dd>{transportWeight(result).toFixed(1)} kg</dd></div>
          <div><dt>길이 CG</dt><dd className="bad">오류 표시 유지</dd></div>
          <div><dt>편차 / 허용</dt><dd>{((error.value ?? 0) * 1000).toFixed(0)} / ±{((error.limit ?? 0) * 1000).toFixed(0)} mm</dd></div>
        </dl>
        <button type="button" onClick={() => apply('full')}>전체안 선택</button>
      </article>
      <article className={selected === 'cg' ? 'selected' : ''}>
        <span>CG 충족안</span>
        <b>{alternative.result.placements.length.toLocaleString()} EA</b>
        <dl>
          <div><dt>총 운송중량</dt><dd>{transportWeight(alternative.result).toFixed(1)} kg</dd></div>
          <div><dt>길이 CG</dt><dd className="good">허용범위 이내</dd></div>
          <div><dt>CG 제외</dt><dd>{removed.toLocaleString()} EA · CG_LIMIT</dd></div>
        </dl>
        <button type="button" className="primary" onClick={() => apply('cg')}>CG 충족안 선택</button>
      </article>
    </div>
    <p>CG 충족안을 선택하면 해당 배치를 현재 계획으로 적용하고 기존 관성 검증은 무효화합니다. 새 배치 기준으로 다시 검증해야 합니다.</p>
  </section>;
}
