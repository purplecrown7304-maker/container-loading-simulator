import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyPalletAdaptiveCandidate,
  baselinePalletCandidate,
  betterPalletEvaluation,
  buildPalletAdaptiveCandidates,
  palletCertificationRisk,
  palletTruckAxleAssessment,
  readPalletSnapshot,
  type EvaluatedPalletCandidate,
} from './engine/palletAdaptiveSearch';
import { createPhysicsTargetSignature, runInertiaCertification, type CertificationProgress } from './inertiaCertification';
import { openPalletLoadingReport as openPalletLoadingReportV2 } from './palletWorkerReportV2';
import { readPhysicsTarget } from './physicsTarget';
import { REQUEST_FINAL_WORK_ORDER_EVENT, type FinalWorkOrderRequest } from './finalWorkOrderEvents';

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
    const current = readPhysicsTarget();
    const snapshot = readPalletSnapshot();
    setOpen(true);
    setRunning(true);
    setProgress(null);
    setMessage('작업지시서가 나올 때까지 팔레트와 팔레트 위 상자 배치를 계속 바꿉니다.');
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
    let axleRejected = 0;

    for (let index = 0; index < candidates.length; index += 1) {
      if (runId.current !== id) return;
      const liveTarget = readPhysicsTarget();
      if (!liveTarget || createPhysicsTargetSignature(liveTarget) !== initialSignature) {
        setRunning(false);
        setError('반복 최적화 중 적재안이 변경되어 중단했습니다. 현재 적재안으로 작업지시서를 다시 실행하세요.');
        return;
      }
      const candidate = candidates[index];
      const axle = palletTruckAxleAssessment(candidate.target.container, candidate.result);
      const axleAllowed = !axle || (axle.severity !== 'over' && axle.severity !== 'invalid');
      setAttempt({ index: index + 1, total: candidates.length, label: candidate.label });
      if (!axleAllowed) {
        axleRejected += 1;
        setMessage(`축하중 재배치 ${index + 1}/${candidates.length} · ${candidate.label} · 축 허용범위 초과 → 다음 후보`);
        continue;
      }

      setMessage(`작업지시서 후보 ${index + 1}/${candidates.length} · ${candidate.label}`);
      const certification = await runInertiaCertification(candidate.target, next => {
        if (runId.current === id) setProgress(next);
      });
      if (runId.current !== id) return;

      const evaluated: EvaluatedPalletCandidate = { ...candidate, certification, risk: palletCertificationRisk(certification) };
      if (certification.status === 'passed') {
        applyPalletAdaptiveCandidate(candidate, certification);
        setRunning(false);
        const axleText = axle?.severity === 'warning' ? ' · 축하중 주의 범위' : '';
        setMessage(`작업지시서 승인 · ${candidate.label}${axleText}`);
        const opened = openPalletLoadingReportV2(candidate.target.container, candidate.target.cargo);
        if (opened) setOpen(false);
        else setError('브라우저가 작업지시서 팝업을 차단했습니다. 팝업 허용 후 다시 실행하세요.');
        return;
      }
      if (!bestFailed || betterPalletEvaluation(evaluated, bestFailed)) bestFailed = evaluated;
    }

    if (runId.current !== id) return;
    setRunning(false);
    if (bestFailed) {
      applyPalletAdaptiveCandidate(bestFailed, bestFailed.certification);
      setMessage(`유효 배치 전부 탐색 · 가장 안전한 실패안 적용 · ${bestFailed.label}`);
    }
    setError(axleRejected > 0
      ? `화물 수량·팔레트 규격·상부하중을 유지한 모든 후보를 시험했지만 관성 3종과 입력된 축하중 조건을 동시에 만족하지 못했습니다. 축하중 초과로 제외된 후보 ${axleRejected}개가 있습니다.`
      : '화물 수량·팔레트 규격·상부하중 등 필수 제약을 유지하면서 만들 수 있는 모든 유효 팔레트 배치를 시험했지만 관성 3종 PASS가 나오지 않았습니다. 이 경우 작업지시서를 억지로 생성하지 않습니다.');
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
          <h2 id="final-work-order-title">작업지시서 전 팔레트 반복 최적화</h2>
          <p>작업지시서가 생성될 때까지 팔레트 위치와 팔레트 위 상자의 패턴·방향·높이·적층 방법을 계속 바꾸고, 관성 3종과 설정된 트럭 축하중을 재검증합니다.</p>
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
        <span>현재 계산 <b>{Math.round(progress.physicsProgress * 100)}%</b></span>
        <span>종료 조건 <b>관성 + 축하중 PASS → 작업지시서</b></span>
      </div>}

      <article className="final-cert-materials">
        <div className="final-cert-material-head"><div><b>반복 탐색 범위</b><span>화물 수량은 유지</span></div><strong>{attempt.total || '-'}개 유효 배치</strong></div>
        <div className="final-cert-material-grid">
          <div><span>팔레트 위 패턴</span><b>블록/벽돌/스플릿/핀휠</b><small>실제 좌표로 다시 생성</small></div>
          <div><span>유닛 높이</span><b>계속 낮춰 비교</b><small>무게중심 하향</small></div>
          <div><span>팔레트 적층</span><b>1단부터 비교</b><small>빈 바닥 우선</small></div>
          <div><span>바닥 배열</span><b>2열 우선</b><small>폭이 허용하면 좌우 사용</small></div>
          <div><span>트럭 축하중</span><b>팔레트 자중 포함</b><small>초과 후보 자동 제외</small></div>
          <div><span>작업지시서</span><b>PASS 즉시 생성</b><small>실패 후보는 계속 다음 배치</small></div>
        </div>
      </article>

      {error && <div className="final-cert-error"><b>작업지시서 생성 불가</b><span>{error}</span></div>}
    </section>
  </div>;
}
