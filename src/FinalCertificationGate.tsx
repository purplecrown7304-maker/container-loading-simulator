import { useCallback, useEffect, useRef, useState } from 'react';
import { buildDirectResultReoptimizationCandidates, type DirectResultReoptimizationCandidate } from './engine/finalResultOptimization';
import type { InertiaAnimationResult } from './engine/inertiaSimulation';
import { LOADING_STRATEGY_STORAGE_KEY } from './engine/loadingEngine';
import { normalizeLoadingStrategy } from './engine/loadingStrategies';
import { writeManualOverride } from './engine/manualOverride';
import {
  applyPalletAdaptiveCandidate,
  betterPalletEvaluation,
  buildPalletAdaptiveCandidates,
  palletCertificationRisk,
  readPalletSnapshot,
  type EvaluatedPalletCandidate,
} from './engine/palletAdaptiveSearch';
import { runPhysicsValidationSuite } from './engine/physicsValidation';
import { publishFinalLayout } from './finalLayout';
import {
  INERTIA_CERTIFICATION_EVENT,
  INERTIA_PASS_PALLET_CARGO_SLIP_M,
  INERTIA_PASS_SHIFT_M,
  INERTIA_PASS_SUPPORT_SHIFT_M,
  INERTIA_PASS_TILT_DEG,
  REQUEST_CERTIFIED_RESULTS_EVENT,
  buildSecuringUsage,
  clearLatestInertiaCertification,
  createPhysicsTargetSignature,
  runInertiaCertification,
  type CertificationProgress,
  type CertificationRequestDetail,
  type InertiaCertification,
  type SecuringUsage,
} from './inertiaCertification';
import { OPEN_INERTIA_TEST_EVENT } from './inertiaTestEvents';
import { publishLoadingWorkflowProgress } from './loadingWorkflow';
import { publishPhysicsTarget, readPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { openResultsModal } from './resultsModalEvents';
import { STORAGE_UPDATED_EVENT, type StoredState } from './storage';

const SCENARIO_LABEL = {
  acceleration: '출발 가속',
  braking: '급정거',
  cornering: '급회전',
} as const;

const EPS = 1e-9;
const MAX_DIRECT_REPOSITION_CANDIDATES = 6;
const MAX_PALLET_REPOSITION_CANDIDATES = 6;

type CachedCertification = {
  signature: string;
  certification: InertiaCertification;
};

type EvaluatedDirectCandidate = DirectResultReoptimizationCandidate & {
  certification: InertiaCertification;
  risk: number;
};

type CertificationWindow = Window & { __containerLoadingLatestCertification?: InertiaCertification };

function activeStrategy() {
  if (typeof window === 'undefined') return normalizeLoadingStrategy(undefined);
  return normalizeLoadingStrategy(window.localStorage.getItem(LOADING_STRATEGY_STORAGE_KEY));
}

function targetFromRequest(detail: CertificationRequestDetail): PhysicsTarget {
  return readPhysicsTarget() ?? {
    mode: 'boxes',
    container: detail.container,
    cargo: detail.cargo,
    result: detail.result,
  };
}

function resultDetailFromTarget(target: PhysicsTarget) {
  return { container: target.container, cargo: target.cargo, result: target.result };
}

function mm(value: number) {
  return `${(value * 1000).toFixed(value * 1000 >= 10 ? 0 : 1)} mm`;
}

function certificationRisk(result: InertiaCertification) {
  const shift = result.maxHorizontalShiftM / Math.max(EPS, INERTIA_PASS_SHIFT_M);
  const tilt = result.maxTiltDeg / Math.max(EPS, INERTIA_PASS_TILT_DEG);
  const slip = result.mode === 'pallets'
    ? (result.maxCargoRelativeSlipM ?? 0) / Math.max(EPS, INERTIA_PASS_PALLET_CARGO_SLIP_M)
    : 0;
  const support = result.mode === 'pallets'
    ? (result.maxSupportShiftM ?? 0) / Math.max(EPS, INERTIA_PASS_SUPPORT_SHIFT_M)
    : 0;
  return Math.max(shift, tilt, slip, support) + (shift + tilt + slip + support) * 0.15 + result.securing.level * 0.03;
}

function betterCandidate(a: EvaluatedDirectCandidate, b: EvaluatedDirectCandidate) {
  if (Math.abs(a.risk - b.risk) > 1e-6) return a.risk < b.risk;
  if (a.certification.securing.level !== b.certification.securing.level) return a.certification.securing.level < b.certification.securing.level;
  return a.staticPenalty < b.staticPenalty;
}

function publishCertification(certification: InertiaCertification) {
  (window as CertificationWindow).__containerLoadingLatestCertification = certification;
  window.dispatchEvent(new CustomEvent<InertiaCertification>(INERTIA_CERTIFICATION_EVENT, { detail: certification }));
}

function applyDirectCandidate(candidate: EvaluatedDirectCandidate) {
  const target = candidate.target;
  writeManualOverride(target.container, target.cargo, target.result);
  const state: StoredState = { container: target.container, cargo: target.cargo };
  window.dispatchEvent(new CustomEvent<StoredState>(STORAGE_UPDATED_EVENT, { detail: state }));
  publishPhysicsTarget(target);
  publishCertification(candidate.certification);
}

function publishVerifiedFinal(target: PhysicsTarget, certification: InertiaCertification, source: 'baseline' | 'auto-rearranged') {
  publishFinalLayout({
    mode: target.mode,
    strategy: activeStrategy(),
    container: target.container,
    cargo: target.cargo,
    result: target.result,
    certification,
    verifiedAt: new Date().toISOString(),
    source,
  });
  publishLoadingWorkflowProgress({
    mode: target.mode,
    strategy: activeStrategy(),
    phase: 'complete',
    percent: 100,
    title: '최종 적재 확정',
    detail: `${source === 'auto-rearranged' ? '자동 재배치 검증안' : '기본 검증안'} · finalLayout 생성 완료`,
  });
}

function physicsRejected(physics: Awaited<ReturnType<typeof runPhysicsValidationSuite>>) {
  return physics.unstableCount + physics.supportUnstableCount > 0 || !physics.settled;
}

export default function FinalCertificationGate() {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [request, setRequest] = useState<CertificationRequestDetail | null>(null);
  const [target, setTarget] = useState<PhysicsTarget | null>(null);
  const [progress, setProgress] = useState<CertificationProgress | null>(null);
  const [latestResult, setLatestResult] = useState<InertiaAnimationResult | null>(null);
  const [usage, setUsage] = useState<SecuringUsage | null>(null);
  const [certification, setCertification] = useState<InertiaCertification | null>(null);
  const [error, setError] = useState('');
  const [repositionAttempt, setRepositionAttempt] = useState({ index: 0, label: '' });
  const runId = useRef(0);
  const cache = useRef<CachedCertification | null>(null);

  const execute = useCallback(async (detail: CertificationRequestDetail, nextTarget: PhysicsTarget) => {
    const id = ++runId.current;
    const requestedSignature = createPhysicsTargetSignature(nextTarget);
    const cancelled = () => runId.current !== id;
    setRequest(detail);
    setTarget(nextTarget);
    setOpen(true);
    setRunning(true);
    setCertification(null);
    setLatestResult(null);
    setError('');
    setRepositionAttempt({ index: 0, label: '' });
    setProgress({ level: 1, levelLabel: buildSecuringUsage(nextTarget, 1).levelLabel, scenario: 'acceleration', scenarioIndex: 1, scenarioCount: 3, physicsProgress: 0 });
    setUsage(buildSecuringUsage(nextTarget, 1));
    publishLoadingWorkflowProgress({
      mode: nextTarget.mode,
      strategy: activeStrategy(),
      phase: 'inertia-validation',
      percent: 72,
      title: '관성 테스트 자동 실행',
      detail: '출발 가속 · 급정거 · 급회전',
    });

    try {
      const result = await runInertiaCertification(
        nextTarget,
        nextProgress => {
          if (cancelled()) return;
          setProgress(nextProgress);
          setUsage(buildSecuringUsage(nextTarget, nextProgress.level));
        },
        (scenarioResult, level) => {
          if (cancelled()) return;
          setLatestResult(scenarioResult);
          setUsage(buildSecuringUsage(nextTarget, level));
        },
        cancelled,
      );
      if (cancelled()) return;

      const currentTarget = readPhysicsTarget();
      const stillCurrent = Boolean(currentTarget && createPhysicsTargetSignature(currentTarget) === requestedSignature && result.targetSignature === requestedSignature);
      if (!stillCurrent) {
        clearLatestInertiaCertification();
        cache.current = null;
        setCertification(null);
        setRunning(false);
        setError('관성 검증 중 적재안 또는 보조자재 설정이 변경되어 이전 검증 결과를 폐기했습니다. 현재 적재안으로 다시 검증하세요.');
        return;
      }

      setCertification(result);
      setUsage(result.securing);
      if (result.status === 'passed') {
        cache.current = { signature: requestedSignature, certification: result };
        publishVerifiedFinal(nextTarget, result, 'baseline');
        setRunning(false);
        setOpen(false);
        openResultsModal({ ...resultDetailFromTarget(nextTarget), certification: result });
        return;
      }

      if (!result.payloadWithinLimit) {
        setRunning(false);
        setError('보강 자재 중량까지 포함하면 컨테이너 최대 허용중량을 초과합니다. 적재량 또는 보강안을 조정해야 합니다.');
        publishLoadingWorkflowProgress({ mode: nextTarget.mode, strategy: activeStrategy(), phase: 'failed', percent: 100, title: '최종 검증 실패', detail: '최대 허용중량 초과 · finalLayout 미확정' });
        return;
      }

      if (nextTarget.mode === 'pallets') {
        const snapshot = readPalletSnapshot();
        if (!snapshot) {
          setRunning(false);
          setError('팔레트 재배치에 필요한 현재 팔레트 스냅샷을 찾지 못했습니다. 기존 확정 배치를 유지합니다.');
          publishLoadingWorkflowProgress({ mode: 'pallets', strategy: activeStrategy(), phase: 'failed', percent: 100, title: '팔레트 재배치 실패', detail: '스냅샷 없음 · finalLayout 미확정' });
          return;
        }
        const palletCandidates = buildPalletAdaptiveCandidates(nextTarget, snapshot, MAX_PALLET_REPOSITION_CANDIDATES);
        let bestFailed: EvaluatedPalletCandidate | null = null;
        let attempted = 0;

        for (const candidate of palletCandidates) {
          if (cancelled()) return;
          attempted += 1;
          setTarget(candidate.target);
          setRepositionAttempt({ index: attempted, label: candidate.label });
          setUsage(buildSecuringUsage(candidate.target, 1));
          setLatestResult(null);
          publishLoadingWorkflowProgress({
            mode: 'pallets',
            strategy: activeStrategy(),
            phase: 'rearranging',
            percent: 74 + Math.round((attempted - 1) / Math.max(1, palletCandidates.length) * 16),
            title: '팔레트 자동 재배치',
            detail: `${candidate.label} · ${attempted}/${palletCandidates.length}`,
            attempt: attempted,
            attemptTotal: palletCandidates.length,
          });

          const physics = await runPhysicsValidationSuite(
            candidate.target.container,
            candidate.target.result.placements,
            undefined,
            candidate.target.supports ?? [],
          );
          if (cancelled()) return;
          if (physicsRejected(physics)) continue;

          publishLoadingWorkflowProgress({
            mode: 'pallets',
            strategy: activeStrategy(),
            phase: 'revalidation',
            percent: 82 + Math.round((attempted - 1) / Math.max(1, palletCandidates.length) * 14),
            title: '팔레트 물리·관성 재검증',
            detail: `${candidate.label} · Rapier PASS 후 관성 3종`,
            attempt: attempted,
            attemptTotal: palletCandidates.length,
          });

          const candidateCertification = await runInertiaCertification(
            candidate.target,
            nextProgress => {
              if (cancelled()) return;
              setProgress(nextProgress);
              setUsage(buildSecuringUsage(candidate.target, nextProgress.level));
            },
            (scenarioResult, level) => {
              if (cancelled()) return;
              setLatestResult(scenarioResult);
              setUsage(buildSecuringUsage(candidate.target, level));
            },
            cancelled,
          );
          if (cancelled()) return;
          setCertification(candidateCertification);
          setUsage(candidateCertification.securing);
          const evaluated: EvaluatedPalletCandidate = {
            ...candidate,
            certification: candidateCertification,
            risk: palletCertificationRisk(candidateCertification),
          };

          if (candidateCertification.status === 'passed') {
            publishLoadingWorkflowProgress({ mode: 'pallets', strategy: activeStrategy(), phase: 'finalizing', percent: 98, title: '검증된 팔레트 배치 확정', detail: candidate.label });
            applyPalletAdaptiveCandidate(candidate, candidateCertification);
            publishVerifiedFinal(candidate.target, candidateCertification, 'auto-rearranged');
            cache.current = { signature: candidateCertification.targetSignature, certification: candidateCertification };
            setTarget(candidate.target);
            setCertification(candidateCertification);
            setRunning(false);
            setOpen(false);
            openResultsModal({ ...resultDetailFromTarget(candidate.target), certification: candidateCertification });
            return;
          }
          if (!bestFailed || betterPalletEvaluation(evaluated, bestFailed)) bestFailed = evaluated;
        }

        setRunning(false);
        const diagnostic = bestFailed ? ` 가장 낮은 위험 후보: ${bestFailed.label}.` : '';
        setError(`팔레트 자동 재배치 ${attempted}개를 물리·관성 재검증했지만 PASS에 도달하지 못했습니다.${diagnostic} 실패 후보는 적용하지 않고 기존 확정 배치를 유지합니다.`);
        publishLoadingWorkflowProgress({ mode: 'pallets', strategy: activeStrategy(), phase: 'failed', percent: 100, title: '팔레트 최종 검증 실패', detail: '실패 후보는 finalLayout으로 확정하지 않았습니다.' });
        return;
      }

      const candidates = buildDirectResultReoptimizationCandidates(nextTarget, MAX_DIRECT_REPOSITION_CANDIDATES);
      if (!candidates.length) {
        setRunning(false);
        setError('보강재만으로 통과하지 못했고, 같은 화물 수량을 유지하면서 만들 수 있는 추가 고유 재배치안이 없습니다. 적재량 또는 화물 조건을 조정해야 합니다.');
        return;
      }

      let bestFailed: EvaluatedDirectCandidate | null = null;
      let attempted = 0;

      for (const candidate of candidates) {
        if (cancelled()) return;
        attempted += 1;
        setTarget(candidate.target);
        setRepositionAttempt({ index: attempted, label: candidate.label });
        setUsage(buildSecuringUsage(candidate.target, 1));
        setLatestResult(null);
        publishLoadingWorkflowProgress({ mode: 'boxes', strategy: activeStrategy(), phase: 'rearranging', percent: 76, title: '상자 자동 재배치', detail: candidate.label, attempt: attempted, attemptTotal: candidates.length });

        const physics = await runPhysicsValidationSuite(candidate.target.container, candidate.target.result.placements, undefined, candidate.target.supports ?? []);
        if (cancelled()) return;
        if (physicsRejected(physics)) continue;

        publishLoadingWorkflowProgress({ mode: 'boxes', strategy: activeStrategy(), phase: 'revalidation', percent: 85, title: '재배치 재검증', detail: `${candidate.label} · Rapier PASS 후 관성 3종`, attempt: attempted, attemptTotal: candidates.length });
        const candidateCertification = await runInertiaCertification(
          candidate.target,
          nextProgress => {
            if (cancelled()) return;
            setProgress(nextProgress);
            setUsage(buildSecuringUsage(candidate.target, nextProgress.level));
          },
          (scenarioResult, level) => {
            if (cancelled()) return;
            setLatestResult(scenarioResult);
            setUsage(buildSecuringUsage(candidate.target, level));
          },
          cancelled,
        );
        if (cancelled()) return;

        setCertification(candidateCertification);
        setUsage(candidateCertification.securing);
        const evaluated: EvaluatedDirectCandidate = {
          ...candidate,
          certification: candidateCertification,
          risk: certificationRisk(candidateCertification),
        };

        if (candidateCertification.status === 'passed') {
          applyDirectCandidate(evaluated);
          publishVerifiedFinal(evaluated.target, evaluated.certification, 'auto-rearranged');
          cache.current = { signature: evaluated.certification.targetSignature, certification: evaluated.certification };
          setTarget(evaluated.target);
          setCertification(evaluated.certification);
          setUsage(evaluated.certification.securing);
          setRunning(false);
          setOpen(false);
          openResultsModal({ ...resultDetailFromTarget(evaluated.target), certification: evaluated.certification });
          return;
        }

        if (!bestFailed || betterCandidate(evaluated, bestFailed)) bestFailed = evaluated;
      }

      setRunning(false);
      const diagnostic = bestFailed ? ` 가장 낮은 위험 후보: ${bestFailed.label}.` : '';
      setError(`상자 재배치 ${attempted}개를 재검증했지만 PASS에 도달하지 못했습니다.${diagnostic} 실패 후보는 적용하지 않고 기존 확정 배치를 유지합니다.`);
      publishLoadingWorkflowProgress({ mode: 'boxes', strategy: activeStrategy(), phase: 'failed', percent: 100, title: '최종 검증 실패', detail: '실패 후보는 finalLayout으로 확정하지 않았습니다.' });
    } catch (reason) {
      if (cancelled()) return;
      console.error('Final inertia certification failed', reason);
      setRunning(false);
      setError('최종 관성 검증 또는 자동 재배치를 완료하지 못했습니다. 기존 확정 배치를 유지합니다.');
      publishLoadingWorkflowProgress({ mode: nextTarget.mode, strategy: activeStrategy(), phase: 'failed', percent: 100, title: '최종 검증 오류', detail: '오류 후보는 finalLayout으로 확정하지 않았습니다.' });
    }
  }, []);

  useEffect(() => {
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<CertificationRequestDetail>).detail;
      if (!detail) return;
      const nextTarget = targetFromRequest(detail);
      if (!nextTarget.result.placements.length) {
        setRequest(detail);
        setTarget(nextTarget);
        setOpen(true);
        setRunning(false);
        setError('관성 검증할 적재 결과가 없습니다. 먼저 자동 적재를 실행하세요.');
        return;
      }
      const signature = createPhysicsTargetSignature(nextTarget);
      if (cache.current?.signature === signature && cache.current.certification.status === 'passed') {
        publishVerifiedFinal(nextTarget, cache.current.certification, 'baseline');
        openResultsModal({ ...resultDetailFromTarget(nextTarget), certification: cache.current.certification });
        return;
      }
      void execute(detail, nextTarget);
    };
    window.addEventListener(REQUEST_CERTIFIED_RESULTS_EVENT, onRequest);
    return () => window.removeEventListener(REQUEST_CERTIFIED_RESULTS_EVENT, onRequest);
  }, [execute]);

  useEffect(() => () => { runId.current += 1; }, []);

  if (!open) return null;
  const currentUsage = usage ?? (target ? buildSecuringUsage(target, 1) : null);
  const scenarioLabel = progress ? SCENARIO_LABEL[progress.scenario] : '-';
  const progressPercent = progress ? Math.round(progress.physicsProgress * 100) : 0;
  const palletMode = target?.mode === 'pallets';
  const maxReposition = palletMode ? MAX_PALLET_REPOSITION_CANDIDATES : MAX_DIRECT_REPOSITION_CANDIDATES;

  return <div className="final-cert-backdrop">
    <section className="final-cert-modal" role="dialog" aria-modal="true" aria-labelledby="final-cert-title">
      <header>
        <div>
          <span>FINAL SAFETY GATE · RAPIER 3D · {palletMode ? 'PALLET' : 'DIRECT BOX'}</span>
          <h2 id="final-cert-title">최종 적재 결과 전 관성 검증</h2>
          <p>출발 가속 · 급정거 · 급회전을 모두 검증합니다. 실패하면 제한된 재배치 후보를 Rapier 물리검증부터 다시 실행하며, 검증을 통과한 후보만 최종 결과로 확정합니다.</p>
        </div>
        {!running && <button type="button" onClick={() => setOpen(false)}>닫기</button>}
      </header>

      <div className="final-cert-flow">
        <div className={progress?.scenarioIndex === 1 ? 'active' : certification?.testedScenarios ? 'done' : ''}><b>1</b><span>출발 가속</span></div>
        <i />
        <div className={progress?.scenarioIndex === 2 ? 'active' : (certification?.testedScenarios ?? 0) >= 2 ? 'done' : ''}><b>2</b><span>급정거</span></div>
        <i />
        <div className={progress?.scenarioIndex === 3 ? 'active' : certification?.passedScenarios === 3 ? 'done' : ''}><b>3</b><span>급회전</span></div>
        <i />
        <div className={certification?.status === 'passed' ? 'done' : ''}><b>✓</b><span>finalLayout</span></div>
      </div>

      {running && <div className="final-cert-running">
        <div className="physics-spinner" />
        <div>
          <b>{repositionAttempt.index > 0 ? `재배치 ${repositionAttempt.index}/${maxReposition} · ${repositionAttempt.label}` : `${progress?.levelLabel ?? '기본 적재'} · ${scenarioLabel}`}</b>
          <span>{repositionAttempt.index > 0 ? `${progress?.levelLabel ?? ''} · ${scenarioLabel} · 물리 계산 ${progressPercent}%` : `물리 계산 ${progressPercent}%`}</span>
        </div>
        <progress max="100" value={progressPercent} />
      </div>}

      {latestResult && <div className="final-cert-metrics">
        <span>전체 이동 <b>{mm(latestResult.maxHorizontalShiftM)}</b></span>
        <span>기울기 <b>{latestResult.maxTiltDeg.toFixed(1)}°</b></span>
        {palletMode && <span>화물↔팔레트 미끄럼 <b>{mm(latestResult.maxCargoRelativeSlipM ?? 0)}</b></span>}
        {palletMode && <span>팔레트 이동 <b>{mm(latestResult.maxSupportShiftM ?? 0)}</b></span>}
        {(latestResult.maxCargoRestraintForceN ?? 0) > 0 && <span>화물 구속력 <b>{((latestResult.maxCargoRestraintForceN ?? 0) / 1000).toFixed(1)} kN</b></span>}
        {(latestResult.maxSupportRestraintForceN ?? 0) > 0 && <span>팔레트 구속력 <b>{((latestResult.maxSupportRestraintForceN ?? 0) / 1000).toFixed(1)} kN</b></span>}
        <span>통과 기준 <b>이동 ≤ {Math.round(INERTIA_PASS_SHIFT_M * 1000)}mm · 기울기 ≤ {INERTIA_PASS_TILT_DEG.toFixed(1)}°{palletMode ? ` · 상대미끄럼 ≤ ${Math.round(INERTIA_PASS_PALLET_CARGO_SLIP_M * 1000)}mm · 팔레트이동 ≤ ${Math.round(INERTIA_PASS_SUPPORT_SHIFT_M * 1000)}mm` : ''}</b></span>
      </div>}

      {currentUsage && <article className="final-cert-materials">
        <div className="final-cert-material-head"><div><b>자동 적용 적재 보조재</b><span>{currentUsage.levelLabel}</span></div><strong>박스 제외 약 {currentUsage.estimatedNonCargoWeightKg.toFixed(1)} kg</strong></div>
        <div className="final-cert-material-grid">
          {palletMode && currentUsage.palletCount > 0 && <div><span>팔레트</span><b>{currentUsage.palletCount} EA</b><small>{currentUsage.palletWeightKg.toFixed(1)} kg</small></div>}
          {palletMode && currentUsage.bandingStraps > 0 && <div><span>밴딩</span><b>{currentUsage.bandingStraps} 줄</b><small>{currentUsage.bandingLengthM.toFixed(1)} m</small></div>}
          {palletMode && currentUsage.cornerGuards > 0 && <div><span>각대</span><b>{currentUsage.cornerGuards} EA</b><small>총 {currentUsage.cornerGuardLengthM.toFixed(1)} m</small></div>}
          {palletMode && currentUsage.wrappingLengthM > 0 && <div><span>랩핑</span><b>{currentUsage.wrappingLengthM.toFixed(0)} m</b><small>스트레치 필름</small></div>}
          {currentUsage.antiSlipMats > 0 && <div><span>미끄럼방지재</span><b>{currentUsage.antiSlipMats} EA</b><small>{palletMode ? '팔레트/바닥' : '박스/바닥'}</small></div>}
          {!palletMode && currentUsage.dunnageBlocks > 0 && <div><span>블로킹재</span><b>{currentUsage.dunnageBlocks} EA</b><small>빈 공간 이동 억제</small></div>}
          {currentUsage.loadBars > 0 && <div><span>고정바</span><b>{currentUsage.loadBars} EA</b><small>길이 방향 고정</small></div>}
        </div>
        <p>보조자재 중량은 현장 설정값으로 계산합니다. 계산된 구속력은 내부 물리모델 비교값이며 실제 자재 정격을 대체하지 않습니다.</p>
      </article>}

      {error && <div className="final-cert-error"><b>최종 결과 잠금 유지</b><span>{error}</span></div>}

      {!running && error && <div className="final-cert-actions">
        {request && target && <button type="button" className="primary" onClick={() => void execute(request, target)}>현재 조건으로 다시 탐색</button>}
        <button type="button" onClick={() => { setOpen(false); window.dispatchEvent(new Event(OPEN_INERTIA_TEST_EVENT)); }}>관성 테스트 자세히 보기</button>
        <button type="button" onClick={() => setOpen(false)}>적재안 수정</button>
      </div>}
    </section>
  </div>;
}