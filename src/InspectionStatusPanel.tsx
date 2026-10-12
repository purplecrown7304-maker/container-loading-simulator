import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  FINAL_PHYSICS_VALIDATION_COMPLETE_EVENT,
  FINAL_PHYSICS_VALIDATION_ERROR_EVENT,
  FINAL_PHYSICS_VALIDATION_PROGRESS_EVENT,
  readFinalPhysicsValidation,
  type FinalPhysicsComplete,
  type FinalPhysicsProgress,
} from './autoCertification';
import { analyzeConstraints } from './engine/constraintAnalysis';
import { analyzeFloorLoad } from './engine/floorLoad';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import type { PhysicsScenario, PhysicsValidationSuite } from './engine/physicsValidation';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { FINAL_LOADING_WORKFLOW_START_EVENT } from './finalWorkflowEvents';
import {
  INERTIA_CERTIFICATION_EVENT,
  createPhysicsTargetSignature,
  readLatestInertiaCertification,
  type InertiaCertification,
} from './inertiaCertification';
import { assessPhysicsVerification } from './physicsVerificationPolicy';
import { isPhysicsTargetVerified, assessWorkOrderCertification } from './inertiaWorkOrderPolicy';
import { PHYSICS_TARGET_EVENT, readPhysicsTarget, type PhysicsTarget } from './physicsTarget';

const PALLET_SNAPSHOT_EVENT = 'container-loading:pallet-snapshot-updated';

type LoadingDetail = { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
type LatestResultWindow = Window & { __containerLoadingLatestResult?: LoadingDetail };
type Tone = 'pass' | 'warning' | 'danger' | 'pending' | 'running';
type WorkflowStage = 1 | 2 | 3 | 4 | 5 | null;

type StatusRow = {
  step: number;
  label: string;
  note: string;
  status: string;
  tone: Tone;
};

type PhysicsErrorDetail = { mode?: PhysicsTarget['mode']; signature?: string; error?: unknown };

function latestBoxTarget(): PhysicsTarget | undefined {
  if (typeof window === 'undefined') return undefined;
  const latest = (window as LatestResultWindow).__containerLoadingLatestResult;
  return latest ? { mode: 'boxes', ...latest } : undefined;
}

function currentTarget(): PhysicsTarget | undefined {
  if (typeof window === 'undefined') return undefined;
  return readPhysicsTarget() ?? latestBoxTarget();
}

function matchingCertification(target: PhysicsTarget | undefined): InertiaCertification | undefined {
  if (!target) return undefined;
  const certification = readLatestInertiaCertification();
  if (!certification) return undefined;
  return certification.targetSignature === createPhysicsTargetSignature(target) ? certification : undefined;
}

function physicsScenarioLabel(scenario: PhysicsScenario) {
  if (scenario === 'settle') return '정적 중력';
  if (scenario === 'braking') return '급제동 0.50g';
  return '횡가속 0.35g';
}

function toneLabel(tone: Tone) {
  if (tone === 'pass') return '통과';
  if (tone === 'warning') return '확인';
  if (tone === 'danger') return '위험';
  if (tone === 'running') return '진행';
  return '대기';
}

export default function InspectionStatusPanel() {
  const initialTarget = currentTarget();
  const initialPhysics = readFinalPhysicsValidation();

  const [host, setHost] = useState<HTMLElement | null>(null);
  const [target, setTarget] = useState<PhysicsTarget | undefined>(initialTarget);
  const [certification, setCertification] = useState<InertiaCertification | undefined>(() => matchingCertification(initialTarget));
  const [finalPhysicsSignature, setFinalPhysicsSignature] = useState(initialPhysics?.signature ?? '');
  const [physicsResult, setPhysicsResult] = useState<PhysicsValidationSuite | undefined>(initialPhysics?.result);
  const [physicsProgress, setPhysicsProgress] = useState(0);
  const [physicsScenario, setPhysicsScenario] = useState<PhysicsScenario>('settle');
  const [physicsError, setPhysicsError] = useState('');
  const [workflowStage, setWorkflowStage] = useState<WorkflowStage>(null);
  const workflowActive = useRef(false);

  useEffect(() => {
    setHost(document.querySelector<HTMLElement>('.dashboard-right'));

    const setFreshTarget = (nextTarget: PhysicsTarget | undefined) => {
      setTarget(nextTarget);
      if (!nextTarget) {
        setCertification(undefined);
        return '';
      }
      return createPhysicsTargetSignature(nextTarget);
    };

    const onWorkflowStart = () => {
      workflowActive.current = true;
      setWorkflowStage(1);
      setCertification(undefined);
      setFinalPhysicsSignature('');
      setPhysicsResult(undefined);
      setPhysicsProgress(0);
      setPhysicsScenario('settle');
      setPhysicsError('');
    };

    const onLoadingResult = (event: Event) => {
      const detail = (event as CustomEvent<LoadingDetail>).detail;
      const nextTarget = detail ? ({ mode: 'boxes', ...detail } satisfies PhysicsTarget) : currentTarget();
      setFreshTarget(nextTarget);
      setCertification(undefined);
      if (workflowActive.current && nextTarget?.result.placements.length) setWorkflowStage(2);
    };

    const onPhysicsTarget = (event: Event) => {
      const nextTarget = (event as CustomEvent<PhysicsTarget | undefined>).detail ?? currentTarget();
      if (!nextTarget?.result.placements.length) return;
      const signature = setFreshTarget(nextTarget);
      const finalPhysics = readFinalPhysicsValidation();
      if (!finalPhysics || finalPhysics.signature !== signature) {
        setCertification(undefined);
        setFinalPhysicsSignature('');
        setPhysicsResult(undefined);
        if (workflowActive.current) setWorkflowStage(3);
      }
    };

    const onPhysicsProgress = (event: Event) => {
      const detail = (event as CustomEvent<FinalPhysicsProgress>).detail;
      if (!detail) return;
      setPhysicsError('');
      setPhysicsProgress(detail.progress);
      setPhysicsScenario(detail.scenario);
      setFinalPhysicsSignature('');
      setPhysicsResult(undefined);
      setCertification(undefined);
      workflowActive.current = true;
      setWorkflowStage(3);
    };

    const onPhysicsComplete = (event: Event) => {
      const detail = (event as CustomEvent<FinalPhysicsComplete>).detail;
      if (!detail) return;
      const nextTarget = currentTarget();
      if (!nextTarget || createPhysicsTargetSignature(nextTarget) !== detail.signature) return;
      setTarget(nextTarget);
      setFinalPhysicsSignature(detail.signature);
      setPhysicsResult(detail.result);
      setPhysicsProgress(100);
      setPhysicsError('');
      setCertification(undefined);
      workflowActive.current = true;
      setWorkflowStage(4);
    };

    const onPhysicsError = (event: Event) => {
      const detail = (event as CustomEvent<PhysicsErrorDetail>).detail;
      setPhysicsError(detail?.error instanceof Error ? detail.error.message : 'Rapier 최종 물리검증 실행 실패');
      setFinalPhysicsSignature('');
      setPhysicsResult(undefined);
      setCertification(undefined);
      workflowActive.current = true;
      setWorkflowStage(3);
    };

    const onCertification = (event: Event) => {
      const nextCertification = (event as CustomEvent<InertiaCertification | undefined>).detail;
      if (!nextCertification) {
        setCertification(undefined);
        return;
      }

      const nextTarget = currentTarget();
      if (!nextTarget) return;
      const targetSignature = createPhysicsTargetSignature(nextTarget);
      if (nextCertification.targetSignature !== targetSignature) return;

      const finalPhysics = readFinalPhysicsValidation();
      const matchingBaseline = finalPhysics?.signature === targetSignature ? finalPhysics : undefined;
      setTarget(nextTarget);
      setFinalPhysicsSignature(matchingBaseline?.signature ?? '');
      setPhysicsResult(matchingBaseline?.result);
      setCertification(nextCertification);
      workflowActive.current = false;
      setWorkflowStage(5);
    };

    const onPalletSnapshot = () => {
      const nextTarget = currentTarget();
      if (!nextTarget?.result.placements.length) return;
      setFreshTarget(nextTarget);
      if (workflowActive.current && workflowStage !== 3 && workflowStage !== 4) setWorkflowStage(2);
    };

    window.addEventListener(FINAL_LOADING_WORKFLOW_START_EVENT, onWorkflowStart);
    window.addEventListener(LOADING_RESULT_EVENT, onLoadingResult);
    window.addEventListener(PHYSICS_TARGET_EVENT, onPhysicsTarget);
    window.addEventListener(FINAL_PHYSICS_VALIDATION_PROGRESS_EVENT, onPhysicsProgress);
    window.addEventListener(FINAL_PHYSICS_VALIDATION_COMPLETE_EVENT, onPhysicsComplete);
    window.addEventListener(FINAL_PHYSICS_VALIDATION_ERROR_EVENT, onPhysicsError);
    window.addEventListener(INERTIA_CERTIFICATION_EVENT, onCertification);
    window.addEventListener(PALLET_SNAPSHOT_EVENT, onPalletSnapshot);

    return () => {
      window.removeEventListener(FINAL_LOADING_WORKFLOW_START_EVENT, onWorkflowStart);
      window.removeEventListener(LOADING_RESULT_EVENT, onLoadingResult);
      window.removeEventListener(PHYSICS_TARGET_EVENT, onPhysicsTarget);
      window.removeEventListener(FINAL_PHYSICS_VALIDATION_PROGRESS_EVENT, onPhysicsProgress);
      window.removeEventListener(FINAL_PHYSICS_VALIDATION_COMPLETE_EVENT, onPhysicsComplete);
      window.removeEventListener(FINAL_PHYSICS_VALIDATION_ERROR_EVENT, onPhysicsError);
      window.removeEventListener(INERTIA_CERTIFICATION_EVENT, onCertification);
      window.removeEventListener(PALLET_SNAPSHOT_EVENT, onPalletSnapshot);
    };
  }, []);

  const targetSignature = target ? createPhysicsTargetSignature(target) : '';
  const physicsDone = Boolean(targetSignature && finalPhysicsSignature === targetSignature && physicsResult);
  const acceptedCertification = certification?.mode === target?.mode && certification?.targetSignature === targetSignature ? certification : undefined;

  const checks = useMemo(() => {
    if (!target) return [];
    const floor = analyzeFloorLoad(target.container, target.result, 12, 4);
    return analyzeConstraints(target.container, target.cargo, target.result, floor);
  }, [target]);

  const rows = useMemo<StatusRow[]>(() => {
    const placements = target?.result.placements.length ?? 0;
    const weight = target?.result.loadedWeightKg ?? 0;
    const constraintFail = checks.some(check => check.status === 'fail');
    const constraintWarn = checks.some(check => check.status === 'warn');
    const approval = acceptedCertification ? assessWorkOrderCertification(acceptedCertification) : 'incomplete';
    const physicsUnstable = physicsResult ? physicsResult.unstableCount + physicsResult.supportUnstableCount : 0;

    const inertiaTone: Tone = !acceptedCertification
      ? 'pending'
      : approval === 'danger'
        ? 'danger'
        : approval === 'caution'
          ? 'warning'
          : approval === 'pass'
            ? 'pass'
            : 'running';

    const physicsState = target ? assessPhysicsVerification(target, acceptedCertification) : undefined;
    const verified = isPhysicsTargetVerified(target, acceptedCertification);
    const physicsFailed = physicsState?.status === 'failed';
    const baselineUnstable = physicsDone && physicsResult && (physicsUnstable > 0 || !physicsResult.settled);
    const workTone: Tone = constraintFail || physicsFailed || approval === 'danger' ? 'danger'
      : verified ? 'pass' : placements ? 'warning' : 'pending';

    return [
      {
        step: 1,
        label: '적재 계산',
        note: placements ? `${placements} EA · ${weight.toLocaleString()} kg` : '최종 적재 진행을 실행하세요.',
        status: placements ? '완료' : '대기',
        tone: placements ? 'pass' : 'pending',
      },
      {
        step: 2,
        label: '제약 조건',
        note: constraintFail ? '실패 항목 있음' : constraintWarn ? '현장 확인 항목 있음' : placements ? '중량·충돌·높이·하중 확인' : '적재 계산 후 검사',
        status: constraintFail ? '위험' : constraintWarn ? '확인' : placements ? '통과' : '대기',
        tone: constraintFail ? 'danger' : constraintWarn ? 'warning' : placements ? 'pass' : 'pending',
      },
      {
        step: 3,
        label: '무보강 물리 검증',
        note: physicsError
          ? `Rapier 실패 · ${physicsError}`
          : physicsDone && physicsResult
            ? `무보강 Rapier ${physicsResult.score}점 · 불안정 ${physicsUnstable}건 · ${physicsResult.settled ? '정지 확인' : '잔류 움직임 감지'}${baselineUnstable ? ' · 최종 보강 조건과 별도' : ''}`
            : placements ? '최종 배치에 정적 중력·급제동·횡가속 적용' : '적재 계산 후 검사',
        status: physicsError ? '실패' : physicsDone ? baselineUnstable ? '보강 필요' : '기준 검사 완료' : '대기',
        tone: physicsError ? 'danger' : physicsDone ? baselineUnstable ? 'warning' : 'pass' : 'pending',
      },
      {
        step: 4,
        label: '최종 보강 검증',
        note: acceptedCertification
          ? `${acceptedCertification.securing.levelLabel} · 관성 ${acceptedCertification.testedScenarios}/3 · ${physicsState?.status === 'passed' ? '보강 물리 4종 완료' : physicsState?.reasons.join(' · ')}`
          : physicsDone ? 'Rapier 완료 · 관성 3종 검사 대기' : '물리 검증 완료 후 실행',
        status: acceptedCertification
          ? physicsState?.status === 'failed' ? '위험' : physicsState?.status !== 'passed' ? '물리검증 미완료' : approval === 'pass' ? '통과' : approval === 'caution' ? '보완 권장' : approval === 'danger' ? '위험' : '진행'
          : '대기',
        tone: physicsFailed ? 'danger' : acceptedCertification && physicsState?.status !== 'passed' ? 'warning' : inertiaTone,
      },
      {
        step: 5,
        label: '작업지시서',
        note: verified
          ? '현재 보강 물리·관성 통과 · 표시된 보강자재·설치 조건 적용 필요'
          : constraintFail ? '적재 제약 실패 · 출고 차단 · 검토용 문서만 가능'
            : physicsState?.status !== 'passed' ? `${physicsState?.reasons.join(' · ') ?? '물리검증 대기'} · 출고 차단 · 검토용 문서만 가능`
              : '보강 관성 PASS 미확인 · 출고 차단 · 검토용 문서만 가능',
        status: verified ? '보강 조건부 발급' : placements ? '검토용만 가능' : '대기',
        tone: workTone,
      },
    ];
  }, [target, checks, physicsDone, physicsResult, physicsError, finalPhysicsSignature, acceptedCertification]);

  const displayedRows = useMemo(() => {
    if (workflowStage === null || workflowStage === 5) return rows;
    return rows.map(row => {
      if (row.step < workflowStage) {
        if (row.tone === 'danger' || row.tone === 'warning') return row;
        return { ...row, status: row.step === 1 || row.step === 3 ? '완료' : '통과', tone: 'pass' as Tone };
      }
      if (row.step === workflowStage) {
        if (row.tone === 'danger') return row;
        const note = row.step === 1
          ? '최종 적재안을 계산하고 있습니다.'
          : row.step === 2
            ? '중량·충돌·높이·하중 조건을 확인합니다.'
            : row.step === 3
              ? `Rapier ${physicsScenarioLabel(physicsScenario)} · ${physicsProgress}% 실제 계산 중`
              : '출발 0.30g → 급정거 0.50g → 급회전 0.35g 검사 중';
        return { ...row, note, status: '진행', tone: 'running' as Tone };
      }
      return { ...row, status: '대기', tone: 'pending' as Tone };
    });
  }, [rows, workflowStage, physicsProgress, physicsScenario]);

  if (!host) return null;

  const current = displayedRows.find(row => row.tone === 'running')
    ?? displayedRows.find(row => row.tone === 'danger')
    ?? displayedRows.find(row => row.tone === 'warning')
    ?? displayedRows.find(row => row.tone === 'pending')
    ?? displayedRows[displayedRows.length - 1];

  return createPortal(
    <section className="dashboard-card inspection-flow-card" aria-labelledby="inspection-flow-title">
      <div className="inspection-flow-head">
        <div>
          <h2 id="inspection-flow-title">검사 진행 상황</h2>
          <span>적재 → 제약 → 무보강 Rapier → 최종 보강 검증 → 작업지시서</span>
        </div>
        <b className={`inspection-overall tone-${current.tone}`}>{toneLabel(current.tone)}</b>
      </div>
      <table className="inspection-status-table">
        <thead><tr><th>순서</th><th>검사</th><th>상황</th></tr></thead>
        <tbody>{displayedRows.map(row => (
          <tr key={row.step} className={`tone-${row.tone}`}>
            <td><span className="inspection-step-no">{row.step}</span></td>
            <td><b>{row.label}</b><small>{row.note}</small></td>
            <td><strong>{row.status}</strong></td>
          </tr>
        ))}</tbody>
      </table>
    </section>,
    host,
  );
}
