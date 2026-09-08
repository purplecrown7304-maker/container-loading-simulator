import { WORKFLOW_STEPS, type WorkflowStep } from '../types';

type Props = {
  step: WorkflowStep;
  furthestStep: WorkflowStep;
  equipmentName: string;
  loadingModeLabel: string;
  selectedKinds: number;
  requestedQty: number;
  loadedQty: number;
  onStep: (step: WorkflowStep) => void;
  onReset: () => void;
};

export default function WorkflowSidebar({ step, furthestStep, equipmentName, loadingModeLabel, selectedKinds, requestedQty, loadedQty, onStep, onReset }: Props) {
  return <aside className="ux3-sidebar" aria-label="작업 단계">
    <div className="ux3-step-list">
      {WORKFLOW_STEPS.map(item => {
        const enabled = item.id <= furthestStep;
        return <button key={item.id} type="button" className={`ux3-step ${step === item.id ? 'active' : ''} ${enabled ? '' : 'locked'}`} disabled={!enabled} onClick={() => onStep(item.id)}>
          <span className="ux3-step-number">{item.id}</span>
          <span><b>{item.label}</b><small>{item.hint}</small></span>
          {item.id < furthestStep ? <em>✓</em> : null}
        </button>;
      })}
    </div>
    <section className="ux3-current-job">
      <h2>현재 작업</h2>
      <dl>
        <div><dt>장비</dt><dd>{equipmentName}</dd></div>
        <div><dt>적재 방식</dt><dd>{loadingModeLabel}</dd></div>
        <div><dt>품목</dt><dd>{selectedKinds}종</dd></div>
        <div><dt>요청</dt><dd>{requestedQty} EA</dd></div>
        <div><dt>현재 적재</dt><dd>{loadedQty} EA</dd></div>
      </dl>
      <button className="ux3-ghost-button ux3-danger-text" type="button" onClick={onReset}>전체 초기화</button>
    </section>
  </aside>;
}
