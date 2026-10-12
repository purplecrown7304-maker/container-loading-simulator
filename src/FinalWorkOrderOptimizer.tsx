import { inspectionProgressText } from './inspectionPresentation';
import { uiText as uiT, uiMessage, useUiLanguage } from './uiLanguage';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyPalletAdaptiveCandidate,
  baselinePalletCandidate,
  betterPalletEvaluation,
  buildPalletAdaptiveCandidates,
  palletCertificationRisk,
  readPalletSnapshot,
  type EvaluatedPalletCandidate,
} from './engine/palletAdaptiveSearch';
import { createPhysicsTargetSignature, runInertiaCertification, type CertificationProgress } from './inertiaCertification';
import {
  assessWorkOrderCertification,
  completeCertificationForWorkOrder,
  workOrderTargetApprovalLabel,
  physicsTargetHardFailureReasons,
  isInertiaCertificationComplete,
  isPhysicsTargetVerified,
} from './inertiaWorkOrderPolicy';
import { openPalletLoadingReport as openPalletLoadingReportV2 } from './palletWorkerReportV2';
import { readPhysicsTarget } from './physicsTarget';
import { REQUEST_FINAL_WORK_ORDER_EVENT, type FinalWorkOrderRequest } from './finalWorkOrderEvents';

const MAX_PALLET_WORK_ORDER_CANDIDATES = 8;

function betterWorkOrderEvaluation(a: EvaluatedPalletCandidate, b: EvaluatedPalletCandidate) {
  const aStatic = physicsTargetHardFailureReasons(a.target).length === 0;
  const bStatic = physicsTargetHardFailureReasons(b.target).length === 0;
  if (aStatic !== bStatic) return aStatic;
  if (a.certification.payloadWithinLimit !== b.certification.payloadWithinLimit) return a.certification.payloadWithinLimit;
  const aComplete = isInertiaCertificationComplete(a.certification), bComplete = isInertiaCertificationComplete(b.certification);
  if (aComplete !== bComplete) return aComplete;
  const aPassed = isPhysicsTargetVerified(a.target, a.certification), bPassed = isPhysicsTargetVerified(b.target, b.certification);
  if (aPassed !== bPassed) return aPassed;
  return betterPalletEvaluation(a, b);
}

export default function FinalWorkOrderOptimizer() {
  useUiLanguage();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [attempt, setAttempt] = useState({ index: 0, total: 0, label: '' });
  const [progress, setProgress] = useState<CertificationProgress | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const runId = useRef(0);

  const execute = useCallback(async (_detail: FinalWorkOrderRequest) => {
    const id = ++runId.current;
    const cancelled = () => runId.current !== id;
    const current = readPhysicsTarget();
    const snapshot = readPalletSnapshot();
    setOpen(true);
    setRunning(true);
    setProgress(null);
    setMessage('현재 팔레트 배치와 안전성이 높은 소수 후보를 관성 검증합니다.');
    setError('');

    if (!current || current.mode !== 'pallets' || !snapshot) {
      setRunning(false);
      setError('현재 팔레트 적재 결과를 찾지 못했습니다. 팔레트 최적 적재를 먼저 실행하세요.');
      return;
    }

    const initialSignature = createPhysicsTargetSignature(current);
    const alternatives = buildPalletAdaptiveCandidates(current, snapshot, MAX_PALLET_WORK_ORDER_CANDIDATES - 1);
    const candidates = [baselinePalletCandidate(current, snapshot), ...alternatives];
    setAttempt({ index: 0, total: candidates.length, label: '' });
    let bestWarning: EvaluatedPalletCandidate | null = null;

    try {
      for (let index = 0; index < candidates.length; index += 1) {
        if (cancelled()) return;
        const liveTarget = readPhysicsTarget();
        if (!liveTarget || createPhysicsTargetSignature(liveTarget) !== initialSignature) {
          setRunning(false);
          setError('반복 최적화 중 적재안이 변경되어 중단했습니다. 현재 적재안으로 작업지시서를 다시 실행하세요.');
          return;
        }
        const candidate = candidates[index];
        setAttempt({ index: index + 1, total: candidates.length, label: candidate.label });
        setMessage(`작업지시서 후보 ${index + 1}/${candidates.length} · ${candidate.label}`);
        const initialCertification = await runInertiaCertification(
          candidate.target,
          next => { if (!cancelled()) setProgress(next); },
          undefined,
          cancelled,
        );
        if (cancelled()) return;

        const certification = await completeCertificationForWorkOrder(
          candidate.target,
          initialCertification,
          next => { if (!cancelled()) setProgress(next); },
          undefined,
          cancelled,
        );
        if (cancelled()) return;

        const evaluated: EvaluatedPalletCandidate = { ...candidate, certification, risk: palletCertificationRisk(certification) };
        const approval = assessWorkOrderCertification(certification);
        if ((approval === 'pass' || approval === 'caution') && physicsTargetHardFailureReasons(candidate.target).length === 0) {
          applyPalletAdaptiveCandidate(candidate, certification);
          setRunning(false);
          setMessage(`작업지시서 ${workOrderTargetApprovalLabel(candidate.target, certification)} · ${candidate.label}`);
          const opened = openPalletLoadingReportV2(candidate.target.container, candidate.target.cargo);
          if (opened) setOpen(false);
          else setError('브라우저가 작업지시서 팝업을 차단했습니다. 팝업 허용 후 다시 실행하세요.');
          return;
        }
        if (!bestWarning || betterWorkOrderEvaluation(evaluated, bestWarning)) bestWarning = evaluated;
      }

      if (cancelled()) return;
      setRunning(false);
      if (!bestWarning) {
        setError('관성 결과를 만들지 못했습니다. 현재 팔레트 적재안을 유지합니다.');
        return;
      }

      applyPalletAdaptiveCandidate(bestWarning, bestWarning.certification);
      setMessage(`후보 비교 완료 · ${workOrderTargetApprovalLabel(bestWarning.target, bestWarning.certification)} · 검토용 작업지시서 · ${bestWarning.label}`);
      const opened = openPalletLoadingReportV2(bestWarning.target.container, bestWarning.target.cargo);
      if (opened) setOpen(false);
      else setError('브라우저가 작업지시서 팝업을 차단했습니다. 팝업 허용 후 다시 실행하세요.');
    } catch (reason) {
      if (cancelled()) return;
      console.error('Pallet work-order inertia search failed', reason);
      setRunning(false);
      setError('팔레트 관성 검증을 완료하지 못했습니다. 현재 적재안을 유지합니다.');
    }
  }, []);

  useEffect(() => {
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<FinalWorkOrderRequest>).detail;
      if (detail) void execute(detail);
    };
    window.addEventListener(REQUEST_FINAL_WORK_ORDER_EVENT, onRequest);
    return () => window.removeEventListener(REQUEST_FINAL_WORK_ORDER_EVENT, onRequest);
  }, [execute]);

  useEffect(() => () => { runId.current += 1; }, []);

  if (!open) return null;
  const percent = attempt.total > 0 ? Math.round(attempt.index / attempt.total * 100) : 0;
  return <div className="final-cert-backdrop">
    <section className="final-cert-modal" role="dialog" aria-modal="true" aria-labelledby="final-work-order-title">
      <header>
        <div>
          <span>ADAPTIVE WORK ORDER OPTIMIZER · PALLET</span>
          <h2 id="final-work-order-title">{uiT("작업지시서 전 팔레트 안전 후보 비교")}</h2>
          <p>{uiT("출발 가속 · 급정거 · 급회전 3종을 비교해 더 안전한 팔레트안을 우선합니다. 모든 후보가 위험이어도 가장 낮은 위험안을 적용하고 위험 경고·고정 권장사항을 포함한 작업지시서를 생성합니다.")}</p>
        </div>
        {!running && <button type="button" onClick={() => setOpen(false)}>{uiT("닫기")}</button>}
      </header>

      <div className="final-cert-running">
        {running && <div className="physics-spinner" />}
        <div><b>{inspectionProgressText(message)}</b><span>{attempt.total ? uiT("후보 {0}/{1} · 비교 {2}%", [attempt.index, attempt.total, percent]) : uiT("후보 생성 중")}</span></div>
        <progress max="100" value={percent} />
      </div>

      {progress && <div className="final-cert-metrics">
        <span>{uiT("현재 보강")} <b>{uiMessage(progress.levelLabel)}</b></span>
        <span>{progress.stage === 'secured-physics' ? uiT("보강 물리 시나리오") : uiT("관성 시나리오")} <b>{progress.scenarioIndex}/{progress.scenarioCount}</b></span>
        <span>{uiT("현재 계산")} <b>{Math.round(progress.physicsProgress * 100)}%</b></span>
        <span>{uiT("출력 정책")} <b>{uiT("미통과는 검토용만")}</b></span>
      </div>}

      <article className="final-cert-materials">
        <div className="final-cert-material-head"><div><b>{uiT("자동 비교 범위")}</b><span>{uiT("화물 수량 유지")}</span></div><strong>{attempt.total || '-'}{uiT("개 배치")}</strong></div>
        <div className="final-cert-material-grid">
          <div><span>{uiT("팔레트 위 상자")}</span><b>{uiT("방향 변경")}</b><small>{uiT("자동/정방향/90도/교차 후보")}</small></div>
          <div><span>{uiT("유닛 높이")}</span><b>{uiT("저중심 후보 우선")}</b><small>{uiT("정적 안전점수로 선별")}</small></div>
          <div><span>{uiT("팔레트 적층")}</span><b>{uiT("안전한 층수 비교")}</b><small>{uiT("높은 위험 후보 후순위")}</small></div>
          <div><span>{uiT("3종 검증")}</span><b>{uiT("가능한 모두 확인")}</b><small>{uiT("전체 이동·기울기·상대이동 확인")}</small></div>
          <div><span>{uiT("주의 결과")}</span><b>{uiT("작업지시서 생성")}</b><small>{uiT("권장사항 자동 기입")}</small></div>
          <div><span>{uiT("위험 결과")}</span><b>{uiT("경고 포함 생성")}</b><small>{uiT("가장 낮은 위험안 + 보강 권장")}</small></div>
        </div>
      </article>

      {error && <div className="final-cert-error"><b>{uiT("검증 처리 확인")}</b><span>{uiMessage(error)}</span></div>}
    </section>
  </div>;
}
