import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { palletResultToLoadingResult } from './engine/palletContainerPlacement';
import { analyzeFloorLoad } from './engine/floorLoad';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { assessWeightBalance } from './engine/weightBalance';
import { useGuidedLoadingUnit } from './guidedLoadingUnitState';
import { INERTIA_CERTIFICATION_EVENT, createPhysicsTargetSignature, readLatestInertiaCertification } from './inertiaCertification';
import { usePalletSnapshot } from './palletSnapshotStore';
import { PHYSICS_TARGET_EVENT, readPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { LOAD_SIM_ACCEPTANCE_EVENT, createLoadSimTargetSignature, isLoadSimAcceptedTarget, readLoadSimAcceptance } from './rule-engine/acceptance';
import { readStoredState, STORAGE_UPDATED_EVENT } from './storage';

type ResultTab = 'result' | 'unloaded' | 'weight' | 'safety';
type Detail = { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
type ResultWindow = Window & { __containerLoadingLatestResult?: Detail };

const tabs: Array<{ id: ResultTab; label: string }> = [
  { id: 'result', label: '적재 결과' },
  { id: 'unloaded', label: '미적재' },
  { id: 'weight', label: '무게 분포' },
  { id: 'safety', label: '안전 검사' },
];

function readBoxDetail() {
  return typeof window === 'undefined' ? undefined : (window as ResultWindow).__containerLoadingLatestResult;
}

function buildPalletDetail(snapshot: ReturnType<typeof usePalletSnapshot>): Detail | undefined {
  const stored = readStoredState();
  if (!snapshot || !stored) return undefined;
  const result = palletResultToLoadingResult(snapshot.result, snapshot.spec);
  return { container: stored.container, cargo: stored.cargo, result };
}

export default function GuidedResultTabsEnhancer() {
  const loadingUnit = useGuidedLoadingUnit();
  const palletSnapshot = usePalletSnapshot();
  const [latestCertification, setLatestCertification] = useState(readLatestInertiaCertification);
  const [currentTarget, setCurrentTarget] = useState(readPhysicsTarget);
  const [acceptance, setAcceptance] = useState(readLoadSimAcceptance);
  useEffect(() => {
    const refresh = () => { setLatestCertification(readLatestInertiaCertification()); setCurrentTarget(readPhysicsTarget()); setAcceptance(readLoadSimAcceptance()); };
    window.addEventListener(INERTIA_CERTIFICATION_EVENT, refresh);
    window.addEventListener(LOAD_SIM_ACCEPTANCE_EVENT, refresh);
    window.addEventListener(PHYSICS_TARGET_EVENT, refresh);
    return () => { window.removeEventListener(INERTIA_CERTIFICATION_EVENT, refresh); window.removeEventListener(LOAD_SIM_ACCEPTANCE_EVENT, refresh); window.removeEventListener(PHYSICS_TARGET_EVENT, refresh); };
  }, []);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [stage, setStage] = useState<HTMLElement | null>(null);
  const [tab, setTab] = useState<ResultTab>('result');
  const [boxDetail, setBoxDetail] = useState<Detail | undefined>(() => readBoxDetail());

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const nextStage = document.querySelector<HTMLElement>('.guided-result-stage');
        if (!nextStage) {
          setStage(null);
          setHost(null);
          return;
        }
        // Only hide the stage's original children. The portal below uses the same
        // classes, so descendant queries would hide the live result on the next mutation.
        const originalTabs = nextStage.querySelector<HTMLElement>(':scope > .guided-result-tabs');
        const originalGrid = nextStage.querySelector<HTMLElement>(':scope > .guided-result-grid');
        const originalUnloaded = nextStage.querySelector<HTMLElement>(':scope > .guided-unloaded-list');
        if (originalTabs) originalTabs.style.display = 'none';
        if (originalGrid) originalGrid.style.display = 'none';
        if (originalUnloaded) originalUnloaded.style.display = 'none';
        let nextHost = nextStage.querySelector<HTMLElement>('.guided-result-tabs-enhancer-host');
        if (!nextHost) {
          nextHost = document.createElement('div');
          nextHost.className = 'guided-result-tabs-enhancer-host';
          originalTabs?.insertAdjacentElement('afterend', nextHost);
        }
        setStage(nextStage);
        setHost(nextHost);
      });
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const refresh = () => setBoxDetail(readBoxDetail());
    window.addEventListener(LOADING_RESULT_EVENT, refresh);
    window.addEventListener(STORAGE_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener(LOADING_RESULT_EVENT, refresh);
      window.removeEventListener(STORAGE_UPDATED_EVENT, refresh);
    };
  }, []);

  useEffect(() => {
    if (!stage) return;
    const grid = stage.querySelector<HTMLElement>(':scope > .guided-result-grid');
    const unloaded = stage.querySelector<HTMLElement>(':scope > .guided-unloaded-list');
    if (grid) grid.style.display = 'none';
    if (unloaded) unloaded.style.display = 'none';
  }, [stage, tab]);

  const detail = useMemo(
    () => {
      const expectedMode = loadingUnit === 'pallets' ? 'pallets' : 'boxes';
      return currentTarget?.mode === expectedMode ? currentTarget : expectedMode === 'pallets' ? buildPalletDetail(palletSnapshot) : boxDetail;
    },
    [loadingUnit, palletSnapshot, boxDetail, currentTarget],
  );

  const analyses = useMemo(() => {
    if (!detail) return null;
    const floor = analyzeFloorLoad(detail.container, detail.result, 12, 4);
    const balance = assessWeightBalance(detail.container, detail.result);
    const expectedMode = loadingUnit === 'pallets' ? 'pallets' : 'boxes';
    const target: PhysicsTarget = { ...detail, mode: expectedMode, supports: currentTarget?.mode === expectedMode ? currentTarget.supports : undefined };
    const certification = latestCertification?.targetSignature === createPhysicsTargetSignature(target) ? latestCertification : undefined;
    const proof = acceptance?.targetSignature === createLoadSimTargetSignature(target) ? acceptance : undefined;
    const accepted = isLoadSimAcceptedTarget(target);
    return { floor, balance, certification, proof, accepted };
  }, [detail, loadingUnit, latestCertification, currentTarget, acceptance]);

  if (!host) return null;

  const result = detail?.result;
  const floorLimit = detail?.container.floorLoadLimitKgPerM2 ?? 1500;
  const requested = detail?.cargo.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  const remaining = result?.remaining.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  const volume = detail ? detail.container.length * detail.container.width * detail.container.height : 0;
  const fillRate = result && volume > 0 ? result.usedVolumeM3 / volume * 100 : 0;
  const weightRate = result && detail && detail.container.maxPayloadKg > 0 ? result.loadedWeightKg / detail.container.maxPayloadKg * 100 : 0;
  const certificationLabel = analyses?.accepted ? '정적 검증 통과' : analyses?.proof?.status === 'rejected' ? '정적 검증 실패' : result ? '검증 대기' : '대기';

  return createPortal(
    <>
      <div className="guided-result-tabs interactive" role="tablist" aria-label="결과 확인 탭">
        {tabs.map(item => <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={tab === item.id}
          className={tab === item.id ? 'active' : ''}
          onClick={() => setTab(item.id)}
        >{item.label}</button>)}
      </div>

      {tab === 'result' && <section className="guided-result-tab-panel">
        {result && detail ? <div className="guided-result-grid enhanced">
          <div><span>요청</span><b>{requested.toLocaleString()} EA</b></div>
          <div className="good"><span>적재</span><b>{result.placements.length.toLocaleString()} EA</b></div>
          <div className={remaining ? 'warn' : 'good'}><span>미적재</span><b>{remaining.toLocaleString()} EA</b></div>
          <div><span>CBM 사용률</span><b>{fillRate.toFixed(1)}%</b></div>
          <div><span>중량 사용률</span><b>{weightRate.toFixed(1)}%</b></div>
          <div className={analyses?.accepted ? 'good' : ''}><span>작업 판정</span><b>{certificationLabel}</b></div>
        </div> : <div className="guided-result-empty">표시할 최종 적재 결과가 없습니다.</div>}
      </section>}

      {tab === 'unloaded' && <section className="guided-result-tab-panel">
        {result?.remaining.length ? <div className="guided-unloaded-list enhanced">
          {result.remaining.map(item => <article key={`${item.cargoId}-${item.reason}`}>
            <span><b>{item.cargoId}</b><small>{item.reason}</small></span><strong>{item.quantity} EA</strong>
          </article>)}
        </div> : <div className="guided-result-empty">미적재 화물이 없습니다. 등록된 적재 대상이 모두 배치되었습니다.</div>}
      </section>}

      {tab === 'weight' && <section className="guided-result-tab-panel">
        {analyses && detail ? <>
          <div className="guided-weight-grid">
            <div><span>총 적재중량</span><b>{detail.result.loadedWeightKg.toLocaleString()} kg</b><small>한도 {detail.container.maxPayloadKg.toLocaleString()} kg</small></div>
            <div><span>앞뒤 무게중심 편차</span><b>{analyses.balance.longitudinalDeviationPct.toFixed(1)}%</b><small>적재공간 중심 기준</small></div>
            <div><span>좌우 무게중심 편차</span><b>{analyses.balance.lateralDeviationPct.toFixed(1)}%</b><small>적재공간 중심 기준</small></div>
            <div><span>무게중심 높이</span><b>{analyses.balance.verticalCenterPct.toFixed(1)}%</b><small>내부 높이 대비</small></div>
            <div><span>최대 바닥하중</span><b>{analyses.floor.maxKgPerM2.toFixed(0)} kg/m²</b><small>기준 {floorLimit.toLocaleString()} kg/m²</small></div>
            <div><span>적재 품질</span><b>{analyses.balance.grade} · {analyses.balance.loadingQualityScore.toFixed(0)}점</b><small>무게중심 + 형상 평가</small></div>
          </div>
          <div className="guided-weight-message-list">{analyses.balance.messages.slice(0, 5).map(message => <span key={message}>{message}</span>)}</div>
        </> : <div className="guided-result-empty">무게 분포를 계산할 적재 결과가 없습니다.</div>}
      </section>}

      {tab === 'safety' && <section className="guided-result-tab-panel">
        {analyses ? <div className="guided-safety-list">
          <article className={analyses.accepted ? 'pass' : analyses.proof?.status === 'rejected' ? 'fail' : 'warn'}>
            <span className="guided-safety-icon">{analyses.accepted ? '✓' : '!'}</span>
            <span><b>1번 파일 정적 검증</b><small>{analyses.accepted ? '현재 배치에 1번 파일의 배치·중량·지지·적층·하역 규칙을 적용했습니다.' : analyses.proof?.status === 'rejected' ? '규칙 위반을 확인하고 다시 계산하세요.' : '현재 최종 배치의 정적 검증 결과가 없습니다.'}</small></span>
            <strong>{certificationLabel}</strong>
          </article>
          {analyses.proof?.validationIssues.map((issue, index) => <article key={`error-${index}`} className="fail"><span className="guided-safety-icon">×</span><span><b>{issue.type}</b><small>{issue.message}</small></span><strong>실패</strong></article>)}
          {analyses.proof?.operationalFindings.filter(finding => finding.severity === 'warning').map((finding, index) => <article key={`warning-${index}`} className="warn"><span className="guided-safety-icon">!</span><span><b>{finding.code}</b><small>{finding.message}</small></span><strong>확인</strong></article>)}
          <article className={analyses.certification?.status === 'passed' ? 'pass' : 'warn'}>
            <span className="guided-safety-icon">{analyses.certification?.status === 'passed' ? '✓' : '!'}</span>
            <span><b>관성 3종 검사 (선택)</b><small>{analyses.certification ? `검사 ${analyses.certification.testedScenarios}/3 · 최대 이동 ${(analyses.certification.maxHorizontalShiftM * 1000).toFixed(1)} mm` : '별도 관성 검사 미실행 · 정적 검증은 동적 안전 인증이 아닙니다.'}</small></span>
            <strong>{analyses.certification?.status === 'passed' ? '통과' : analyses.certification ? '확인' : '미실행'}</strong>
          </article>
        </div> : <div className="guided-result-empty">안전 검사를 표시할 적재 결과가 없습니다.</div>}
      </section>}
    </>,
    host,
  );
}
