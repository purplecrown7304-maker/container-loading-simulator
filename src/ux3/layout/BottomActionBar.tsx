import { WORKFLOW_STEPS, type WorkflowStep } from '../types';

type Props = {
  step: WorkflowStep;
  requestedQty: number;
  running: boolean;
  onBack: () => void;
  onNext: () => void;
  onRun: () => void;
  onWorkOrder: () => void;
  onViewer: () => void;
};

export default function BottomActionBar({ step, requestedQty, running, onBack, onNext, onRun, onWorkOrder, onViewer }: Props) {
  const primary = step === 1
    ? <button className="ux3-primary-button" type="button" onClick={onNext}>화물 선택으로</button>
    : step === 2
      ? <button className="ux3-primary-button" type="button" disabled={requestedQty <= 0} onClick={onNext}>자동 적재로</button>
      : step === 3
        ? <button className="ux3-primary-button" type="button" disabled={running || requestedQty <= 0} onClick={onRun}>{running ? '적재 계산 중…' : '자동 적재 실행'}</button>
        : <button className="ux3-primary-button" type="button" onClick={onWorkOrder}>작업지시서 열기</button>;

  return <footer className="ux3-bottom-bar">
    <div><span>STEP {step} / 4</span><b>{WORKFLOW_STEPS[step - 1]?.label}</b></div>
    <div className="ux3-bottom-actions">
      {step > 1 && <button type="button" className="ux3-secondary-button" onClick={onBack}>이전</button>}
      {step === 4 && <button type="button" className="ux3-secondary-button" onClick={onViewer}>3D 다시 보기</button>}
      {primary}
    </div>
  </footer>;
}
