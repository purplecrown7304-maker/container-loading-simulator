import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { useLoadingRuleset } from './loadingRulesPreference';
import { uiText as uiT, useUiLanguage } from './uiLanguage';
import {
  dismissVehicleSplitNotice,
  endVehicleSplit,
  nextVehicleCount,
  selectSplitVehicle,
  startVehicleSplit,
  useVehicleSplitSnapshot,
  vehicleShareSummaries,
  type VehicleRecord,
} from './vehicleSplitState';
import { verificationStatusLabel, type WorkflowVerificationState } from './workflowVerificationState';
import './vehicle-split.css';

type Props = {
  container: ContainerSpec;
  cargo: CargoItem[];
  result?: LoadingResult;
  mode: 'boxes' | 'pallets' | 'mixed';
  verification: WorkflowVerificationState;
};

const RECORD_LABEL: Record<VehicleRecord['status'], string> = {
  passed: '검증 통과 기록',
  failed: '검증 실패 기록',
  review: 'WHAT-IF 검토 기록',
};

/** Whether the rule applies to this job: legacy direct-box loading under strict limits (AGENTS.md 2L). */
export function vehicleSplitApplies(container: ContainerSpec, mode: Props['mode'], ruleset: string) {
  return mode === 'boxes' && ruleset !== 'a-v1' && !container.limitReview;
}

/**
 * Offers to divide cargo that one vehicle cannot carry, and switches between the vehicles
 * of a divided job. It only chooses which share is the job's cargo; the plan, the checks and
 * the verification of each vehicle are the ordinary ones.
 */
export default function VehicleSplitPanel({ container, cargo, result, mode, verification }: Props) {
  useUiLanguage();
  const ruleset = useLoadingRuleset();
  const { split, notice } = useVehicleSplitSnapshot();
  const running = verification.status === 'running';
  const waiting = result?.remaining.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  // Dividing helps only where one vehicle carried something: cargo that no vehicle can take
  // (too large, not loadable at all) stays waiting with its reason as before.
  const loaded = result?.placements.length ?? 0;
  const shortOfOneVehicle = loaded > 0 && !running && (waiting > 0 || verification.status === 'failed');
  const next = vehicleSplitApplies(container, mode, ruleset) && shortOfOneVehicle ? nextVehicleCount(split, cargo) : null;

  const noticeNode = notice ? <p className="vehicle-split-notice" role="status">
    <span>{uiT(notice)}</span>
    <button type="button" data-vehicle-split-action="dismiss" onClick={dismissVehicleSplitNotice}>{uiT("닫기")}</button>
  </p> : null;

  if (!split) {
    if (!next) return noticeNode ? <section className="vehicle-split-panel" data-vehicle-split="notice" aria-label={uiT("차량 나누기")}>{noticeNode}</section> : null;
    return <section className="vehicle-split-panel" data-vehicle-split="offer" aria-label={uiT("차량 나누기")}>
      {noticeNode}
      <b>{waiting > 0 ? uiT("한 대에 다 싣지 못했습니다") : uiT("이 적재는 운송 검증을 통과하지 못했습니다")}</b>
      <p>{waiting > 0
        ? uiT("미적재 {0} EA가 남았습니다. 차량 {1}대로 나누면 품목마다 고르게 나눠 차량별로 다시 계산하고 검증합니다.", [waiting.toLocaleString(), next])
        : uiT("차량 {0}대로 나누면 품목마다 고르게 나눠 더 낮게 싣고 차량별로 다시 계산하고 검증합니다.", [next])}</p>
      <button type="button" className="vehicle-split-primary" data-vehicle-split-action="start" onClick={() => startVehicleSplit(next)}>{uiT("차량 {0}대로 나누기", [next])}</button>
    </section>;
  }

  const summaries = vehicleShareSummaries(split);
  return <section className="vehicle-split-panel" data-vehicle-split="active" data-vehicle-active={split.active + 1} data-vehicle-count={split.vehicleCount} aria-label={uiT("차량 나누기")}>
    <div className="vehicle-split-head"><b>{uiT("차량 {0} / {1}", [split.active + 1, split.vehicleCount])}</b><span>{uiT("품목마다 고르게 나눈 화물")}</span></div>
    <div className="vehicle-split-tabs" role="tablist" aria-label={uiT("차량 선택")}>
      {summaries.map(item => {
        const active = item.index === split.active;
        const status = active ? verificationStatusLabel(verification) : item.record ? RECORD_LABEL[item.record.status] : '계산 전';
        const tone = active ? verification.status : item.record?.status ?? 'unrun';
        return <button key={item.index} type="button" role="tab" aria-selected={active} className={active ? 'active' : ''}
          data-vehicle-index={item.index + 1} data-vehicle-status={tone} disabled={running && !active}
          onClick={() => selectSplitVehicle(item.index)}>
          <b>{uiT("차량 {0}", [item.index + 1])}</b>
          <small>{item.units.toLocaleString()} EA · {Math.round(item.weightKg).toLocaleString()} kg</small>
          <i>{uiT(status)}</i>
        </button>;
      })}
    </div>
    <p className="vehicle-split-help">{uiT("차량을 바꾸면 그 차량의 화물로 다시 계산하고 검증합니다. 작업지시서는 차량마다 따로 출력하세요.")}</p>
    <div className="vehicle-split-actions">
      {next && <button type="button" data-vehicle-split-action="more" disabled={running} onClick={() => startVehicleSplit(next)}>{uiT("차량 {0}대로 다시 나누기", [next])}</button>}
      <button type="button" data-vehicle-split-action="end" disabled={running} onClick={() => endVehicleSplit()}>{uiT("한 대로 되돌리기")}</button>
    </div>
  </section>;
}
