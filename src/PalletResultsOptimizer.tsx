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
import { readPhysicsTarget } from './physicsTarget';
import {
  REQUEST_PALLET_RESULTS_OPTIMIZATION_EVENT,
  openResultsModal,
  type ResultsModalDetail,
} from './resultsModalEvents';

export default function PalletResultsOptimizer() {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [attempt, setAttempt] = useState({ index: 0, total: 0, label: '' });
  const [progress, setProgress] = useState<CertificationProgress | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const runId = useRef(0);

  const execute = useCallback(async (_detail: ResultsModalDetail) => {
    const id = ++runId.current;
    const current = readPhysicsTarget();
    const snapshot = readPalletSnapshot();
    setOpen(true);
    setRunning(true);
    setProgress(null);
    setMessage('관성 PASS가 나올 때까지 팔레트 위치와 팔레트 위 상자 적재법을 바꿉니다.');
    setError('');

    if (!current || current.mode !== 'pallets' || !snapshot) {
      setRunning(false);
      setError('현재 팔레트 적재 결과를 찾지 못했습니다. 팔레트 최적 적재를 먼저 실행하세요.');
      return;
    }

    const initialSignature = createPhysicsTargetSignature(current);
    const candidates = [baselinePalletCandidate(current, snapshot), ...buildPalletAdaptiveCandidates(current, snapshot)];
    setAttempt({ index: 0, total: candidates.length, label: '' });
    let bestFailed: EvaluatedPalletCandidate | null = null;

    for (let index = 0; index < candidates.length; index += 1) {
      if (runId.current !== id) return;
      const liveTarget = readPhysicsTarget();
      if (!liveTarget || createPhysicsTargetSignature(liveTarget) !== initialSignature) {
        setRunning(false);
        setError('자동 재배치 중 사용자가 적재안을 변경해 탐색을 중단했습니다. 현재 팔레트안으로 결과 보기를 다시 실행하세요.');
        return;
      }

      const candidate = candidates[index];
      setAttempt({ index: index + 1, total: candidates.length, label: candidate.label });
      setMessage(`팔레트 재배치 ${index + 1}/${candidates.length} · ${candidate.label}`);
      const certification = await runInertiaCertification(candidate.target, next => {
        if (runId.current === id) setProgress(next);
      });
      if (runId.current !== id) return;

      const evaluated: EvaluatedPalletCandidate = { ...candidate, certification, risk: palletCertificationRisk(certification) };
      if (certification.status === 'passed') {
        applyPalletAdaptiveCandidate(candidate, certification);
        setRunning(false);
        setMessage(`최종 PASS · ${candidate.label}`);
        setOpen(false);
        openResultsModal({
          container: candidate.target.container,
          cargo: candidate.target.cargo,
          result: candidate.target.result,
          certification,
        });
        return;
      }
      if (!bestFailed || betterPalletEvaluation(evaluated, bestFailed)) bestFailed = evaluated;
    }

    if (runId.current !== id) return;
    setRunning(false);
    if (bestFailed) {
      applyPalletAdaptiveCandidate(bestFailed, bestFailed.certification);
      setMessage(`유효 팔레트 배치 전부 탐색 · 가장 안전한 실패안 적용 · ${bestFailed.label}`);
    }
    setError('화물 수량과 제약조건을 유지하면서 만들 수 있는 팔레트 위치·팔레트 위 상자 방향·높이 조합을 모두 시험했지만 관성 3종 PASS가 나오지 않았습니다. 결과 보기는 잠금 상태를 유지합니다.');
  }, []);

  useEffect(() => {
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<ResultsModalDetail>).detail;
      if (detail) void execute(detail);
    };
    window.addEventListener(REQUEST_PALLET_RESULTS_OPTIMIZATION_EVENT, onRequest);
    return () => window.removeEventListener(REQUEST_PALLET_RESULTS_OPTIMIZATION_EVENT, onRequest);
  }, [execute]);

  useEffect(() => () => { runId.current += 1; }, []);

  if (!open) return null;
  const percent = attempt.total > 0 ? Math.round(attempt.index / attempt.total * 100) : 0;
  return <div className="final-cert-backdrop">
    <section className="final-cert-modal" role="dialog" aria-modal="true" aria-labelledby="pallet-result-opt-title">
      <header>
        <div>
          <span>ADAPTIVE RESULTS OPTIMIZER · PALLET · RAPIER 3D</span>
          <h2 id="pallet-result-opt-title">팔레트 결과보기 전 반복 재배치</h2>
          <p>PASS가 나올 때까지 팔레트 위치뿐 아니라 팔레트 위 상자의 방향·높이·적층단까지 바꾸어 관성 3종을 다시 시험합니다.</p>
        </div>
        {!running && <button type="button" onClick={() => setOpen(false)}>닫기</button>}
      </header>

      <div className="final-cert-running">
        {running && <div className="physics-spinner" />}
        <div><b>{message}</b><span>{attempt.total ? `유효 배치 ${attempt.index}/${attempt.total} · 탐색 ${percent}%` : '후보 생성 중'}</span></div>
        <progress max="100" value={percent} />
      </div>

      {progress && <div className="final-cert-metrics">
        <span>현재 보강 <b>{progress.levelLabel}</b></span>
        <span>관성 시나리오 <b>{progress.scenarioIndex}/{progress.scenarioCount}</b></span>
        <span>물리 계산 <b>{Math.round(progress.physicsProgress * 100)}%</b></span>
        <span>종료 조건 <b>첫 PASS 또는 유효 배치 소진</b></span>
      </div>}

      <article className="final-cert-materials">
        <div className="final-cert-material-head"><div><b>계속 바꾸는 항목</b><span>화물 수량은 변경하지 않음</span></div><strong>{attempt.total || '-'}개 유효 배치</strong></div>
        <div className="final-cert-material-grid">
          <div><span>팔레트 위 방향</span><b>자동/정방향/90도/교차</b><small>회전 가능한 SKU만 변경</small></div>
          <div><span>유닛 높이</span><b>60~115%</b><small>낮은 적재부터 순차 시험</small></div>
          <div><span>팔레트 적층</span><b>1단부터</b><small>허용 범위의 모든 적층단 비교</small></div>
          <div><span>컨테이너 폭</span><b>2열 우선</b><small>가능하면 좌우 동시 배치</small></div>
          <div><span>길이 방향</span><b>안쪽/문쪽 밀착</b><small>이동 여유가 다른 후보 비교</small></div>
          <div><span>승인</span><b>관성 3종 PASS</b><small>PASS 전 결과 잠금</small></div>
        </div>
      </article>

      {error && <div className="final-cert-error"><b>결과보기 잠금 유지</b><span>{error}</span></div>}
    </section>
  </div>;
}
