import { useCallback, useEffect, useRef, useState } from 'react';
import { REQUEST_DIRECT_WORK_ORDER_EVENT, type DirectWorkOrderRequest } from './directWorkOrderEvents';
import { buildDirectResultReoptimizationCandidates, type DirectResultReoptimizationCandidate } from './engine/finalResultOptimization';
import { LOADING_STRATEGY_STORAGE_KEY } from './engine/loadingEngine';
import { normalizeLoadingStrategy } from './engine/loadingStrategies';
import { writeManualOverride } from './engine/manualOverride';
import { runPhysicsValidationSuite } from './engine/physicsValidation';
import { publishFinalLayout } from './finalLayout';
import {
  INERTIA_CERTIFICATION_EVENT,
  INERTIA_PASS_SHIFT_M,
  INERTIA_PASS_TILT_DEG,
  createPhysicsTargetSignature,
  runInertiaCertification,
  type CertificationProgress,
  type InertiaCertification,
} from './inertiaCertification';
import {
  assessWorkOrderCertification,
  completeCertificationForWorkOrder,
  workOrderApprovalLabel,
} from './inertiaWorkOrderPolicy';
import { publishLoadingWorkflowProgress } from './loadingWorkflow';
import { publishPhysicsTarget, readPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { openLoadingReport } from './report';
import { STORAGE_UPDATED_EVENT, type StoredState } from './storage';

const EPS = 1e-9;
const MAX_DIRECT_WORK_ORDER_CANDIDATES = 8;

type Candidate = DirectResultReoptimizationCandidate;
type Evaluated = Candidate & { certification: InertiaCertification; risk: number };
type CertificationWindow = Window & { __containerLoadingLatestCertification?: InertiaCertification };

function activeStrategy() {
  if (typeof window === 'undefined') return normalizeLoadingStrategy(undefined);
  return normalizeLoadingStrategy(window.localStorage.getItem(LOADING_STRATEGY_STORAGE_KEY));
}

function certificationRisk(result: InertiaCertification) {
  const shift = result.maxHorizontalShiftM / Math.max(EPS, INERTIA_PASS_SHIFT_M);
  const tilt = result.maxTiltDeg / Math.max(EPS, INERTIA_PASS_TILT_DEG);
  return Math.max(shift, tilt) + (shift + tilt) * 0.15 + result.securing.level * 0.03;
}

function better(a: Evaluated, b: Evaluated) {
  if (Math.abs(a.risk - b.risk) > 1e-6) return a.risk < b.risk;
  if (a.certification.securing.level !== b.certification.securing.level) return a.certification.securing.level < b.certification.securing.level;
  return a.staticPenalty < b.staticPenalty;
}

function publishCertification(certification: InertiaCertification) {
  (window as CertificationWindow).__containerLoadingLatestCertification = certification;
  window.dispatchEvent(new CustomEvent<InertiaCertification>(INERTIA_CERTIFICATION_EVENT, { detail: certification }));
}

function applyVerifiedCandidate(candidate: Candidate, certification: InertiaCertification, source: 'baseline' | 'auto-rearranged') {
  const target = candidate.target;
  writeManualOverride(target.container, target.cargo, target.result);
  const state: StoredState = { container: target.container, cargo: target.cargo };
  window.dispatchEvent(new CustomEvent<StoredState>(STORAGE_UPDATED_EVENT, { detail: state }));
  publishPhysicsTarget(target);
  publishCertification(certification);
  publishFinalLayout({
    mode: 'boxes',
    strategy: activeStrategy(),
    container: target.container,
    cargo: target.cargo,
    result: target.result,
    certification,
    verifiedAt: new Date().toISOString(),
    source,
  });
  publishLoadingWorkflowProgress({
    mode: 'boxes',
    strategy: activeStrategy(),
    phase: 'complete',
    percent: 100,
    title: '최종 적재 확정',
    detail: `${candidate.label} · ${workOrderApprovalLabel(certification)} · finalLayout 생성 완료`,
  });
}

function requestTarget(detail: DirectWorkOrderRequest): PhysicsTarget {
  return { mode: 'boxes', container: detail.container, cargo: detail.cargo, result: detail.result };
}

export default function DirectWorkOrderOptimizer() {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [attempt, setAttempt] = useState({ index: 0, total: 0, label: '' });
  const [progress, setProgress] = useState<CertificationProgress | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const runId = useRef(0);

  const execute = useCallback(async (detail: DirectWorkOrderRequest) => {
    const id = ++runId.current;
    const cancelled = () => runId.current !== id;
    const current = requestTarget(detail);
    const automatic = detail.openReport === false;
    setOpen(!automatic);
    setRunning(true);
    setProgress(null);
    setMessage(automatic
      ? '최종 적재 진행 · 물리 재검증과 관성 3종을 자동 검증합니다.'
      : '현재 적재안과 안전성이 높은 소수 재배치 후보를 물리·관성 검증합니다.');
    setError('');

    if (!current.result.placements.length) {
      setRunning(false);
      setOpen(true);
      setError('적재 결과가 없습니다. 먼저 자동 적재를 실행하세요.');
      return;
    }

    publishPhysicsTarget(current);
    const initialSignature = createPhysicsTargetSignature(current);
    const baseline: Candidate = {
      label: '현재 적재안',
      result: current.result,
      target: current,
      staticPenalty: 0,
    };
    const alternatives = buildDirectResultReoptimizationCandidates(current, MAX_DIRECT_WORK_ORDER_CANDIDATES - 1);
    const candidates = [baseline, ...alternatives];
    setAttempt({ index: 0, total: candidates.length, label: '' });
    let bestWarning: Evaluated | null = null;

    try {
      for (let index = 0; index < candidates.length; index += 1) {
        if (cancelled()) return;
        const liveTarget = readPhysicsTarget();
        if (!liveTarget || createPhysicsTargetSignature(liveTarget) !== initialSignature) {
          setRunning(false);
          setOpen(true);
          setError('반복 최적화 중 적재안이 변경되어 중단했습니다. 현재 적재안으로 다시 실행하세요.');
          return;
        }
        const candidate = candidates[index];
        const rearranged = index > 0;
        setAttempt({ index: index + 1, total: candidates.length, label: candidate.label });
        setMessage(`${automatic ? '최종 적재 자동검증' : '상자 재배치'} ${index + 1}/${candidates.length} · ${candidate.label}`);
        publishLoadingWorkflowProgress({
          mode: 'boxes',
          strategy: activeStrategy(),
          phase: rearranged ? 'rearranging' : 'inertia-validation',
          percent: 72 + Math.round((index / Math.max(1, candidates.length)) * 20),
          title: rearranged ? '자동 재배치 후보 생성' : '관성 테스트 자동 실행',
          detail: `${candidate.label} · ${index + 1}/${candidates.length}`,
          attempt: index + 1,
          attemptTotal: candidates.length,
        });

        // Baseline already passed autoCertification Rapier validation. Every rearranged
        // candidate must run the full Rapier suite again before inertia certification.
        if (rearranged) {
          publishLoadingWorkflowProgress({
            mode: 'boxes',
            strategy: activeStrategy(),
            phase: 'revalidation',
            percent: 74 + Math.round((index / Math.max(1, candidates.length)) * 18),
            title: '재배치 물리 재검증',
            detail: `${candidate.label} · Rapier 4개 시나리오`,
            attempt: index + 1,
            attemptTotal: candidates.length,
          });
          const physics = await runPhysicsValidationSuite(
            candidate.target.container,
            candidate.target.result.placements,
            undefined,
            candidate.target.supports ?? [],
          );
          if (cancelled()) return;
          const physicsFailed = physics.unstableCount + physics.supportUnstableCount > 0 || !physics.settled;
          if (physicsFailed) continue;
        }

        publishLoadingWorkflowProgress({
          mode: 'boxes',
          strategy: activeStrategy(),
          phase: rearranged ? 'revalidation' : 'inertia-validation',
          percent: 78 + Math.round((index / Math.max(1, candidates.length)) * 18),
          title: rearranged ? '재배치 관성 재검증' : '관성 테스트 자동 실행',
          detail: '출발 가속 · 급정거 · 급회전',
          attempt: index + 1,
          attemptTotal: candidates.length,
        });

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

        const evaluated: Evaluated = { ...candidate, certification, risk: certificationRisk(certification) };
        const approval = assessWorkOrderCertification(certification);
        if (approval === 'pass' || approval === 'caution') {
          publishLoadingWorkflowProgress({
            mode: 'boxes',
            strategy: activeStrategy(),
            phase: 'finalizing',
            percent: 98,
            title: '검증된 배치 최종 확정',
            detail: `${candidate.label} · finalLayout 생성`,
          });
          applyVerifiedCandidate(candidate, certification, rearranged ? 'auto-rearranged' : 'baseline');
          setRunning(false);
          setMessage(`최종 관성검증 ${workOrderApprovalLabel(certification)} · ${candidate.label}`);

          if (automatic) {
            setOpen(false);
            return;
          }

          const opened = openLoadingReport(candidate.target.container, candidate.target.cargo, candidate.target.result);
          if (opened) setOpen(false);
          else setError('브라우저가 작업지시서 팝업을 차단했습니다. 팝업 허용 후 다시 실행하세요.');
          return;
        }
        if (!bestWarning || better(evaluated, bestWarning)) bestWarning = evaluated;
      }

      if (cancelled()) return;
      setRunning(false);
      // Important: do not apply a failed candidate. Earlier versions used the least-risk
      // failed layout; the verified workflow must leave the previous final layout intact.
      const diagnostic = bestWarning ? ` 가장 낮은 위험 후보: ${bestWarning.label}.` : '';
      setError(`모든 재배치 후보가 최종 검증 기준을 통과하지 못했습니다.${diagnostic} 기존 확정 배치를 유지합니다.`);
      publishLoadingWorkflowProgress({
        mode: 'boxes',
        strategy: activeStrategy(),
        phase: 'failed',
        percent: 100,
        title: '최종 검증 실패',
        detail: '실패 후보는 finalLayout으로 확정하지 않았습니다. 기존 확정 배치를 유지합니다.',
      });
      if (!automatic) setOpen(true);
    } catch (reason) {
      if (cancelled()) return;
      console.error('Direct work-order inertia search failed', reason);
      setRunning(false);
      setOpen(true);
      setError('직접 적재 물리·관성 검증을 완료하지 못했습니다. 기존 확정 배치를 유지합니다.');
      publishLoadingWorkflowProgress({
        mode: 'boxes',
        strategy: activeStrategy(),
        phase: 'failed',
        percent: 100,
        title: '최종 검증 오류',
        detail: '오류 후보는 finalLayout으로 확정하지 않았습니다.',
      });
    }
  }, []);

  useEffect(() => {
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<DirectWorkOrderRequest>).detail;
      if (detail) void execute(detail);
    };
    window.addEventListener(REQUEST_DIRECT_WORK_ORDER_EVENT, onRequest);
    return () => window.removeEventListener(REQUEST_DIRECT_WORK_ORDER_EVENT, onRequest);
  }, [execute]);

  useEffect(() => () => { runId.current += 1; }, []);

  if (!open) return null;
  const percent = attempt.total > 0 ? Math.round(attempt.index / attempt.total * 100) : 0;
  return <div className="final-cert-backdrop">
    <section className="final-cert-modal" role="dialog" aria-modal="true" aria-labelledby="direct-work-order-title">
      <header>
        <div>
          <span>FINAL WORK ORDER OPTIMIZER · DIRECT BOX</span>
          <h2 id="direct-work-order-title">작업지시서 전 상자 안전 후보 비교</h2>
          <p>출발 가속 · 급정거 · 급회전 3종과 재배치 후보의 Rapier 물리 재검증을 수행합니다. 검증 기준을 통과한 후보만 최종 배치로 확정합니다.</p>
        </div>
        {!running && <button type="button" onClick={() => setOpen(false)}>닫기</button>}
      </header>

      <div className="final-cert-running">
        {running && <div className="physics-spinner" />}
        <div><b>{message}</b><span>{attempt.total ? `배치 ${attempt.index}/${attempt.total} · 비교 ${percent}%` : '후보 생성 중'}</span></div>
        <progress max="100" value={percent} />
      </div>

      {progress && <div className="final-cert-metrics">
        <span>현재 보강 <b>{progress.levelLabel}</b></span>
        <span>관성 시나리오 <b>{progress.scenarioIndex}/{progress.scenarioCount}</b></span>
        <span>현재 계산 <b>{Math.round(progress.physicsProgress * 100)}%</b></span>
        <span>출력 정책 <b>검증 승인 후 확정</b></span>
      </div>}

      <article className="final-cert-materials">
        <div className="final-cert-material-head"><div><b>자동 비교 범위</b><span>화물 수량 유지</span></div><strong>{attempt.total || '-'}개 배치</strong></div>
        <div className="final-cert-material-grid">
          <div><span>상자 배치</span><b>6개 전략 목적함수</b><small>PR #50 하이브리드 후보 유지</small></div>
          <div><span>적재 높이</span><b>저중심 후보 우선</b><small>정적 안전점수로 선별</small></div>
          <div><span>후보 수</span><b>최대 {MAX_DIRECT_WORK_ORDER_CANDIDATES}개</b><small>무제한 반복 없음</small></div>
          <div><span>물리 재검증</span><b>Rapier 4종</b><small>재배치마다 다시 확인</small></div>
          <div><span>관성 검증</span><b>출발·급정거·급회전</b><small>승인 후보만 확정</small></div>
          <div><span>위험 결과</span><b>미확정</b><small>기존 finalLayout 유지</small></div>
        </div>
      </article>

      {error && <div className="final-cert-error"><b>검증 처리 확인</b><span>{error}</span></div>}
    </section>
  </div>;
}