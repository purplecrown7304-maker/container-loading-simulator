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
    setMessage('현재 팔레트 적재 수량을 유지한 채 관성 상태를 확인합니다.');
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
        setMessage(`관성 상태 확인 ${index + 1}/${candidates.length} · ${candidate.label}`);
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
          setMessage(`관성 상태 ${workOrderApprovalLabel(certification)} · ${candidate.label} · 작업지시서 생성`);
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
        setMessage(`관성 상태 확인 완료 · ${workOrderApprovalLabel(bestFailed.certification)} · ${bestFailed.label}`);
      }
      setError('관성 상태 확인을 완료하지 못했습니다. 현재 팔레트 적재 수량은 유지됩니다.');
    } catch (reason) {
      if (cancelled()) return;
      console.error('Pallet work-order inertia search failed', reason);
      setRunning(false);
      setError('팔레트 관성 검증을 완료하지 못했습니다. 현재 적재안과 적재 수량은 유지됩니다.');
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
          <span>FINAL WORK ORDER · PALLET</span>
          <h2 id="final-work-order-title">팔레트 작업지시서 관성 상태 확인</h2>
          <p>현재 팔레트 적재 수량은 유지합니다. 관성 결과가 PASS·주의·위험·미완료 중 어느 상태여도 작업지시서를 생성하며 위험 상태는 문서에 경고와 보완사항으로 표시합니다.</p>
        </div>
        {!running && <button type="button" onClick={() => setOpen(false)}>닫기</button>}
      </header>

      <div className="final-cert-running">
        {running && <div className="physics-spinner" />}
        <div><b>{message}</b><span>{attempt.total ? `후보 ${attempt.index}/${attempt.total} · 확인 ${percent}%` : '검증 준비 중'}</span></div>
        <progress max="100" value={percent} />
      </div>

      {progress && <div className="final-cert-metrics">
        <span>현재 보강 <b>{progress.levelLabel}</b></span>
        <span>관성 시나리오 <b>{progress.scenarioIndex}/{progress.scenarioCount}</b></span>
        <span>현재 계산 <b>{Math.round(progress.physicsProgress * 100)}%</b></span>
        <span>출력 정책 <b>위험이어도 작업지시서 생성</b></span>
      </div>}

      <article className="final-cert-materials">
        <div className="final-cert-material-head"><div><b>적재 정책</b><span>화물 수량 우선 유지</span></div><strong>{attempt.total || '-'}개 배치</strong></div>
        <div className="final-cert-material-grid">
          <div><span>팔레트 위 상자</span><b>적재 수량 유지</b><small>무게중심 때문에 화물 제거 금지</small></div>
          <div><span>무게중심</span><b>평가/경고</b><small>적재 차단 조건 아님</small></div>
          <div><span>하드 안전조건</span><b>계속 적용</b><small>경계·중량·적층·오버행</small></div>
          <div><span>관성 검증</span><b>상태 기록</b><small>이동·기울기·상대이동 확인</small></div>
          <div><span>주의 결과</span><b>작업지시서 생성</b><small>권장사항 자동 기입</small></div>
          <div><span>위험 결과</span><b>작업지시서 생성</b><small>위험 경고·보완사항 표시</small></div>
        </div>
      </article>

      {error && <div className="final-cert-error"><b>처리 알림</b><span>{error}</span></div>}
    </section>
  </div>;
}