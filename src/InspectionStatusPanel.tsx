import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  FINAL_PHYSICS_VALIDATION_COMPLETE_EVENT,
  FINAL_PHYSICS_VALIDATION_ERROR_EVENT,
  FINAL_PHYSICS_VALIDATION_PROGRESS_EVENT,
  readFinalPhysicsValidation,
  type FinalPhysicsProgress,
} from './autoCertification';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { FINAL_LOADING_WORKFLOW_CANCEL_EVENT, FINAL_LOADING_WORKFLOW_ERROR_EVENT, FINAL_LOADING_WORKFLOW_START_EVENT } from './finalWorkflowEvents';
import {
  INERTIA_CERTIFICATION_EVENT,
  createPhysicsTargetSignature,
  readLatestInertiaCertification,
} from './inertiaCertification';
import { PHYSICS_TARGET_EVENT, readPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { LOAD_SIM_ACCEPTANCE_EVENT, createLoadSimTargetSignature, isLoadSimAcceptedTarget, readLoadSimAcceptance } from './rule-engine/acceptance';
import { WORKFLOW_INPUT_INVALIDATED_EVENT } from './workflowPreview';

type LoadingDetail = { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
type Tone = 'pass' | 'warning' | 'danger' | 'pending' | 'running';
type StatusRow = { step: number; label: string; note: string; status: string; tone: Tone };

function currentTarget(): PhysicsTarget | undefined {
  if (typeof window === 'undefined') return undefined;
  const latest = (window as Window & { __containerLoadingLatestResult?: LoadingDetail }).__containerLoadingLatestResult;
  return readPhysicsTarget() ?? (latest ? { mode: 'boxes', ...latest } : undefined);
}

/** A static acceptance is the loading/output gate. Dynamic simulations are optional
 * diagnostics and must never invent acceptance or restart the removed B workflow. */
export default function InspectionStatusPanel() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [target, setTarget] = useState(currentTarget);
  const [revision, setRevision] = useState(0);
  const [running, setRunning] = useState(false);
  const [loadingError, setLoadingError] = useState('');
  const [physicsProgress, setPhysicsProgress] = useState<FinalPhysicsProgress>();
  const [physicsError, setPhysicsError] = useState('');

  useEffect(() => {
    setHost(document.querySelector<HTMLElement>('.dashboard-right'));
    const refresh = () => { setTarget(currentTarget()); setRevision(value => value + 1); };
    const onStart = () => { setRunning(true); setLoadingError(''); setPhysicsProgress(undefined); setPhysicsError(''); };
    const onResult = (event: Event) => {
      const detail = (event as CustomEvent<LoadingDetail>).detail;
      if (detail) setTarget({ mode: 'boxes', ...detail });
      setRevision(value => value + 1);
    };
    const onAcceptance = (event: Event) => {
      if ((event as CustomEvent).detail) setRunning(false);
      setLoadingError(''); refresh();
    };
    const onCancelled = () => { setRunning(false); setLoadingError(''); refresh(); };
    const onLoadingError = (event: Event) => {
      const error = (event as CustomEvent<{ error?: unknown }>).detail?.error;
      setLoadingError(error instanceof Error ? error.message : typeof error === 'string' ? error : '적재 계산 실행 실패');
      setRunning(false);
    };
    const onProgress = (event: Event) => {
      setPhysicsProgress((event as CustomEvent<FinalPhysicsProgress>).detail);
      setPhysicsError('');
      refresh();
    };
    const onPhysicsDone = () => { setPhysicsProgress(undefined); refresh(); };
    const onError = (event: Event) => {
      const error = (event as CustomEvent<{ error?: unknown }>).detail?.error;
      setPhysicsError(error instanceof Error ? error.message : 'Rapier 검사 실행 실패');
      setPhysicsProgress(undefined);
      refresh();
    };
    window.addEventListener(FINAL_LOADING_WORKFLOW_START_EVENT, onStart);
    window.addEventListener(FINAL_LOADING_WORKFLOW_CANCEL_EVENT, onCancelled);
    window.addEventListener(WORKFLOW_INPUT_INVALIDATED_EVENT, onCancelled);
    window.addEventListener(FINAL_LOADING_WORKFLOW_ERROR_EVENT, onLoadingError);
    window.addEventListener(LOADING_RESULT_EVENT, onResult);
    window.addEventListener(LOAD_SIM_ACCEPTANCE_EVENT, onAcceptance);
    window.addEventListener(PHYSICS_TARGET_EVENT, refresh);
    window.addEventListener(INERTIA_CERTIFICATION_EVENT, refresh);
    window.addEventListener(FINAL_PHYSICS_VALIDATION_PROGRESS_EVENT, onProgress);
    window.addEventListener(FINAL_PHYSICS_VALIDATION_COMPLETE_EVENT, onPhysicsDone);
    window.addEventListener(FINAL_PHYSICS_VALIDATION_ERROR_EVENT, onError);
    return () => {
      window.removeEventListener(FINAL_LOADING_WORKFLOW_START_EVENT, onStart);
      window.removeEventListener(FINAL_LOADING_WORKFLOW_CANCEL_EVENT, onCancelled);
      window.removeEventListener(WORKFLOW_INPUT_INVALIDATED_EVENT, onCancelled);
      window.removeEventListener(FINAL_LOADING_WORKFLOW_ERROR_EVENT, onLoadingError);
      window.removeEventListener(LOADING_RESULT_EVENT, onResult);
      window.removeEventListener(LOAD_SIM_ACCEPTANCE_EVENT, onAcceptance);
      window.removeEventListener(PHYSICS_TARGET_EVENT, refresh);
      window.removeEventListener(INERTIA_CERTIFICATION_EVENT, refresh);
      window.removeEventListener(FINAL_PHYSICS_VALIDATION_PROGRESS_EVENT, onProgress);
      window.removeEventListener(FINAL_PHYSICS_VALIDATION_COMPLETE_EVENT, onPhysicsDone);
      window.removeEventListener(FINAL_PHYSICS_VALIDATION_ERROR_EVENT, onError);
    };
  }, []);

  // Event revision refreshes immutable proof stores without manufacturing a proof.
  void revision;
  const signature = target ? createPhysicsTargetSignature(target) : '';
  const proof = readLoadSimAcceptance();
  const acceptance = !running && !loadingError && proof?.targetSignature === (target ? createLoadSimTargetSignature(target) : '') ? proof : undefined;
  const accepted = !running && !loadingError && isLoadSimAcceptedTarget(target);
  const finalPhysics = readFinalPhysicsValidation();
  const physics = finalPhysics?.signature === signature ? finalPhysics.result : undefined;
  const lastCertification = readLatestInertiaCertification();
  const certification = lastCertification?.targetSignature === signature ? lastCertification : undefined;
  const placements = target?.result.placements.length ?? 0;
  const remaining = target?.result.remaining.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  const warningCount = acceptance?.operationalFindings.filter(item => item.severity === 'warning').length ?? 0;
  const rows: StatusRow[] = [
    { step: 1, label: '1번 파일 적재 계산',
      note: loadingError || (running ? '최종 적재안을 계산하고 있습니다.' : target ? `${placements} EA · 미적재 ${remaining} EA · ${(target.result.loadedWeightKg ?? 0).toLocaleString()} kg` : '최종 적재 진행을 실행하세요.'),
      status: loadingError ? '실패' : running ? '진행' : acceptance ? '완료' : '대기', tone: loadingError ? 'danger' : running ? 'running' : acceptance ? 'pass' : 'pending' },
    { step: 2, label: '1번 파일 정적 검증',
      note: accepted ? `배치·중량·지지·적층·하역 규칙 확인${warningCount ? ` · 확인사항 ${warningCount}건` : ''}` : acceptance?.status === 'rejected' ? acceptance.validationIssues.map(item => item.message).join(' · ') || '적재 규칙 위반' : '현재 최종 배치의 검증 결과 대기',
      status: accepted ? '통과' : acceptance?.status === 'rejected' ? '실패' : '대기', tone: accepted ? warningCount ? 'warning' : 'pass' : acceptance?.status === 'rejected' ? 'danger' : 'pending' },
    { step: 3, label: '결과·작업지시서',
      note: accepted ? placements ? '정적 검증 완료 · 결과 확인 및 발급 가능' : '미적재 사유 확인 가능' : '1번 파일 정적 검증 통과 후 확인',
      status: accepted ? placements ? '발급 가능' : '결과 확인' : '대기', tone: accepted ? 'pass' : 'pending' },
    { step: 4, label: 'Rapier 물리 검사 (선택)',
      note: physicsError || (physicsProgress ? `추가 검사 ${physicsProgress.progress}% 진행 중` : physics ? `${physics.score}점 · 불안정 ${physics.unstableCount + physics.supportUnstableCount}건` : '정적 검증과 별도로 실행하는 추가 시뮬레이션'),
      status: physicsError ? '실패' : physicsProgress ? '진행' : physics ? '검사 완료' : '미실행',
      tone: physicsError ? 'danger' : physicsProgress ? 'running' : physics ? physics.unstableCount + physics.supportUnstableCount > 0 ? 'warning' : 'pass' : 'pending' },
    { step: 5, label: '관성 3종 검사 (선택)',
      note: certification ? `검사 ${certification.testedScenarios}/3 · 최대 이동 ${(certification.maxHorizontalShiftM * 1000).toFixed(1)} mm` : '관성 검사 결과 없음 · 동적 안전을 인증한 상태가 아닙니다.',
      status: certification?.status === 'passed' ? '통과' : certification ? '결과 확인' : '미실행',
      tone: certification?.status === 'passed' ? 'pass' : certification ? 'warning' : 'pending' },
  ];
  const status = loadingError ? '적재 계산 실패' : running ? '계산 중' : accepted ? '정적 검증 완료' : acceptance?.status === 'rejected' ? '정적 검증 실패' : '대기';
  const tone = loadingError ? 'danger' : running ? 'running' : accepted ? 'pass' : acceptance?.status === 'rejected' ? 'danger' : 'pending';
  if (!host) return null;
  return createPortal(<section className="dashboard-card inspection-flow-card" aria-labelledby="inspection-flow-title">
    <div className="inspection-flow-head"><div><h2 id="inspection-flow-title">검사 진행 상황</h2><span>1번 파일 적재 → 정적 검증 → 결과·작업지시서</span></div><b className={`inspection-overall tone-${tone}`}>{status}</b></div>
    <table className="inspection-status-table"><thead><tr><th>순서</th><th>검사</th><th>상황</th></tr></thead><tbody>{rows.map(row => <tr key={row.step} className={`tone-${row.tone}`}><td><span className="inspection-step-no">{row.step}</span></td><td><b>{row.label}</b><small>{row.note}</small></td><td><strong>{row.status}</strong></td></tr>)}</tbody></table>
  </section>, host);
}
