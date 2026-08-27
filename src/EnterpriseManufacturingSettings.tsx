import { useEffect, useState } from 'react';
import {
  ENTERPRISE_PACKAGING_PLANNER_EVENT,
  readEnterprisePackagingPlannerState,
  writeEnterprisePackagingPlannerState,
} from './enterprisePackagingPlannerStore';

const STEPS = [1, 5, 10, 20] as const;

export default function EnterpriseManufacturingSettings() {
  const [stepMm, setStepMm] = useState(5);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('자동설계 박스와 공용박스 규격에 동일하게 적용됩니다.');

  const sync = () => {
    const stored = readEnterprisePackagingPlannerState();
    if (!stored) {
      setReady(false);
      setStepMm(5);
      return;
    }
    const next = Number(stored.settings?.generatedDimensionStepMm ?? 5);
    setStepMm(STEPS.includes(next as typeof STEPS[number]) ? next : 5);
    setReady(true);
  };

  useEffect(() => {
    sync();
    const onUpdated = () => sync();
    window.addEventListener(ENTERPRISE_PACKAGING_PLANNER_EVENT, onUpdated);
    const timer = window.setTimeout(sync, 50);
    return () => {
      window.removeEventListener(ENTERPRISE_PACKAGING_PLANNER_EVENT, onUpdated);
      window.clearTimeout(timer);
    };
  }, []);

  const changeStep = (next: number) => {
    const stored = readEnterprisePackagingPlannerState();
    if (!stored) {
      setMessage('먼저 제품 또는 기업 포장 데이터를 등록하세요.');
      return;
    }
    const safe = STEPS.includes(next as typeof STEPS[number]) ? next : 5;
    writeEnterprisePackagingPlannerState({
      ...stored,
      settings: { ...stored.settings, generatedDimensionStepMm: safe },
    }, true);
    setStepMm(safe);
    setReady(true);
    setMessage(`${safe}mm 제조 그리드 적용 · 기존 분석 결과는 다시 계산해야 합니다.`);
  };

  return <section className="enterprise-manufacturing-settings" aria-label="자동박스 제조 규격 설정">
    <div><span>MANUFACTURING GRID</span><h3>박스 제조 치수 단위</h3><p>자동설계 내·외경과 공용 박스 규격을 항상 이 단위의 위쪽 값으로 맞춥니다. 제품 수용공간을 줄이는 반올림은 하지 않습니다.</p></div>
    <label>제조 단위<select value={stepMm} disabled={!ready} onChange={(event) => changeStep(Number(event.target.value))}>{STEPS.map((step) => <option key={step} value={step}>{step}mm</option>)}</select></label>
    <small role="status">{ready ? message : '기업 포장 데이터가 생성되면 설정할 수 있습니다.'}</small>
  </section>;
}
