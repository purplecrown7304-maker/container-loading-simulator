import { useCallback, useEffect, useRef, useState } from 'react';
import { REQUEST_DIRECT_WORK_ORDER_EVENT, type DirectWorkOrderRequest } from './directWorkOrderEvents';
import { buildDirectResultReoptimizationCandidates, type DirectResultReoptimizationCandidate } from './engine/finalResultOptimization';
import { writeManualOverride } from './engine/manualOverride';
import {
  INERTIA_CERTIFICATION_EVENT,
  INERTIA_PASS_SHIFT_M,
  INERTIA_PASS_TILT_DEG,
  createPhysicsTargetSignature,
  runInertiaCertification,
  type CertificationProgress,
  type InertiaCertification,
} from './inertiaCertification';
import { publishPhysicsTarget, readPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { openLoadingReport } from './report';
import { STORAGE_UPDATED_EVENT, type StoredState } from './storage';

const EPS = 1e-9;
const MAX_DIRECT_WORK_ORDER_CANDIDATES = 8;

type Candidate = DirectResultReoptimizationCandidate;
type Evaluated = Candidate & { certification: InertiaCertification; risk: number };
type CertificationWindow = Window & { __containerLoadingLatestCertification?: InertiaCertification };

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

function applyCandidate(candidate: Candidate, certification: InertiaCertification) {
  const target = candidate.target;
  writeManualOverride(target.container, target.cargo, target.result);
  const state: StoredState = { container: target.container, cargo: target.cargo };
  window.dispatchEvent(new CustomEvent<StoredState>(STORAGE_UPDATED_EVENT, { detail: state }));
  publishPhysicsTarget(target);
  publishCertification(certification);
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
    setOpen(true);
    setRunning(true);
    setProgress(null);
    setMessage('현재 적재안과 안전성이 높은 소수 재배치 후보를 관성 검증합니다.');
    setError('');

    if (!current.result.placements.length) {
      setRunning(false);
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
    let bestFailed: Evaluated | null = null;

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
        setMessage(`상자 재배치 ${index + 1}/${candidates.length} · ${candidate.label}`);
        const certification = await runInertiaCertification(
          candidate.target,
          next => { if (!cancelled()) setProgress(next); },
          undefined,
          cancelled,
        );
        if (cancelled()) return;

        const evaluated: Evaluated = { ...candidate, certification, risk: certificationRisk(certification) };
        if (certification.status === 'passed') {
          applyCandidate(candidate, certification);
          setRunning(false);
          setMessage(`작업지시서 승인 · ${candidate.label}`);
          const opened = openLoadingReport(candidate.target.container, candidate.target.cargo, candidate.target.result);
          if (opened) setOpen(false);
          else setError('브라우저가 작업지시서 팝업을 차단했습니다. 팝업 허용 후 다시 실행하세요.');
          return;
        }
        if (!bestFailed || better(evaluated, bestFailed)) bestFailed = evaluated;
      }

      if (cancelled()) return;
      setRunning(false);
      if (bestFailed) {
        applyCandidate(bestFailed, bestFailed.certification);
        setMessage(`상위 안전 후보 비교 완료 · 가장 안전한 실패안 적용 · ${bestFailed.label}`);
      }
      setError(`현재 적재안과 정적 안전점수가 높은 상위 ${candidates.length - 1}개 재배치를 시험했지만 관성 3종 PASS가 나오지 않았습니다. 무한 재탐색 대신 적재량·적층조건 또는 보조자재를 조정한 뒤 다시 검증하세요.`);
    } catch (reason) {
      if (cancelled()) return;
      console.error('Direct work-order inertia search failed', reason);
      setRunning(false);
      setError('직접 적재 관성 검증을 완료하지 못했습니다. 현재 적재안을 유지한 채 다시 실행할 수 있습니다.');
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
          <p>현재 배치와 정적 안전성이 높은 상위 후보만 관성 3종으로 비교합니다. 화물 수량은 유지하며 브라우저가 장시간 멈추지 않도록 최대 {MAX_DIRECT_WORK_ORDER_CANDIDATES}개 배치만 시험합니다.</p>
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
        <span>탐색 원칙 <b>안전 우선 · 제한된 후보 비교</b></span>
      </div>}

      <article className="final-cert-materials">
        <div className="final-cert-material-head"><div><b>자동 비교 범위</b><span>화물 수량 유지</span></div><strong>{attempt.total || '-'}개 배치</strong></div>
        <div className="final-cert-material-grid">
          <div><span>상자 배치</span><b>안정성/적재율/하역</b><small>전략별 고유 배치만 비교</small></div>
          <div><span>적재 높이</span><b>저중심 후보 우선</b><small>정적 안전점수로 선별</small></div>
          <div><span>후보 수</span><b>최대 {MAX_DIRECT_WORK_ORDER_CANDIDATES}개</b><small>무제한 반복 제거</small></div>
          <div><span>관성 검증</span><b>출발·급정거·급회전</b><small>3종 시나리오</small></div>
          <div><span>보강재</span><b>자동 재산정</b><small>미끄럼방지·블로킹·고정바</small></div>
          <div><span>승인</span><b>관성 3종 PASS</b><small>PASS 전 작업지시서 잠금</small></div>
        </div>
      </article>

      {error && <div className="final-cert-error"><b>작업지시서 생성 불가</b><span>{error}</span></div>}
    </section>
  </div>;
}