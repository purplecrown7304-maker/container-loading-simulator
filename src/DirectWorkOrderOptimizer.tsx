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
  const live = readPhysicsTarget();
  if (live?.mode === 'boxes') return live;
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
    const current = requestTarget(detail);
    setOpen(true);
    setRunning(true);
    setProgress(null);
    setMessage('작업지시서가 나올 때까지 직접 적재 배치를 다시 탐색합니다.');
    setError('');

    if (!current.result.placements.length) {
      setRunning(false);
      setError('적재 결과가 없습니다. 먼저 자동 적재를 실행하세요.');
      return;
    }

    const initialSignature = createPhysicsTargetSignature(current);
    const baseline: Candidate = {
      label: '현재 적재안',
      result: current.result,
      target: current,
      staticPenalty: 0,
    };
    const candidates = [baseline, ...buildDirectResultReoptimizationCandidates(current, 9999)];
    setAttempt({ index: 0, total: candidates.length, label: '' });
    let bestFailed: Evaluated | null = null;

    for (let index = 0; index < candidates.length; index += 1) {
      if (runId.current !== id) return;
      const liveTarget = readPhysicsTarget();
      if (!liveTarget || createPhysicsTargetSignature(liveTarget) !== initialSignature) {
        setRunning(false);
        setError('반복 최적화 중 적재안이 변경되어 중단했습니다. 현재 적재안으로 작업지시서를 다시 실행하세요.');
        return;
      }
      const candidate = candidates[index];
      setAttempt({ index: index + 1, total: candidates.length, label: candidate.label });
      setMessage(`상자 재배치 ${index + 1}/${candidates.length} · ${candidate.label}`);
      const certification = await runInertiaCertification(candidate.target, next => {
        if (runId.current === id) setProgress(next);
      });
      if (runId.current !== id) return;

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

    if (runId.current !== id) return;
    setRunning(false);
    if (bestFailed) {
      applyCandidate(bestFailed, bestFailed.certification);
      setMessage(`유효 배치 전부 탐색 · 가장 안전한 실패안 적용 · ${bestFailed.label}`);
    }
    setError('같은 화물 수량과 제약조건을 유지해 만들 수 있는 직접 적재 배치를 모두 시험했지만 관성 3종 PASS가 나오지 않았습니다. 이 경우에는 작업지시서를 억지로 만들지 않습니다.');
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
          <h2 id="direct-work-order-title">작업지시서 전 상자 재배치 반복</h2>
          <p>같은 SKU 묶음과 무거운→가벼운 중량 흐름을 유지하면서 적재 높이와 전략을 계속 바꾸고, 관성 3종 PASS가 나오는 순간 작업지시서를 생성합니다.</p>
        </div>
        {!running && <button type="button" onClick={() => setOpen(false)}>닫기</button>}
      </header>

      <div className="final-cert-running">
        {running && <div className="physics-spinner" />}
        <div><b>{message}</b><span>{attempt.total ? `배치 ${attempt.index}/${attempt.total} · 전체 탐색 ${percent}%` : '후보 생성 중'}</span></div>
        <progress max="100" value={percent} />
      </div>

      {progress && <div className="final-cert-metrics">
        <span>현재 보강 <b>{progress.levelLabel}</b></span>
        <span>관성 시나리오 <b>{progress.scenarioIndex}/{progress.scenarioCount}</b></span>
        <span>현재 계산 <b>{Math.round(progress.physicsProgress * 100)}%</b></span>
        <span>탐색 원칙 <b>SKU 묶음 → 중량 흐름 → 낮은 높이 → PASS</b></span>
      </div>}

      <article className="final-cert-materials">
        <div className="final-cert-material-head"><div><b>자동 변경 항목</b><span>화물 수량은 유지</span></div><strong>{attempt.total || '-'}개 유효 배치</strong></div>
        <div className="final-cert-material-grid">
          <div><span>상자 배치</span><b>안정성/적재율/하역</b><small>적재 전략을 바꿔 재생성</small></div>
          <div><span>적재 높이</span><b>단계적으로 하향</b><small>무게중심을 낮춰 재시험</small></div>
          <div><span>품목 순서</span><b>동일 SKU 우선</b><small>혼합은 마지막 잔여공간</small></div>
          <div><span>중량 흐름</span><b>무거운→가벼운</b><small>가벼움-무거움-가벼움 방지</small></div>
          <div><span>보강재</span><b>자동 재산정</b><small>미끄럼방지·블로킹·고정바</small></div>
          <div><span>승인</span><b>관성 3종 PASS</b><small>PASS 전 작업지시서 잠금</small></div>
        </div>
      </article>

      {error && <div className="final-cert-error"><b>작업지시서 생성 불가</b><span>{error}</span></div>}
    </section>
  </div>;
}
