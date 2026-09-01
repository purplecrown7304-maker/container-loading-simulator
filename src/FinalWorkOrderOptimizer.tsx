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
  canCreateWorkOrder,
  completeCertificationForWorkOrder,
  workOrderApprovalLabel,
} from './inertiaWorkOrderPolicy';
import { openPalletLoadingReport as openPalletLoadingReportV2 } from './palletWorkerReportV2';
import { readPhysicsTarget } from './physicsTarget';
import { REQUEST_FINAL_WORK_ORDER_EVENT, type FinalWorkOrderRequest } from './finalWorkOrderEvents';

const MAX_PALLET_WORK_ORDER_CANDIDATES = 8;

export default function FinalWorkOrderOptimizer() {
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
    let bestFailed: EvaluatedPalletCandidate | null = null;

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
        if (canCreateWorkOrder(certification)) {
          applyPalletAdaptiveCandidate(candidate, certification);
          setRunning(false);
          setMessage(`작업지시서 ${workOrderApprovalLabel(certification)} · ${candidate.label}`);
          const opened = openPalletLoadingReportV2(candidate.target.container, candidate.target.cargo);
          if (opened) setOpen(false);
          else setError('브라우저가 작업지시서 팝업을 차단했습니다. 팝업 허용 후 다시 실행하세요.');
          return;
        }
        if (!bestFailed || betterPalletEvaluation(evaluated, bestFailed)) bestFailed = evaluated;
      }

      if (cancelled()) return;
      setRunning(false);
      if (bestFailed) {
        applyPalletAdaptiveCandidate(bestFailed, bestFailed.certification);
        setMessage(`상위 안전 후보 비교 완료 · 가장 낮은 위험안 적용 · ${bestFailed.label}`);
      }
      setError(`현재 팔레트안과 상위 ${candidates.length - 1}개 후보를 확인했지만 모두 위험 기준을 넘었거나 3종 검증을 완료하지 못했습니다. 위험 판정에서는 작업지시서를 생성하지 않습니다.`);
    } catch (reason) {
      if (cancelled()) return;
      console.error('Pallet work-order inertia search failed', reason);
      setRunning(false);
      setError('팔레트 관성 검증을 완료하지 못했습니다. 현재 적재안을 유지한 채 다시 실행할 수 있습니다.');
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
          <h2 id="final-work-order-title">작업지시서 전 팔레트 안전 후보 비교</h2>
          <p>출발 가속 · 급정거 · 급회전 3종이 모두 위험 기준 이내이면 작업지시서를 생성합니다. PASS 기준을 조금 넘은 경우에는 주의 승인으로 처리하고 팔레트 고정 권장사항을 작업지시서에 자동 기입합니다.</p>
        </div>
        {!running && <button type="button" onClick={() => setOpen(false)}>닫기</button>}
      </header>

      <div className="final-cert-running">
        {running && <div className="physics-spinner" />}
        <div><b>{message}</b><span>{attempt.total ? `후보 ${attempt.index}/${attempt.total} · 비교 ${percent}%` : '후보 생성 중'}</span></div>
        <progress max="100" value={percent} />
      </div>

      {progress && <div className="final-cert-metrics">
        <span>현재 보강 <b>{progress.levelLabel}</b></span>
        <span>관성 시나리오 <b>{progress.scenarioIndex}/{progress.scenarioCount}</b></span>
        <span>현재 계산 <b>{Math.round(progress.physicsProgress * 100)}%</b></span>
        <span>승인 기준 <b>3종 모두 위험 아님</b></span>
      </div>}

      <article className="final-cert-materials">
        <div className="final-cert-material-head"><div><b>자동 비교 범위</b><span>화물 수량 유지</span></div><strong>{attempt.total || '-'}개 배치</strong></div>
        <div className="final-cert-material-grid">
          <div><span>팔레트 위 상자</span><b>방향 변경</b><small>자동/정방향/90도/교차 후보</small></div>
          <div><span>유닛 높이</span><b>저중심 후보 우선</b><small>정적 안전점수로 선별</small></div>
          <div><span>팔레트 적층</span><b>안전한 층수 비교</b><small>높은 위험 후보 후순위</small></div>
          <div><span>3종 검증</span><b>모두 위험 아님</b><small>전체 이동·기울기·상대이동 확인</small></div>
          <div><span>주의 결과</span><b>작업지시서 생성</b><small>권장사항 자동 기입</small></div>
          <div><span>위험 결과</span><b>출력 차단</b><small>재배치/보강 후 재검증</small></div>
        </div>
      </article>

      {error && <div className="final-cert-error"><b>작업지시서 생성 불가</b><span>{error}</span></div>}
    </section>
  </div>;
}