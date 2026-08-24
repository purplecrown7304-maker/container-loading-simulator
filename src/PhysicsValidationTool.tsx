import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import { runPhysicsValidation, type PhysicsValidationResult } from './engine/physicsValidation';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { selectPlacement } from './selectionEvents';

export const OPEN_PHYSICS_VALIDATION_EVENT = 'container-loading:open-physics-validation';

type LoadingDetail = { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
type LoadingWindow = Window & { __containerLoadingLatestResult?: LoadingDetail };

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

function mm(value: number) {
  return `${(value * 1000).toFixed(value * 1000 >= 10 ? 0 : 1)} mm`;
}

export default function PhysicsValidationTool() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [validation, setValidation] = useState<PhysicsValidationResult | null>(null);
  const [message, setMessage] = useState('');
  const detailRef = useRef<LoadingDetail | undefined>(undefined);
  const runIdRef = useRef(0);

  useEffect(() => {
    detailRef.current = (window as LoadingWindow).__containerLoadingLatestResult;
    const onResult = (event: Event) => {
      detailRef.current = (event as CustomEvent<LoadingDetail>).detail;
      setValidation(null);
      setStatus('idle');
      setProgress(0);
      setMessage('적재 결과가 변경되었습니다. 물리 검증을 다시 실행하세요.');
    };
    window.addEventListener(LOADING_RESULT_EVENT, onResult);
    return () => window.removeEventListener(LOADING_RESULT_EVENT, onResult);
  }, []);

  const run = useCallback(async () => {
    const detail = detailRef.current ?? (window as LoadingWindow).__containerLoadingLatestResult;
    if (!detail) {
      setStatus('error');
      setMessage('먼저 자동 적재를 실행해 적재 결과를 만들어 주세요.');
      return;
    }
    if (!detail.result.placements.length) {
      setStatus('error');
      setMessage('현재 적재된 박스가 없습니다.');
      return;
    }

    const runId = ++runIdRef.current;
    setStatus('running');
    setValidation(null);
    setProgress(0);
    setMessage('Rapier 3D 물리 월드를 준비하고 있습니다.');
    try {
      const result = await runPhysicsValidation(detail.container, detail.result.placements, value => {
        if (runId === runIdRef.current) setProgress(Math.round(value * 100));
      });
      if (runId !== runIdRef.current) return;
      setValidation(result);
      setStatus('done');
      setProgress(100);
      setMessage(result.summary);
    } catch (error) {
      if (runId !== runIdRef.current) return;
      console.error('Physics validation failed', error);
      setStatus('error');
      setMessage('물리엔진을 실행하지 못했습니다. 브라우저를 새로고침한 뒤 다시 시도하세요.');
    }
  }, []);

  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      if (status !== 'running') void run();
    };
    window.addEventListener(OPEN_PHYSICS_VALIDATION_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_PHYSICS_VALIDATION_EVENT, onOpen);
  }, [run, status]);

  const issues = useMemo(() => {
    if (!validation) return [];
    const rank = { unstable: 0, warning: 1, stable: 2 } as const;
    return [...validation.placements]
      .filter(item => item.severity !== 'stable')
      .sort((a, b) => rank[a.severity] - rank[b.severity] || b.horizontalShiftM - a.horizontalShiftM)
      .slice(0, 30);
  }, [validation]);

  if (!open) return null;
  return createPortal(
    <div className="physics-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && status !== 'running') setOpen(false); }}>
      <section className="physics-modal" role="dialog" aria-modal="true" aria-labelledby="physics-title">
        <header className="physics-modal-head">
          <div>
            <span className="physics-kicker">RAPIER 3D PHYSICS CHECK</span>
            <h2 id="physics-title">실제 물리 안정성 검증</h2>
            <p>현재 적재 좌표를 그대로 두고 중력·충돌·마찰을 적용해 박스가 미끄러지거나 쓰러지는지 검사합니다.</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} disabled={status === 'running'}>닫기</button>
        </header>

        {status === 'running' && <div className="physics-running">
          <div className="physics-spinner" aria-hidden="true" />
          <b>물리 시뮬레이션 실행 중 {progress}%</b>
          <span>박스가 안정될 때까지 가상 시간을 진행하고 있습니다.</span>
          <div className="physics-progress"><i style={{ width: `${progress}%` }} /></div>
        </div>}

        {status !== 'running' && validation && <>
          <div className="physics-score-row">
            <div className={`physics-score ${scoreClass(validation.score)}`}>
              <strong>{validation.score}</strong><span>/ 100</span><b>{scoreLabel(validation.score)}</b>
            </div>
            <div className="physics-summary">
              <b>{message}</b>
              <span>{validation.simulatedCount.toLocaleString()}개 박스 · 가상 {validation.simulatedSeconds.toFixed(1)}초 · {validation.steps} step</span>
            </div>
          </div>

          <div className="physics-metrics">
            <article><span>안정</span><b>{validation.stableCount.toLocaleString()} EA</b></article>
            <article className={validation.warningCount ? 'warn' : ''}><span>주의</span><b>{validation.warningCount.toLocaleString()} EA</b></article>
            <article className={validation.unstableCount ? 'danger' : ''}><span>불안정</span><b>{validation.unstableCount.toLocaleString()} EA</b></article>
            <article><span>최대 수평 이동</span><b>{mm(validation.maxHorizontalShiftM)}</b></article>
            <article><span>최대 높이 변화</span><b>{mm(validation.maxVerticalShiftM)}</b></article>
            <article><span>최대 기울기</span><b>{validation.maxTiltDeg.toFixed(1)}°</b></article>
          </div>

          <div className="physics-settle-note">
            <span className={validation.settled ? 'ok' : 'warn'}>{validation.settled ? '✓' : '!'}</span>
            <div><b>{validation.settled ? '시뮬레이션 종료 시 정지 상태' : '종료 시에도 일부 박스가 움직이는 상태'}</b><small>최대 속도 {validation.maxLinearSpeedMps.toFixed(3)} m/s · 회전속도 {validation.maxAngularSpeedRadps.toFixed(3)} rad/s</small></div>
          </div>

          <section className="physics-issues">
            <div className="physics-section-head"><div><h3>재확인 위치</h3><span>{issues.length ? '문제가 큰 순서대로 최대 30개를 표시합니다.' : '이동·기울기 기준을 넘은 위치가 없습니다.'}</span></div><button type="button" onClick={() => void run()}>다시 검증</button></div>
            {issues.length > 0 && <div className="physics-issue-list">{issues.map(item => <button key={item.index} type="button" className={item.severity} onClick={() => { selectPlacement(item.index); setOpen(false); }}>
              <span className="physics-issue-badge">{item.severity === 'unstable' ? '불안정' : '주의'}</span>
              <b>#{item.index + 1} · {item.cargoId}</b>
              <small>{item.reason}</small>
              <i>3D에서 보기 →</i>
            </button>)}</div>}
          </section>
        </>}

        {status === 'error' && <div className="physics-empty"><b>검증을 시작할 수 없습니다.</b><span>{message}</span><button type="button" onClick={() => void run()}>다시 시도</button></div>}
        {status === 'idle' && <div className="physics-empty"><b>물리 검증 준비 완료</b><span>{message || '현재 적재 결과에 중력·마찰·충돌을 적용합니다.'}</span><button type="button" onClick={() => void run()}>물리 검증 시작</button></div>}

        <footer className="physics-footnote">물리 검증은 적재안의 상대적 안정성을 확인하는 보조 도구입니다. 실제 포장재 강도, 결박, 진동, 컨테이너 바닥 상태와 운송 조건은 현장 기준으로 별도 확인해야 합니다.</footer>
      </section>
    </div>,
    document.body,
  );
}
