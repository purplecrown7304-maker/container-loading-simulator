import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import { runPhysicsValidationSuite, type PhysicsScenario, type PhysicsValidationSuite } from './engine/physicsValidation';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { openPhysicsReport } from './physicsReport';
import { selectPlacement } from './selectionEvents';

export const OPEN_PHYSICS_VALIDATION_EVENT = 'container-loading:open-physics-validation';
export const PHYSICS_VALIDATION_RESULT_EVENT = 'container-loading:physics-validation-result';

type LoadingDetail = { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
type LoadingWindow = Window & {
  __containerLoadingLatestResult?: LoadingDetail;
  __containerLoadingLatestPhysics?: PhysicsValidationSuite;
};
type Status = 'idle' | 'running' | 'done' | 'error';

function scoreLabel(score: number) {
  if (score >= 95) return '매우 안정';
  if (score >= 85) return '안정';
  if (score >= 70) return '주의';
  return '재배치 필요';
}
function scoreClass(score: number) {
  if (score >= 95) return 'excellent';
  if (score >= 85) return 'good';
  if (score >= 70) return 'warn';
  return 'danger';
}
function mm(value: number) { return `${(value * 1000).toFixed(value * 1000 >= 10 ? 0 : 1)} mm`; }
function scenarioLabel(value: PhysicsScenario) {
  return value === 'settle' ? '정적 중력' : value === 'braking' ? '급제동 0.5g' : '횡가속 0.35g';
}

export default function PhysicsValidationTool() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [activeScenario, setActiveScenario] = useState<PhysicsScenario>('settle');
  const [validation, setValidation] = useState<PhysicsValidationSuite | null>(null);
  const [message, setMessage] = useState('');
  const detailRef = useRef<LoadingDetail | undefined>(undefined);
  const runIdRef = useRef(0);

  useEffect(() => {
    const physicsWindow = window as LoadingWindow;
    detailRef.current = physicsWindow.__containerLoadingLatestResult;
    setValidation(physicsWindow.__containerLoadingLatestPhysics ?? null);
    const onResult = (event: Event) => {
      detailRef.current = (event as CustomEvent<LoadingDetail>).detail;
      physicsWindow.__containerLoadingLatestPhysics = undefined;
      setValidation(null); setStatus('idle'); setProgress(0);
      setMessage('적재 결과가 변경되었습니다. 물리 검증을 다시 실행하세요.');
    };
    window.addEventListener(LOADING_RESULT_EVENT, onResult);
    return () => window.removeEventListener(LOADING_RESULT_EVENT, onResult);
  }, []);

  const run = useCallback(async () => {
    const detail = detailRef.current ?? (window as LoadingWindow).__containerLoadingLatestResult;
    if (!detail) { setStatus('error'); setMessage('먼저 자동 적재를 실행해 적재 결과를 만들어 주세요.'); return; }
    if (!detail.result.placements.length) { setStatus('error'); setMessage('현재 적재된 박스가 없습니다.'); return; }

    const runId = ++runIdRef.current;
    setStatus('running'); setValidation(null); setProgress(0); setActiveScenario('settle');
    setMessage('Rapier 3D 물리 월드를 준비하고 있습니다.');
    try {
      const result = await runPhysicsValidationSuite(detail.container, detail.result.placements, (value, scenario) => {
        if (runId !== runIdRef.current) return;
        setProgress(Math.round(value * 100)); setActiveScenario(scenario);
      });
      if (runId !== runIdRef.current) return;
      const physicsWindow = window as LoadingWindow;
      physicsWindow.__containerLoadingLatestPhysics = result;
      window.dispatchEvent(new CustomEvent(PHYSICS_VALIDATION_RESULT_EVENT, { detail: result }));
      setValidation(result); setStatus('done'); setProgress(100); setMessage(result.summary);
    } catch (error) {
      if (runId !== runIdRef.current) return;
      console.error('Physics validation failed', error);
      setStatus('error');
      setMessage('물리엔진을 실행하지 못했습니다. 브라우저를 새로고침한 뒤 다시 시도하세요.');
    }
  }, []);

  useEffect(() => {
    const onOpen = () => { setOpen(true); if (status !== 'running') void run(); };
    window.addEventListener(OPEN_PHYSICS_VALIDATION_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_PHYSICS_VALIDATION_EVENT, onOpen);
  }, [run, status]);

  const issues = useMemo(() => {
    if (!validation) return [];
    const rank = { unstable: 0, warning: 1, stable: 2 } as const;
    return [...validation.placements].filter(item => item.severity !== 'stable')
      .sort((a, b) => rank[a.severity] - rank[b.severity] || b.horizontalShiftM - a.horizontalShiftM || b.tiltDeg - a.tiltDeg)
      .slice(0, 30);
  }, [validation]);

  const printReport = () => {
    const detail = detailRef.current ?? (window as LoadingWindow).__containerLoadingLatestResult;
    if (!detail || !validation) return;
    if (!openPhysicsReport(detail.container, detail.cargo, detail.result, validation)) setMessage('팝업이 차단되어 물리 리포트를 열지 못했습니다.');
  };

  if (!open) return null;
  return createPortal(
    <div className="physics-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && status !== 'running') setOpen(false); }}>
      <section className="physics-modal" role="dialog" aria-modal="true" aria-labelledby="physics-title">
        <header className="physics-modal-head">
          <div><span className="physics-kicker">RAPIER 3D TRANSPORT PHYSICS</span><h2 id="physics-title">실제 물리 안정성 종합검증</h2><p>정적 중력뿐 아니라 급제동과 좌우 횡가속까지 같은 적재안에 적용해 미끄러짐·낙하·기울어짐을 검사합니다.</p></div>
          <div className="physics-head-actions">{validation && status !== 'running' && <button type="button" onClick={printReport}>리포트 / PDF</button>}<button type="button" onClick={() => setOpen(false)} disabled={status === 'running'}>닫기</button></div>
        </header>

        {status === 'running' && <div className="physics-running">
          <div className="physics-spinner" aria-hidden="true" />
          <b>{scenarioLabel(activeScenario)} 시뮬레이션 · {progress}%</b>
          <span>정적 중력 → 급제동 0.5g → 횡가속 0.35g 순으로 검증합니다.</span>
          <div className="physics-progress"><i style={{ width: `${progress}%` }} /></div>
        </div>}

        {status !== 'running' && validation && <>
          <div className="physics-score-row">
            <div className={`physics-score ${scoreClass(validation.score)}`}><strong>{validation.score}</strong><span>/ 100</span><b>{scoreLabel(validation.score)}</b></div>
            <div className="physics-summary"><b>{message}</b><span>최악 조건: {scenarioLabel(validation.worstScenario)} · 정적/급제동/횡가속 3개 시나리오 종합</span></div>
          </div>

          <div className="physics-scenarios">{validation.scenarios.map(row => <article key={row.scenario} className={scoreClass(row.score)}><span>{scenarioLabel(row.scenario)}</span><b>{row.score}점</b><small>불안정 {row.unstableCount} · 주의 {row.warningCount}</small></article>)}</div>

          <div className="physics-metrics">
            <article><span>안정</span><b>{validation.stableCount.toLocaleString()} EA</b></article>
            <article className={validation.warningCount ? 'warn' : ''}><span>주의</span><b>{validation.warningCount.toLocaleString()} EA</b></article>
            <article className={validation.unstableCount ? 'danger' : ''}><span>불안정</span><b>{validation.unstableCount.toLocaleString()} EA</b></article>
            <article><span>최대 수평 이동</span><b>{mm(validation.maxHorizontalShiftM)}</b></article>
            <article><span>최대 높이 변화</span><b>{mm(validation.maxVerticalShiftM)}</b></article>
            <article><span>최대 기울기</span><b>{validation.maxTiltDeg.toFixed(1)}°</b></article>
          </div>

          <div className="physics-settle-note"><span className={validation.settled ? 'ok' : 'warn'}>{validation.settled ? '✓' : '!'}</span><div><b>{validation.settled ? '모든 시나리오 종료 시 정지 상태' : '일부 시나리오 종료 시에도 움직임 감지'}</b><small>최대 속도 {validation.maxLinearSpeedMps.toFixed(3)} m/s · 회전속도 {validation.maxAngularSpeedRadps.toFixed(3)} rad/s</small></div></div>

          <section className="physics-issues">
            <div className="physics-section-head"><div><h3>재확인 위치</h3><span>{issues.length ? '세 시나리오 중 가장 나쁜 결과를 기준으로 최대 30개 표시합니다.' : '물리 기준을 넘은 위치가 없습니다.'}</span></div><button type="button" onClick={() => void run()}>다시 검증</button></div>
            {issues.length > 0 && <div className="physics-issue-list">{issues.map(item => <button key={item.index} type="button" className={item.severity} onClick={() => { selectPlacement(item.index); setOpen(false); }}><span className="physics-issue-badge">{item.severity === 'unstable' ? '불안정' : '주의'}</span><b>#{item.index + 1} · {item.cargoId}</b><small>{item.reason}</small><i>3D에서 보기 →</i></button>)}</div>}
          </section>
        </>}

        {status === 'error' && <div className="physics-empty"><b>검증을 시작할 수 없습니다.</b><span>{message}</span><button type="button" onClick={() => void run()}>다시 시도</button></div>}
        {status === 'idle' && <div className="physics-empty"><b>물리 검증 준비 완료</b><span>{message || '현재 적재 결과에 중력·급제동·횡가속을 적용합니다.'}</span><button type="button" onClick={() => void run()}>종합 물리 검증 시작</button></div>}
        <footer className="physics-footnote">0.5g 급제동과 0.35g 횡가속은 비교·경고용 기본 시나리오입니다. 실제 운송 안전 판정에는 차량·도로·고정장치·마찰계수·포장재 강도 등 회사/법규 기준을 별도로 적용해야 합니다.</footer>
      </section>
    </div>, document.body,
  );
}
