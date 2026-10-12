import { inspectionProgressText } from './inspectionPresentation';
import { uiText as uiT, uiMessage, useUiLanguage } from './uiLanguage';
import { isLimitReviewTarget, LIMIT_REVIEW_WARNING } from './limitReviewPresentation';
import { readLoadingStrategyPreference } from './loadingStrategyPreference';
import { useCallback, useEffect, useRef, useState } from 'react';
import { REQUEST_DIRECT_WORK_ORDER_EVENT, type DirectWorkOrderRequest } from './directWorkOrderEvents';
import { DIRECT_SEARCH_TIMEOUT_MS, automaticAlternativeLimit, buildDirectResultReoptimizationCandidatesAsync, buildSecuringPayloadAdjustmentCandidateAsync, type DirectResultReoptimizationCandidate, type DirectSearchProgress } from './engine/finalResultOptimization';
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
  assessWorkOrderCertification,
  completeCertificationForWorkOrder,
  isInertiaCertificationComplete,
  isPhysicsTargetVerified,
  workOrderTargetApprovalLabel,
} from './inertiaWorkOrderPolicy';
import { publishPhysicsTarget, readPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { openLoadingReport } from './report';
import { STORAGE_UPDATED_EVENT, type StoredState } from './storage';
import { WORKFLOW_INPUT_INVALIDATED_EVENT } from './workflowPreview';
import { publishVerificationCancelled, publishVerificationFailure } from './workflowVerificationState';

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
  // Unrun (zero-motion) payload failures can never outrank tested feasible plans.
  if (a.certification.payloadWithinLimit !== b.certification.payloadWithinLimit) return a.certification.payloadWithinLimit;
  const aComplete = isInertiaCertificationComplete(a.certification), bComplete = isInertiaCertificationComplete(b.certification);
  if (aComplete !== bComplete) return aComplete;
  const aPassed = isPhysicsTargetVerified(a.target, a.certification), bPassed = isPhysicsTargetVerified(b.target, b.certification);
  if (aPassed !== bPassed) return aPassed;
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
  useUiLanguage();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [attempt, setAttempt] = useState({ index: 0, total: 0, label: '' });
  const [progress, setProgress] = useState<CertificationProgress | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState<DirectSearchProgress | null>(null);
  const [notice, setNotice] = useState('');
  const [readyReport, setReadyReport] = useState<Evaluated | null>(null);
  const runId = useRef(0);
  const activeSearch = useRef<AbortController | null>(null);
  const sourceSignature = useRef('');

  const cancel = useCallback(() => {
    runId.current += 1;
    activeSearch.current?.abort();
    setRunning(false);
    setOpen(false);
  }, []);

  const finish = useCallback((candidate: Evaluated, automatic: boolean) => {
    const live = readPhysicsTarget();
    if (!live || createPhysicsTargetSignature(live) !== sourceSignature.current) {
      setRunning(false);
      setOpen(true);
      setReadyReport(null);
      setError('적재안이 변경되었습니다. 현재 적재안으로 다시 실행하세요.');
      return;
    }
    applyCandidate(candidate, candidate.certification);
    sourceSignature.current = candidate.certification.targetSignature;
    setReadyReport(candidate);
    setSearch(null);
    setRunning(false);
    setMessage(`${isInertiaCertificationComplete(candidate.certification) ? '검사 완료' : '검증 미완료'} · ${workOrderTargetApprovalLabel(candidate.target, candidate.certification)} · ${candidate.label}`);
    if (automatic) { setOpen(false); return; }
    if (openLoadingReport(candidate.target.container, candidate.target.cargo, candidate.target.result)) {
      setOpen(false);
    } else {
      setOpen(true);
      setError('팝업이 차단되었습니다. 아래 작업지시서 열기를 누르면 재계산 없이 열 수 있습니다.');
    }
  }, []);

  const execute = useCallback(async (detail: DirectWorkOrderRequest) => {
    activeSearch.current?.abort();
    const controller = new AbortController();
    activeSearch.current = controller;
    const id = ++runId.current;
    const cancelled = () => runId.current !== id;
    const current = requestTarget(detail);
    const automatic = detail.openReport === false;
    setOpen(!automatic);
    setRunning(true);
    setProgress(null);
    setSearch(null);
    setReadyReport(null);
    setNotice('');
    setMessage(detail.preserveSelectedPlan
      ? '사용자가 선택한 적재안을 유지하고 관성 3종을 검증합니다.'
      : automatic
        ? '최종 적재 진행 · 관성 3종과 안전 후보를 자동 검증합니다.'
        : '현재 적재안과 안전성이 높은 소수 재배치 후보를 관성 검증합니다.');
    setError('');

    if (!current.result.placements.length) {
      setRunning(false);
      setOpen(true);
      setError('적재 결과가 없습니다. 먼저 자동 적재를 실행하세요.');
      return;
    }

    publishPhysicsTarget(current);
    const initialSignature = createPhysicsTargetSignature(current);
    sourceSignature.current = initialSignature;
    const checkCurrent = () => {
      const live = readPhysicsTarget();
      if (!live || createPhysicsTargetSignature(live) !== initialSignature) throw new Error('LOADING_TARGET_CHANGED');
    };
    const baseline: Candidate = {
      label: '현재 적재안',
      result: current.result,
      target: current,
      staticPenalty: 0,
    };
    // Manual work-order requests may stop on an acceptable baseline.
    // Automatic final loading always compares the baseline with low-CG alternatives,
    // even when the baseline technically passes, so the first tall arrangement does
    // not become final merely because securing materials made it pass.
    const candidates = [baseline];
    setAttempt({ index: 0, total: candidates.length, label: '' });
    let bestEvaluated: Evaluated | null = null;
    let searchNotice = '';

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
        setSearch(null);
        setProgress(null);
        setAttempt({ index: index + 1, total: candidates.length, label: candidate.label });
        setMessage(`${automatic ? '최종 적재 자동검증' : '상자 재배치'} ${index + 1}/${candidates.length} · ${candidate.label}`);
        const initialCertification = await runInertiaCertification(
          candidate.target,
          next => { if (!cancelled()) setProgress(next); },
          undefined,
          cancelled,
        );
        if (cancelled()) return;
        checkCurrent();

        const certification = await completeCertificationForWorkOrder(
          candidate.target,
          initialCertification,
          next => { if (!cancelled()) setProgress(next); },
          undefined,
          cancelled,
        );
        if (cancelled()) return;
        checkCurrent();

        const evaluated: Evaluated = { ...candidate, certification, risk: certificationRisk(certification) };
        if (detail.preserveSelectedPlan) {
          finish({ ...evaluated, certification: { ...certification, searchNotice: '사용자가 선택한 적재안을 유지한 채 관성 검증했습니다.' } }, automatic);
          return;
        }
        if (isLimitReviewTarget(candidate.target)) {
          finish({ ...evaluated, certification: { ...certification, searchNotice: LIMIT_REVIEW_WARNING } }, automatic);
          return;
        }
        const approval = assessWorkOrderCertification(certification);
        // Manual report generation keeps its existing fast path. Automatic final
        // loading never short-circuits on the baseline: it compares the same cargo
        // quantity against lower/safer layouts before publishing the final scene.
        if (!automatic && (approval === 'pass' || approval === 'caution') && candidate.target.result.validationIssues.length === 0 && !(candidate.target.result.operationalFindings ?? []).some(finding => finding.severity === 'error')) {
          finish({ ...evaluated, certification: { ...certification, searchNotice: searchNotice || undefined } }, false);
          return;
        }
        if (!bestEvaluated || better(evaluated, bestEvaluated)) bestEvaluated = evaluated;
        setReadyReport(bestEvaluated);
        if (index === 0) {
          setProgress(null);
          if (!certification.payloadWithinLimit) {
            setMessage('보강재 중량을 확보하는 적재량 조정안을 계산 중입니다.');
            const adjusted = await buildSecuringPayloadAdjustmentCandidateAsync(current, readLoadingStrategyPreference() ?? 'capacity', controller.signal);
            if (cancelled()) return;
            checkCurrent();
            if (adjusted) {
              const removed = Math.max(0, current.result.placements.length - adjusted.result.placements.length);
              searchNotice = `보강재 중량을 확보하기 위해 적재량을 조정했습니다. 기존 적재 화물 ${removed}개는 미적재 수량에 포함되며 출하 수량을 확인해야 합니다.`;
              setNotice(searchNotice);
              candidates.push(adjusted);
            }
            // One payload-budgeted retry only; same-count layouts cannot repair this failure.
            continue;
          }
          const alternativeLimit = automatic
            ? automaticAlternativeLimit(MAX_DIRECT_WORK_ORDER_CANDIDATES - 1, current.result.placements.length)
            : MAX_DIRECT_WORK_ORDER_CANDIDATES - 1;
          if (alternativeLimit < MAX_DIRECT_WORK_ORDER_CANDIDATES - 1) {
            searchNotice = alternativeLimit === 0
              ? `대량 적재(박스 ${current.result.placements.length.toLocaleString()}개)라 대체 배치 비교를 생략하고 현재 적재안만 관성 검증했습니다.`
              : `대량 적재(박스 ${current.result.placements.length.toLocaleString()}개)라 대체 배치는 최대 ${alternativeLimit}개만 비교했습니다.`;
            setNotice(searchNotice);
          }
          if (alternativeLimit === 0) continue;
          setMessage('동일 수량을 유지하는 안전 재배치 후보를 계산 중입니다.');
          const alternatives = await buildDirectResultReoptimizationCandidatesAsync(current, alternativeLimit, cancelled, {
            strategy: readLoadingStrategyPreference() ?? undefined,
            signal: controller.signal,
            onProgress: next => { if (!cancelled()) setSearch(next); },
          });
          if (cancelled()) return;
          checkCurrent();
          if (alternatives.timedOut) {
            searchNotice = [searchNotice, '추가 배치 계산 시간 제한에 도달했습니다. 계산과 검증이 완료된 배치만 비교했으며 모든 후보를 탐색한 결과는 아닙니다.'].filter(Boolean).join(' ');
            setNotice(searchNotice);
          }
          candidates.push(...alternatives.candidates);
        }
      }

      if (cancelled()) return;
      setRunning(false);
      if (!bestEvaluated) {
        setError('관성 결과를 만들지 못했습니다. 현재 적재안을 유지합니다.');
        if (!automatic) setOpen(true);
        return;
      }

      finish({ ...bestEvaluated, certification: { ...bestEvaluated.certification, searchNotice: searchNotice || undefined } }, automatic);
    } catch (reason) {
      if (cancelled()) return;
      console.error('Direct work-order inertia search failed', reason);
      setRunning(false);
      setOpen(true);
      setSearch(null);
      if (reason instanceof Error && reason.message === 'LOADING_TARGET_CHANGED') setReadyReport(null);
      setError('직접 적재 관성 검증을 완료하지 못했습니다. 현재 적재안을 유지합니다.');
      publishVerificationFailure(reason, current);
    }
  }, [finish]);

  useEffect(() => {
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<DirectWorkOrderRequest>).detail;
      if (detail) void execute(detail);
    };
    window.addEventListener(REQUEST_DIRECT_WORK_ORDER_EVENT, onRequest);
    return () => window.removeEventListener(REQUEST_DIRECT_WORK_ORDER_EVENT, onRequest);
  }, [execute]);

  useEffect(() => () => { runId.current += 1; activeSearch.current?.abort(); }, []);

  useEffect(() => {
    const onInputChange = () => { cancel(); setReadyReport(null); setProgress(null); setSearch(null); };
    window.addEventListener(WORKFLOW_INPUT_INVALIDATED_EVENT, onInputChange);
    return () => window.removeEventListener(WORKFLOW_INPUT_INVALIDATED_EVENT, onInputChange);
  }, [cancel]);

  if (!open) return null;
  // A completed scenario is not a completed optimization. Never show overall 100% while running.
  const percent = !running ? (readyReport ? 100 : 0) : search
    ? Math.min(99, Math.round(search.completed / Math.max(1, search.total) * 100))
    : Math.min(99, Math.round(((progress?.scenarioIndex ?? 1) - 1 + (progress?.physicsProgress ?? 0)) / (progress?.scenarioCount ?? 3) * 100));
  return <div className="final-cert-backdrop">
    <section className="final-cert-modal" role="dialog" aria-modal="true" aria-labelledby="direct-work-order-title">
      <header>
        <div>
          <span>FINAL WORK ORDER OPTIMIZER · DIRECT BOX</span>
          <h2 id="direct-work-order-title">{uiT("작업지시서 전 상자 안전 후보 비교")}</h2>
          <p>{uiT("출발 가속 · 급정거 · 급회전 3종을 비교해 더 안전한 배치를 우선합니다. 미통과 결과는 출고 승인 없이 위험 경고·보강 권장사항을 포함한 검토용 문서로만 생성합니다.")}</p>
        </div>
        <button type="button" onClick={() => { if (running) publishVerificationCancelled(); cancel(); }}>{running ? uiT("계산 취소") : uiT("닫기")}</button>
      </header>

      {isLimitReviewTarget(readyReport?.target ?? readPhysicsTarget()) && <p className="final-cert-error" role="alert">{uiMessage(LIMIT_REVIEW_WARNING)}</p>}
      <div className="final-cert-running">
        {running && <div className="physics-spinner" />}
        <div><b>{inspectionProgressText(message)}</b><span>{search ? uiT("추가 배치 계산 {0}/{1}회 · 최대 {2}초 · {3}", [search.completed, search.total, DIRECT_SEARCH_TIMEOUT_MS / 1000, inspectionProgressText(search.label)]) : uiT("배치 {0}/{1} · {2}", [attempt.index, attempt.total, running ? uiT('관성 검사 중') : uiT('비교 완료')])}</span></div>
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
          <div><span>{uiT("상자 배치")}</span><b>{uiT("안정성/적재율/하역")}</b><small>{uiT("전략별 고유 배치만 비교")}</small></div>
          <div><span>{uiT("적재 높이")}</span><b>{uiT("저중심 후보 우선")}</b><small>{uiT("정적 안전점수로 선별")}</small></div>
          <div><span>{uiT("후보 수")}</span><b>{uiT("최대")} {MAX_DIRECT_WORK_ORDER_CANDIDATES}{uiT("개")}</b><small>{uiT("추가 배치 계산 최대")} {DIRECT_SEARCH_TIMEOUT_MS / 1000}{uiT("초")}</small></div>
          <div><span>{uiT("관성 검증")}</span><b>{uiT("출발·급정거·급회전")}</b><small>{uiT("가능한 3종 모두 확인")}</small></div>
          <div><span>{uiT("주의 결과")}</span><b>{uiT("작업지시서 생성")}</b><small>{uiT("권장사항 자동 기입")}</small></div>
          <div><span>{uiT("위험 결과")}</span><b>{uiT("경고 포함 생성")}</b><small>{uiT("가장 낮은 위험안 + 보강 권장")}</small></div>
        </div>
      </article>

      {notice && <p role="status">{uiMessage(notice)}</p>}
      {error && <div className="final-cert-error"><b>{uiT("검증 처리 확인")}</b><span>{uiMessage(error)}</span></div>}
      {readyReport && <div className="final-cert-actions">
        <button type="button" className="primary" onClick={() => {
          runId.current += 1;
          activeSearch.current?.abort();
          finish(running ? { ...readyReport, certification: { ...readyReport.certification, searchNotice: '추가 후보 비교를 중단하고 완료된 관성 검증 결과로 발급했습니다.' } } : readyReport, false);
        }}>{running ? uiT("비교 중단하고 현재 검증 결과로 발급") : uiT("작업지시서 열기")}</button>
        <span>{uiT("검증 등급:")} {inspectionProgressText(workOrderTargetApprovalLabel(readyReport.target, readyReport.certification))} {uiT("· 경고와 권장사항을 포함합니다.")}</span>
      </div>}
    </section>
  </div>;
}
