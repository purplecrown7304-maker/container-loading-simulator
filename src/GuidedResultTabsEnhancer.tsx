import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { analyzeConstraints } from './engine/constraintAnalysis';
import { analyzeFloorLoad } from './engine/floorLoad';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { assessWeightBalance } from './engine/weightBalance';
import { readLatestInertiaCertification } from './inertiaCertification';
import { STORAGE_UPDATED_EVENT } from './storage';

type ResultTab = 'result' | 'unloaded' | 'weight' | 'safety';
type Detail = { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
type ResultWindow = Window & { __containerLoadingLatestResult?: Detail };

const tabs: Array<{ id: ResultTab; label: string }> = [
  { id: 'result', label: '적재 결과' },
  { id: 'unloaded', label: '미적재' },
  { id: 'weight', label: '무게 분포' },
  { id: 'safety', label: '안전 검사' },
];

function readDetail() {
  return typeof window === 'undefined' ? undefined : (window as ResultWindow).__containerLoadingLatestResult;
}

export default function GuidedResultTabsEnhancer() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [stage, setStage] = useState<HTMLElement | null>(null);
  const [tab, setTab] = useState<ResultTab>('result');
  const [detail, setDetail] = useState<Detail | undefined>(() => readDetail());

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
        const originalTabs = nextStage.querySelector<HTMLElement>('.guided-result-tabs');
        if (originalTabs) originalTabs.style.display = 'none';
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
    const refresh = () => setDetail(readDetail());
    window.addEventListener(LOADING_RESULT_EVENT, refresh);
    window.addEventListener(STORAGE_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener(LOADING_RESULT_EVENT, refresh);
      window.removeEventListener(STORAGE_UPDATED_EVENT, refresh);
    };
  }, []);

  useEffect(() => {
    if (!stage) return;
    const grid = stage.querySelector<HTMLElement>('.guided-result-grid');
    const unloaded = stage.querySelector<HTMLElement>('.guided-unloaded-list');
    if (grid) grid.style.display = tab === 'result' ? '' : 'none';
    if (unloaded) unloaded.style.display = 'none';
  }, [stage, tab]);

  const analyses = useMemo(() => {
    if (!detail) return null;
    const floor = analyzeFloorLoad(detail.container, detail.result, 12, 4);
    const balance = assessWeightBalance(detail.container, detail.result);
    const checks = analyzeConstraints(detail.container, detail.cargo, detail.result, floor);
    const certification = readLatestInertiaCertification();
    return { floor, balance, checks, certification };
  }, [detail]);

  if (!host) return null;

  const result = detail?.result;
  const floorLimit = detail?.container.floorLoadLimitKgPerM2 ?? 1500;

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
            <div><span>앞뒤 무게중심 편차</span><b>{analyses.balance.longitudinalDeviationPct.toFixed(1)}%</b><small>컨테이너 중심 기준</small></div>
            <div><span>좌우 무게중심 편차</span><b>{analyses.balance.lateralDeviationPct.toFixed(1)}%</b><small>컨테이너 중심 기준</small></div>
            <div><span>무게중심 높이</span><b>{analyses.balance.verticalCenterPct.toFixed(1)}%</b><small>내부 높이 대비</small></div>
            <div><span>최대 바닥하중</span><b>{analyses.floor.maxKgPerM2.toFixed(0)} kg/m²</b><small>기준 {floorLimit.toLocaleString()} kg/m²</small></div>
            <div><span>적재 품질</span><b>{analyses.balance.grade} · {analyses.balance.loadingQualityScore.toFixed(0)}점</b><small>무게중심 + 형상 평가</small></div>
          </div>
          <div className="guided-weight-message-list">{analyses.balance.messages.slice(0, 5).map(message => <span key={message}>{message}</span>)}</div>
        </> : <div className="guided-result-empty">무게 분포를 계산할 적재 결과가 없습니다.</div>}
      </section>}

      {tab === 'safety' && <section className="guided-result-tab-panel">
        {analyses ? <div className="guided-safety-list">
          {analyses.checks.map(check => <article key={check.id} className={check.status}>
            <span className="guided-safety-icon">{check.status === 'pass' ? '✓' : check.status === 'warn' ? '!' : '×'}</span>
            <span><b>{check.label}</b><small>{check.detail}</small></span>
            <strong>{check.status === 'pass' ? '통과' : check.status === 'warn' ? '확인' : '실패'}</strong>
          </article>)}
          <article className={analyses.certification?.status === 'passed' ? 'pass' : 'warn'}>
            <span className="guided-safety-icon">{analyses.certification?.status === 'passed' ? '✓' : '!'}</span>
            <span><b>관성 3종 검사</b><small>{analyses.certification ? `검사 ${analyses.certification.testedScenarios}/3 · 최대 이동 ${(analyses.certification.maxHorizontalShiftM * 1000).toFixed(1)} mm` : '현재 결과와 일치하는 관성 검사 결과를 확인하세요.'}</small></span>
            <strong>{analyses.certification?.status === 'passed' ? '통과' : '확인'}</strong>
          </article>
        </div> : <div className="guided-result-empty">안전 검사를 표시할 적재 결과가 없습니다.</div>}
      </section>}
    </>,
    host,
  );
}
