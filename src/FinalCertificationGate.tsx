import { useCallback, useEffect, useRef, useState } from 'react';
import { buildDirectResultReoptimizationCandidates, type DirectResultReoptimizationCandidate } from './engine/finalResultOptimization';
import type { InertiaAnimationResult } from './engine/inertiaSimulation';
import { writeManualOverride } from './engine/manualOverride';
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
import { publishPhysicsTarget, readPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { openResultsModal } from './resultsModalEvents';
import { STORAGE_UPDATED_EVENT, type StoredState } from './storage';

const SCENARIO_LABEL = {
  acceleration: '출발 가속',
  braking: '급정거',
  cornering: '급회전',
} as const;

const EPS = 1e-9;

type CachedCertification = {
  signature: string;
  certification: InertiaCertification;
};

type EvaluatedDirectCandidate = DirectResultReoptimizationCandidate & {
  certification: InertiaCertification;
  risk: number;
};

type CertificationWindow = Window & { __containerLoadingLatestCertification?: InertiaCertification };

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
  const [repositionAttempt, setRepositionAttempt] = useState({ index: 0, total: 0, label: '' });
  const runId = useRef(0);
  const cache = useRef<CachedCertification | null>(null);

  const execute = useCallback(async (detail: CertificationRequestDetail, nextTarget: PhysicsTarget) => {
    const id = ++runId.current;
    const requestedSignature = createPhysicsTargetSignature(nextTarget);
    setRequest(detail);
    setTarget(nextTarget);
    setOpen(true);
    setRunning(true);
    setCertification(null);
    setLatestResult(null);
    setError('');
    setRepositionAttempt({ index: 0, total: 0, label: '' });
    setProgress({ level: 1, levelLabel: buildSecuringUsage(nextTarget, 1).levelLabel, scenario: 'acceleration', scenarioIndex: 1, scenarioCount: 3, physicsProgress: 0 });
    setUsage(buildSecuringUsage(nextTarget, 1));

    try {
      const result = await runInertiaCertification(
        nextTarget,
        nextProgress => {
          if (runId.current !== id) return;
          setProgress(nextProgress);
          setUsage(buildSecuringUsage(nextTarget, nextProgress.level));
        },
        (scenarioResult, level) => {
          if (runId.current !== id) return;
          setLatestResult(scenarioResult);
          setUsage(buildSecuringUsage(nextTarget, level));
        },
      );
      if (runId.current !== id) return;

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
        setRunning(false);
        setOpen(false);
        openResultsModal({ ...resultDetailFromTarget(nextTarget), certification: result });
        return;
      }

      if (!result.payloadWithinLimit) {
        setRunning(false);
        setError('보강 자재 중량까지 포함하면 컨테이너 최대 허용중량을 초과합니다. 적재량 또는 보강안을 조정해야 합니다.');
        return;
      }

      if (nextTarget.mode !== 'boxes') {
        setRunning(false);
        setError('최대 보강까지 적용했지만 전체 이동·기울기·화물-팔레트 상대 미끄럼·팔레트 자체 이동 중 하나 이상이 내부 안정 기준을 넘었습니다. 팔레트 작업지시서 최종화에서는 재배치 후보까지 자동 비교합니다.');
        return;
      }

      const candidates = buildDirectResultReoptimizationCandidates(nextTarget, 6);
      if (!candidates.length) {
        setRunning(false);
        setError('보강재만으로 통과하지 못했고, 같은 화물 수량을 유지하면서 만들 수 있는 추가 안전 재배치 후보가 없습니다. 적재량 또는 화물 조건을 조정해야 합니다.');
        return;
      }

      let bestPassed: EvaluatedDirectCandidate | null = null;
      let bestFailed: EvaluatedDirectCandidate | null = null;

      for (let index = 0; index < candidates.length; index += 1) {
        if (runId.current !== id) return;
        const candidate = candidates[index];
        setTarget(candidate.target);
        setRepositionAttempt({ index: index + 1, total: candidates.length, label: candidate.label });
        setUsage(buildSecuringUsage(candidate.target, 1));
        setLatestResult(null);

        const candidateCertification = await runInertiaCertification(
          candidate.target,
          nextProgress => {
            if (runId.current !== id) return;
            setProgress(nextProgress);
            setUsage(buildSecuringUsage(candidate.target, nextProgress.level));
          },
          (scenarioResult, level) => {
            if (runId.current !== id) return;
            setLatestResult(scenarioResult);
            setUsage(buildSecuringUsage(candidate.target, level));
          },
        );
        if (runId.current !== id) return;

        setCertification(candidateCertification);
        setUsage(candidateCertification.securing);
        const evaluated: EvaluatedDirectCandidate = {
          ...candidate,
          certification: candidateCertification,
          risk: certificationRisk(candidateCertification),
        };
        if (candidateCertification.status === 'passed') {
          if (!bestPassed || betterCandidate(evaluated, bestPassed)) bestPassed = evaluated;
        } else if (!bestFailed || betterCandidate(evaluated, bestFailed)) {
          bestFailed = evaluated;
        }
      }

      if (bestPassed) {
        applyDirectCandidate(bestPassed);
        cache.current = { signature: bestPassed.certification.targetSignature, certification: bestPassed.certification };
        setTarget(bestPassed.target);
        setCertification(bestPassed.certification);
        setUsage(bestPassed.certification.securing);
        setRunning(false);
        setOpen(false);
        openResultsModal({ ...resultDetailFromTarget(bestPassed.target), certification: bestPassed.certification });
        return;
      }

      if (bestFailed) {
        applyDirectCandidate(bestFailed);
        setTarget(bestFailed.target);
        setCertification(bestFailed.certification);
        setUsage(bestFailed.certification.securing);
        setRunning(false);
        setError(`자동 재배치 ${candidates.length}개를 모두 시험했지만 관성 3종 PASS에는 도달하지 못했습니다. 그중 가장 안전한 재배치안을 시뮬레이터에 적용했습니다. 이동·기울기 또는 적재량을 더 낮춰야 합니다.`);
        return;
      }

      setRunning(false);
      setError('자동 재배치 후보를 평가하지 못했습니다. 적재안을 수정한 뒤 다시 실행하세요.');
    } catch (reason) {
      if (runId.current !== id) return;
      console.error('Final inertia certification failed', reason);
      setRunning(false);
      setError('최종 관성 검증 또는 자동 재배치를 완료하지 못했습니다. 현재 적재안을 유지한 채 다시 실행할 수 있습니다.');
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

  return <div className="final-cert-backdrop">
    <section className="final-cert-modal" role="dialog" aria-modal="true" aria-labelledby="final-cert-title">
      <header>
        <div>
          <span>FINAL SAFETY GATE · RAPIER 3D · {palletMode ? 'PALLET' : 'DIRECT BOX'}</span>
          <h2 id="final-cert-title">최종 적재 결과 전 관성 검증</h2>
          <p>출발 가속 · 급정거 · 급회전을 모두 통과해야 최종 결과가 열립니다. 보강재로 부족하면 같은 화물 수량을 유지한 채 낮고 넓은 재배치 후보를 자동 생성해 다시 시험합니다.</p>
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
        <div className={certification?.status === 'passed' ? 'done' : ''}><b>✓</b><span>결과 공개</span></div>
      </div>

      {running && <div className="final-cert-running">
        <div className="physics-spinner" />
        <div>
          <b>{repositionAttempt.total > 0 ? `재배치 ${repositionAttempt.index}/${repositionAttempt.total} · ${repositionAttempt.label}` : `${progress?.levelLabel ?? '기본 적재'} · ${scenarioLabel}`}</b>
          <span>{repositionAttempt.total > 0 ? `${progress?.levelLabel ?? ''} · ${scenarioLabel} · 관성 프레임 ${progressPercent}%` : `관성 프레임 계산 ${progressPercent}%`}</span>
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
        <p>보조자재 중량은 ‘적재 보조자재 실제 중량 설정’의 현장값으로 계산합니다. 계산된 구속력은 내부 물리모델 비교값이며 실제 자재 정격을 대체하지 않습니다.</p>
      </article>}

      {error && <div className="final-cert-error"><b>최종 결과 잠금 유지</b><span>{error}</span></div>}

      {!running && error && <div className="final-cert-actions">
        {request && target && <button type="button" className="primary" onClick={() => void execute(request, target)}>자동 재배치 다시 최적화</button>}
        <button type="button" onClick={() => { setOpen(false); window.dispatchEvent(new Event(OPEN_INERTIA_TEST_EVENT)); }}>관성 테스트 자세히 보기</button>
        <button type="button" onClick={() => setOpen(false)}>적재안 수정</button>
      </div>}
    </section>
  </div>;
}
