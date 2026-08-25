import { useCallback, useEffect, useRef, useState } from 'react';
import type { InertiaAnimationResult } from './engine/inertiaSimulation';
import {
  REQUEST_CERTIFIED_RESULTS_EVENT,
  buildSecuringUsage,
  createPhysicsTargetSignature,
  runInertiaCertification,
  type CertificationProgress,
  type CertificationRequestDetail,
  type InertiaCertification,
  type SecuringUsage,
} from './inertiaCertification';
import { OPEN_INERTIA_TEST_EVENT } from './inertiaTestEvents';
import { readPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { openResultsModal } from './resultsModalEvents';

const SCENARIO_LABEL = {
  acceleration: '출발 가속',
  braking: '급정거',
  cornering: '급회전',
} as const;

type CachedCertification = {
  signature: string;
  certification: InertiaCertification;
};

function targetFromRequest(detail: CertificationRequestDetail): PhysicsTarget {
  return readPhysicsTarget() ?? {
    mode: 'boxes',
    container: detail.container,
    cargo: detail.cargo,
    result: detail.result,
  };
}

function mm(value: number) {
  return `${(value * 1000).toFixed(value * 1000 >= 10 ? 0 : 1)} mm`;
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
  const runId = useRef(0);
  const cache = useRef<CachedCertification | null>(null);

  const execute = useCallback(async (detail: CertificationRequestDetail, nextTarget: PhysicsTarget) => {
    const id = ++runId.current;
    setRequest(detail);
    setTarget(nextTarget);
    setOpen(true);
    setRunning(true);
    setCertification(null);
    setLatestResult(null);
    setError('');
    setProgress({ level: 0, levelLabel: '보조 고정 없음', scenario: 'acceleration', scenarioIndex: 1, scenarioCount: 3, physicsProgress: 0 });
    setUsage(buildSecuringUsage(nextTarget, 0));

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
      setCertification(result);
      setUsage(result.securing);
      setRunning(false);
      if (result.status === 'passed') {
        cache.current = { signature: createPhysicsTargetSignature(nextTarget), certification: result };
        setOpen(false);
        openResultsModal({ ...detail, certification: result });
      } else if (!result.payloadWithinLimit) {
        setError('보강 자재 중량까지 포함하면 컨테이너 최대 허용중량을 초과합니다. 적재량 또는 보강안을 조정해야 합니다.');
      } else {
        setError('최대 보강까지 적용했지만 3개 관성 시나리오를 모두 안정 기준 안으로 만들지 못했습니다. 적재 높이·배치·중량 중심을 수정해야 합니다.');
      }
    } catch (reason) {
      if (runId.current !== id) return;
      console.error('Final inertia certification failed', reason);
      setRunning(false);
      setError('최종 관성 검증을 완료하지 못했습니다. 적재안을 유지한 채 다시 실행할 수 있습니다.');
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
        openResultsModal({ ...detail, certification: cache.current.certification });
        return;
      }
      void execute(detail, nextTarget);
    };
    window.addEventListener(REQUEST_CERTIFIED_RESULTS_EVENT, onRequest);
    return () => window.removeEventListener(REQUEST_CERTIFIED_RESULTS_EVENT, onRequest);
  }, [execute]);

  useEffect(() => () => { runId.current += 1; }, []);

  if (!open) return null;
  const currentUsage = usage ?? (target ? buildSecuringUsage(target, 0) : null);
  const scenarioLabel = progress ? SCENARIO_LABEL[progress.scenario] : '-';
  const progressPercent = progress ? Math.round(progress.physicsProgress * 100) : 0;
  const palletMode = target?.mode === 'pallets';

  return <div className="final-cert-backdrop">
    <section className="final-cert-modal" role="dialog" aria-modal="true" aria-labelledby="final-cert-title">
      <header>
        <div>
          <span>FINAL SAFETY GATE · RAPIER 3D · {palletMode ? 'PALLET' : 'DIRECT BOX'}</span>
          <h2 id="final-cert-title">최종 적재 결과 전 관성 검증</h2>
          <p>출발 가속 · 급정거 · 급회전을 모두 통과해야 최종 결과가 열립니다. 실패하면 적재 방식에 맞는 고정 보조재를 자동 적용해 다시 시험합니다.</p>
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
        <div><b>{progress?.levelLabel ?? '기본 적재'} · {scenarioLabel}</b><span>관성 프레임 계산 {progressPercent}%</span></div>
        <progress max="100" value={progressPercent} />
      </div>}

      {latestResult && <div className="final-cert-metrics">
        <span>현재 최대 이동 <b>{mm(latestResult.maxHorizontalShiftM)}</b></span>
        <span>현재 최대 기울기 <b>{latestResult.maxTiltDeg.toFixed(1)}°</b></span>
        <span>통과 기준 <b>≤ 12 mm / ≤ 1.8°</b></span>
      </div>}

      {currentUsage && <article className="final-cert-materials">
        <div className="final-cert-material-head"><div><b>자동 적용 적재 보조재</b><span>{currentUsage.levelLabel}</span></div><strong>박스 제외 약 {currentUsage.estimatedNonCargoWeightKg.toFixed(1)} kg</strong></div>
        <div className="final-cert-material-grid">
          {palletMode && <div><span>팔레트</span><b>{currentUsage.palletCount} EA</b><small>{currentUsage.palletWeightKg.toFixed(1)} kg</small></div>}
          {palletMode && <div><span>밴딩</span><b>{currentUsage.bandingStraps} 줄</b><small>{currentUsage.bandingLengthM.toFixed(1)} m</small></div>}
          {palletMode && <div><span>각대</span><b>{currentUsage.cornerGuards} EA</b><small>모서리 보호</small></div>}
          {palletMode && <div><span>랩핑</span><b>{currentUsage.wrappingLengthM.toFixed(0)} m</b><small>스트레치 필름</small></div>}
          <div><span>미끄럼방지재</span><b>{currentUsage.antiSlipMats} EA</b><small>{palletMode ? '팔레트/바닥' : '박스/바닥'}</small></div>
          {!palletMode && <div><span>블로킹재</span><b>{currentUsage.dunnageBlocks} EA</b><small>빈 공간 이동 억제</small></div>}
          <div><span>고정바</span><b>{currentUsage.loadBars} EA</b><small>길이 방향 고정</small></div>
        </div>
        <p>자재 중량은 실제 자재 규격이 입력되기 전까지 시뮬레이션 비교용 기본 단위중량으로 추정합니다. 최종 현장 작업 전 실제 팔레트·밴딩·각대·필름·블로킹재·고정바 규격으로 교체 계산해야 합니다.</p>
      </article>}

      {error && <div className="final-cert-error"><b>최종 결과 잠금 유지</b><span>{error}</span></div>}

      {!running && error && <div className="final-cert-actions">
        {request && target && <button type="button" className="primary" onClick={() => void execute(request, target)}>같은 적재안 다시 검증</button>}
        <button type="button" onClick={() => { setOpen(false); window.dispatchEvent(new Event(OPEN_INERTIA_TEST_EVENT)); }}>관성 테스트 자세히 보기</button>
        <button type="button" onClick={() => setOpen(false)}>적재안 수정</button>
      </div>}
    </section>
  </div>;
}