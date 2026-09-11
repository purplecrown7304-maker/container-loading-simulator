import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { analyzeConstraints, type ConstraintCheck } from './engine/constraintAnalysis';
import { analyzeFloorLoad, type FloorLoadAnalysis } from './engine/floorLoad';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { assessWeightBalance, type BalanceAssessment } from './engine/weightBalance';
import { OPEN_INERTIA_TEST_EVENT } from './inertiaTestEvents';
import { OPEN_PHYSICS_VALIDATION_EVENT } from './PhysicsValidationTool';
import { readPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import './safety-inspection-center.css';

export const OPEN_SAFETY_INSPECTION_CENTER_EVENT = 'container-loading:open-safety-inspection-center';

type LoadingDetail = { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
type LoadingWindow = Window & { __containerLoadingLatestResult?: LoadingDetail };
type LocalChecks = {
  constraints?: ConstraintCheck[];
  floorLoad?: FloorLoadAnalysis;
  balance?: BalanceAssessment;
};

export function openSafetyInspectionCenter() {
  window.dispatchEvent(new Event(OPEN_SAFETY_INSPECTION_CENTER_EVENT));
}

function currentTarget(): PhysicsTarget | undefined {
  const explicit = readPhysicsTarget();
  if (explicit) return explicit;
  const latest = (window as LoadingWindow).__containerLoadingLatestResult;
  return latest ? { mode: 'boxes', container: latest.container, cargo: latest.cargo, result: latest.result } : undefined;
}

function statusText(checks: ConstraintCheck[] | undefined) {
  if (!checks) return '미실행';
  const fail = checks.filter(item => item.status === 'fail').length;
  const warn = checks.filter(item => item.status === 'warn').length;
  return fail ? `실패 ${fail}건` : warn ? `확인 ${warn}건` : '전체 통과';
}

export default function SafetyInspectionCenter() {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<PhysicsTarget | undefined>();
  const [checks, setChecks] = useState<LocalChecks>({});
  const [message, setMessage] = useState('');

  useEffect(() => {
    const onOpen = () => {
      const next = currentTarget();
      setTarget(next);
      setChecks({});
      setMessage(next ? '자동 적재에서 사용한 최종 좌표를 기준으로 원하는 검증을 직접 실행하세요.' : '먼저 자동 적재를 실행해 검증할 적재 결과를 만들어 주세요.');
      setOpen(true);
    };
    window.addEventListener(OPEN_SAFETY_INSPECTION_CENTER_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SAFETY_INSPECTION_CENTER_EVENT, onOpen);
  }, []);

  const requireTarget = () => {
    const next = currentTarget();
    if (!next || (!next.result.placements.length && !(next.supports?.length))) {
      setMessage('검증할 적재 결과가 없습니다. 자동 적재를 먼저 실행하세요.');
      return undefined;
    }
    setTarget(next);
    return next;
  };

  const runConstraints = () => {
    const next = requireTarget();
    if (!next) return;
    const floorLoad = analyzeFloorLoad(next.container, next.result, 12, 4);
    const constraints = analyzeConstraints(next.container, next.cargo, next.result, floorLoad);
    setChecks(current => ({ ...current, constraints, floorLoad }));
    setMessage(`제약조건 검사를 다시 실행했습니다. ${statusText(constraints)}`);
  };

  const runBalance = () => {
    const next = requireTarget();
    if (!next) return;
    const balance = assessWeightBalance(next.container, next.result);
    setChecks(current => ({ ...current, balance }));
    setMessage(`무게중심 검사를 다시 실행했습니다. 품질 ${balance.grade} · ${balance.loadingQualityScore.toFixed(0)}점`);
  };

  const runFloorLoad = () => {
    const next = requireTarget();
    if (!next) return;
    const floorLoad = analyzeFloorLoad(next.container, next.result, 12, 4);
    setChecks(current => ({ ...current, floorLoad }));
    setMessage(`바닥하중 검사를 다시 실행했습니다. 최대 ${floorLoad.maxKgPerM2.toFixed(0)} kg/m²`);
  };

  const runQuickSet = () => {
    const next = requireTarget();
    if (!next) return;
    const floorLoad = analyzeFloorLoad(next.container, next.result, 12, 4);
    const constraints = analyzeConstraints(next.container, next.cargo, next.result, floorLoad);
    const balance = assessWeightBalance(next.container, next.result);
    setChecks({ constraints, floorLoad, balance });
    setMessage(`기본 안전검사 3종을 다시 실행했습니다. ${statusText(constraints)} · 무게중심 ${balance.grade}`);
  };

  const openPhysics = () => {
    if (!requireTarget()) return;
    setOpen(false);
    window.setTimeout(() => window.dispatchEvent(new Event(OPEN_PHYSICS_VALIDATION_EVENT)), 0);
  };

  const openInertia = () => {
    if (!requireTarget()) return;
    setOpen(false);
    window.setTimeout(() => window.dispatchEvent(new Event(OPEN_INERTIA_TEST_EVENT)), 0);
  };

  if (!open) return null;

  const failCount = checks.constraints?.filter(item => item.status === 'fail').length ?? 0;
  const warnCount = checks.constraints?.filter(item => item.status === 'warn').length ?? 0;
  const floorLimit = target?.container.floorLoadLimitKgPerM2 ?? 1500;
  const floorWarning = Boolean(checks.floorLoad && checks.floorLoad.maxKgPerM2 > floorLimit);

  return createPortal(
    <div className="safety-center-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="safety-center-dialog" role="dialog" aria-modal="true" aria-label="안전 점검">
        <header>
          <div><span>MANUAL VALIDATION CENTER</span><h2>안전 점검</h2><p>자동 적재 때 실행한 검증을 현재 적재 좌표에 사용자가 직접 다시 실행합니다.</p></div>
          <button type="button" onClick={() => setOpen(false)}>닫기</button>
        </header>

        <div className="safety-center-summary">
          <div><span>대상</span><b>{target ? `${target.mode === 'pallets' ? '팔레트' : '박스'} 적재 · ${target.result.placements.length} EA` : '적재 결과 없음'}</b></div>
          <button type="button" className="primary" disabled={!target} onClick={runQuickSet}>기본 안전검사 3종 실행</button>
        </div>

        <div className="safety-center-grid">
          <article className={failCount ? 'danger' : warnCount ? 'warn' : checks.constraints ? 'ok' : ''}>
            <div className="safety-center-card-head"><span>01</span><div><b>제약조건 검사</b><small>중량 · 경계/충돌 · 높이 · 적층 · 상부하중 · 문쪽 위험</small></div></div>
            <strong>{statusText(checks.constraints)}</strong>
            {checks.constraints && <div className="safety-center-results">{checks.constraints.map(item => <span key={item.id} className={item.status}><b>{item.label}</b><small>{item.detail}</small></span>)}</div>}
            <button type="button" disabled={!target} onClick={runConstraints}>검사 실행</button>
          </article>

          <article className={checks.balance ? (checks.balance.grade === 'A' || checks.balance.grade === 'B' ? 'ok' : checks.balance.grade === 'C' ? 'warn' : 'danger') : ''}>
            <div className="safety-center-card-head"><span>02</span><div><b>무게중심 검사</b><small>컨테이너 전체 중심 기준 앞뒤 · 좌우 · 높이 분포</small></div></div>
            <strong>{checks.balance ? `${checks.balance.grade} · ${checks.balance.loadingQualityScore.toFixed(0)}점` : '미실행'}</strong>
            {checks.balance && <div className="safety-center-metrics"><span>앞뒤 편차 <b>{checks.balance.longitudinalDeviationPct.toFixed(1)}%</b></span><span>좌우 편차 <b>{checks.balance.lateralDeviationPct.toFixed(1)}%</b></span><span>CG 높이 <b>{checks.balance.verticalCenterPct.toFixed(1)}%</b></span></div>}
            <button type="button" disabled={!target} onClick={runBalance}>검사 실행</button>
          </article>

          <article className={checks.floorLoad ? (floorWarning ? 'warn' : 'ok') : ''}>
            <div className="safety-center-card-head"><span>03</span><div><b>바닥하중 검사</b><small>12×4 격자로 실제 배치 중량의 바닥 투영 하중 재계산</small></div></div>
            <strong>{checks.floorLoad ? `${checks.floorLoad.maxKgPerM2.toFixed(0)} kg/m²` : '미실행'}</strong>
            {checks.floorLoad && <div className="safety-center-metrics"><span>평균 <b>{checks.floorLoad.averageKgPerM2.toFixed(0)}</b></span><span>최대 <b>{checks.floorLoad.maxKgPerM2.toFixed(0)}</b></span><span>기준 <b>{floorLimit.toFixed(0)}</b></span></div>}
            <button type="button" disabled={!target} onClick={runFloorLoad}>검사 실행</button>
          </article>

          <article>
            <div className="safety-center-card-head"><span>04</span><div><b>Rapier 3D 물리 검증</b><small>정적 중력 · 급제동 0.50g · 횡가속 0.35g</small></div></div>
            <strong>정밀 검증</strong>
            <p>자동 적재에 사용되는 동일 물리 검증 도구를 직접 실행합니다.</p>
            <button type="button" disabled={!target} onClick={openPhysics}>물리 검증 실행</button>
          </article>

          <article>
            <div className="safety-center-card-head"><span>05</span><div><b>관성 검증</b><small>출발 0.30g · 급정거 0.50g · 급회전 0.35g</small></div></div>
            <strong>동적 검증</strong>
            <p>실제 적재 좌표와 보강 조건으로 움직임을 직접 재생하고 확인합니다.</p>
            <button type="button" disabled={!target} onClick={openInertia}>관성 검증 실행</button>
          </article>
        </div>

        <footer>{message}</footer>
      </section>
    </div>,
    document.body,
  );
}
