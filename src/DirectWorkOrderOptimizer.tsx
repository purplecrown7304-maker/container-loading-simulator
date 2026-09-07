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
import {
  canCreateWorkOrder,
  completeCertificationForWorkOrder,
  workOrderApprovalLabel,
} from './inertiaWorkOrderPolicy';
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
    const automatic = detail.openReport === false;
    setOpen(!automatic);
    setRunning(true);
    setProgress(null);
    setMessage(automatic
      ? '최종 적재 진행 · 현재 적재 수량을 유지한 채 관성 상태를 자동 확인합니다.'
      : '현재 적재 수량을 유지하고 관성 결과는 작업지시서의 경고 정보로 확인합니다.');
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
    let bestFailed: Evaluated | null = null;

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
        setAttempt({ index: index + 1, total: candidates.length, label: candidate.label });
        setMessage(`${automatic ? '최종 적재 자동검증' : '관성 상태 확인'} ${index + 1}/${candidates.length} · ${candidate.label}`);
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
        if (canCreateWorkOrder(certification)) {
          applyCandidate(candidate, certification);
          setRunning(false);
          setMessage(`관성 상태 ${workOrderApprovalLabel(certification)} · ${candidate.label} · 작업지시서 생성 가능`);

          if (automatic) {
            setOpen(false);
            return;
          }

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
        setMessage(`관성 상태 확인 완료 · ${workOrderApprovalLabel(bestFailed.certification)} · ${bestFailed.label}`);
        if (automatic) setOpen(false);
      }
      setError('관성 상태 확인을 완료하지 못했습니다. 적재 수량은 유지됩니다.');
      if (!automatic) setOpen(true);
    } catch (reason) {
      if (cancelled()) return;
      console.error('Direct work-order inertia search failed', reason);
      setRunning(false);
      setOpen(true);
      setError('직접 적재 관성 검증을 완료하지 못했습니다. 현재 적재안과 적재 수량은 유지됩니다.');
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
          <span>FINAL WORK ORDER · DIRECT BOX</span>
          <h2 id="direct-work-order-title">작업지시서 관성 상태 확인</h2>
          <p>현재 적재 수량은 유지합니다. 관성 결과가 PASS·주의·위험·미완료 중 어느 상태여도 작업지시서를 생성하며, 위험 상태는 문서에 경고와 보완사항으로 표시합니다.</p>
        </div>
        {!running && <button type="button" onClick={() => setOpen(false)}>닫기</button>}
      </header>

      <div className="final-cert-running">
        {running && <div className="physics-spinner" />}
        <div><b>{message}</b><span>{attempt.total ? `배치 ${attempt.index}/${attempt.total} · 확인 ${percent}%` : '검증 준비 중'}</span></div>
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
          <div><span>상자 배치</span><b>적재량 우선</b><small>무게중심 때문에 수량 감소 금지</small></div>
          <div><span>무게중심</span><b>평가/경고</b><small>적재 차단 조건 아님</small></div>
          <div><span>하드 안전조건</span><b>계속 적용</b><small>경계·충돌·적층·중량</small></div>
          <div><span>관성 검증</span><b>상태 기록</b><small>출발·급정거·급회전</small></div>
          <div><span>주의 결과</span><b>작업지시서 생성</b><small>권장사항 자동 기입</small></div>
          <div><span>위험 결과</span><b>작업지시서 생성</b><small>위험 경고·워터마크 표시</small></div>
        </div>
      </article>

      {error && <div className="final-cert-error"><b>처리 알림</b><span>{error}</span></div>}
    </section>
  </div>;
}
