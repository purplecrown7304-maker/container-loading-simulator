import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  FINAL_PHYSICS_VALIDATION_ERROR_EVENT,
  FINAL_PHYSICS_VALIDATION_PROGRESS_EVENT,
} from './autoCertification';
import { analyzeConstraints } from './engine/constraintAnalysis';
import { analyzeFloorLoad } from './engine/floorLoad';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import type { PhysicsScenario } from './engine/physicsValidation';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { FINAL_LOADING_WORKFLOW_START_EVENT } from './finalWorkflowEvents';
import {
  INERTIA_CERTIFICATION_EVENT,
  createPhysicsTargetSignature,
  readLatestInertiaCertification,
  type InertiaCertification,
} from './inertiaCertification';
import { assessWorkOrderCertification } from './inertiaWorkOrderPolicy';
import { PHYSICS_TARGET_EVENT, readPhysicsTarget, type PhysicsTarget } from './physicsTarget';

const PHYSICS_RESULT_EVENT = 'container-loading:physics-validation-result';
const PALLET_SNAPSHOT_EVENT = 'container-loading:pallet-snapshot-updated';

type LatestResultWindow = Window & {
  __containerLoadingLatestResult?: { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
  __containerLoadingLatestPhysics?: unknown;
  __containerLoadingFinalPhysicsRunning?: boolean;
};

type Tone = 'pass' | 'warning' | 'danger' | 'pending' | 'running';
type ActiveWorkflowStage = 1 | 2 | 3 | 4 | 5;
type WorkflowStage = ActiveWorkflowStage | null;

type StatusRow = {
  step: number;
  label: string;
  note: string;
  status: string;
  tone: Tone;
};

type FinalPhysicsProgressDetail = {
  mode: PhysicsTarget['mode'];
  progress: number;
  scenario: PhysicsScenario;
};

type PhysicsResultDetail = {
  mode?: PhysicsTarget['mode'];
  finalValidation?: boolean;
};

function currentTarget(): PhysicsTarget | undefined {
  if (typeof window === 'undefined') return undefined;
  const physicsTarget = readPhysicsTarget();
  if (physicsTarget?.mode === 'pallets') return physicsTarget;
  const latest = (window as LatestResultWindow).__containerLoadingLatestResult;
  if (latest) return { mode: 'boxes', ...latest };
  return physicsTarget;
}

function matchingCertification(target: PhysicsTarget | undefined): InertiaCertification | undefined {
  if (!target) return undefined;
  const certification = readLatestInertiaCertification();
  if (!certification) return undefined;
  return certification.targetSignature === createPhysicsTargetSignature(target) ? certification : undefined;
}

function toneLabel(tone: Tone) {
  if (tone === 'pass') return '통과';
  if (tone === 'warning') return '확인';
  if (tone === 'danger') return '위험';
  if (tone === 'running') return '진행';
  return '대기';
}

function physicsScenarioLabel(scenario: PhysicsScenario) {
  if (scenario === 'settle') return '정적 중력';
  if (scenario === 'braking') return '급제동 0.50g';
  return '횡가속 0.35g';
}

const RUNNING_NOTE: Record<number, string> = {
  1: '최종 적재안을 계산하고 있습니다.',
  2: '중량·충돌·높이·하중 조건을 순서대로 확인합니다.',
  3: 'Rapier 기준으로 배치 안정성을 실제 계산합니다.',
  4: '출발 0.30g → 급정거 0.50g → 급회전 0.35g 순서로 검증합니다.',
};

export default function InspectionStatusPanel() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [target, setTarget] = useState<PhysicsTarget | undefined>(() => currentTarget());
  const [certification, setCertification] = useState<InertiaCertification | undefined>(() => matchingCertification(currentTarget()));
  const [physicsSeen, setPhysicsSeen] = useState(() => typeof window !== 'undefined' && Boolean((window as LatestResultWindow).__containerLoadingLatestPhysics));
  const [physicsProgress, setPhysicsProgress] = useState(0);
  const [physicsScenario, setPhysicsScenario] = useState<PhysicsScenario>('settle');
  const [physicsError, setPhysicsError] = useState('');
  const [workflowStage, setWorkflowStage] = useState<WorkflowStage>(null);

  useEffect(() => {
    setHost(document.querySelector<HTMLElement>('.dashboard-right'));

    const refresh = () => {
      const nextTarget = currentTarget();
      const finalPhysicsRunning = Boolean((window as LatestResultWindow).__containerLoadingFinalPhysicsRunning);
      setTarget(nextTarget);
      setCertification(matchingCertification(nextTarget));
      // 후보 최적화 과정의 물리 결과를 최종 물리검증 완료로 오인하지 않는다.
      setPhysicsSeen(!finalPhysicsRunning && Boolean((window as LatestResultWindow).__containerLoadingLatestPhysics));
      return nextTarget;
    };

    const advance = (stage: ActiveWorkflowStage) => {
      setWorkflowStage(current => current === null ? null : Math.max(current, stage) as ActiveWorkflowStage);
    };

    const onWorkflowStart = () => {
      setWorkflowStage(1);
      setCertification(undefined);
      setPhysicsSeen(false);
      setPhysicsProgress(0);
      setPhysicsScenario('settle');
      setPhysicsError('');
    };

    const onLoadingResult = () => {
      const nextTarget = refresh();
      if (!nextTarget?.result.placements.length) return;
      advance(2);
    };

    const onPhysicsTarget = (event: Event) => {
      const detail = (event as CustomEvent<PhysicsTarget | undefined>).detail;
      refresh();
      if (!detail?.result.placements.length) return;
      // 실제 물리검증 결과가 오기 전에는 4단계로 넘어가지 않는다.
      advance(3);
    };

    const onPhysicsProgress = (event: Event) => {
      const detail = (event as CustomEvent<FinalPhysicsProgressDetail>).detail;
      if (!detail) return;
      setPhysicsError('');
      setPhysicsSeen(false);
      setPhysicsProgress(detail.progress);
      setPhysicsScenario(detail.scenario);
      advance(3);
    };

    const onPhysicsResult = (event: Event) => {
      const detail = (event as CustomEvent<PhysicsResultDetail>).detail;
      const finalPhysicsRunning = Boolean((window as LatestResultWindow).__containerLoadingFinalPhysicsRunning);
      // App의 후보 선택용 물리 결과는 최종 검증 완료 신호가 아니다.
      if (finalPhysicsRunning && !detail?.finalValidation) return;
      refresh();
      setPhysicsError('');
      setPhysicsProgress(100);
      setPhysicsSeen(true);
      advance(4);
    };

    const onPhysicsError = () => {
      refresh();
      setPhysicsSeen(false);
      setPhysicsError('Rapier 최종 물리검증 실행 실패');
      setWorkflowStage(current => current === null ? null : 3);
    };

    const onCertification = () => {
      refresh();
      advance(5);
    };

    const onPalletSnapshot = () => {
      const nextTarget = refresh();
      if (!nextTarget?.result.placements.length) return;
      advance(2);
    };

    window.addEventListener(FINAL_LOADING_WORKFLOW_START_EVENT, onWorkflowStart);
    window.addEventListener(LOADING_RESULT_EVENT, onLoadingResult);
    window.addEventListener(PHYSICS_TARGET_EVENT, onPhysicsTarget);
    window.addEventListener(FINAL_PHYSICS_VALIDATION_PROGRESS_EVENT, onPhysicsProgress);
    window.addEventListener(PHYSICS_RESULT_EVENT, onPhysicsResult);
    window.addEventListener(FINAL_PHYSICS_VALIDATION_ERROR_EVENT, onPhysicsError);
    window.addEventListener(INERTIA_CERTIFICATION_EVENT, onCertification);
    window.addEventListener(PALLET_SNAPSHOT_EVENT, onPalletSnapshot);
    return () => {
      window.removeEventListener(FINAL_LOADING_WORKFLOW_START_EVENT, onWorkflowStart);
      window.removeEventListener(LOADING_RESULT_EVENT, onLoadingResult);
      window.removeEventListener(PHYSICS_TARGET_EVENT, onPhysicsTarget);
      window.removeEventListener(FINAL_PHYSICS_VALIDATION_PROGRESS_EVENT, onPhysicsProgress);
      window.removeEventListener(PHYSICS_RESULT_EVENT, onPhysicsResult);
      window.removeEventListener(FINAL_PHYSICS_VALIDATION_ERROR_EVENT, onPhysicsError);
      window.removeEventListener(INERTIA_CERTIFICATION_EVENT, onCertification);
      window.removeEventListener(PALLET_SNAPSHOT_EVENT, onPalletSnapshot);
    };
  }, []);

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
    const approval = certification ? assessWorkOrderCertification(certification) : 'incomplete';
    const inertiaTone: Tone = !certification
      ? 'pending'
      : approval === 'danger'
        ? 'danger'
        : approval === 'caution'
          ? 'warning'
          : approval === 'pass'
            ? 'pass'
            : 'running';
    const workTone: Tone = !certification
      ? 'pending'
      : approval === 'danger'
        ? 'danger'
        : approval === 'incomplete'
          ? 'running'
          : approval === 'caution'
            ? 'warning'
            : 'pass';
    const workStatus = !certification
      ? '검사 전'
      : approval === 'danger'
        ? '발급 차단'
        : approval === 'incomplete'
          ? '검사 필요'
          : '발급 가능';

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
        label: '물리 검증',
        note: physicsError || (physicsSeen ? 'Rapier 최종 배치 안정성 계산 완료' : placements ? '제약 조건 확인 후 실제 Rapier 검증' : '적재 계산 후 검사'),
        status: physicsError ? '실패' : physicsSeen ? '완료' : '대기',
        tone: physicsError ? 'danger' : physicsSeen ? 'pass' : 'pending',
      },
      {
        step: 4,
        label: '관성 3종',
        note: certification ? `출발 0.30g · 급정거 0.50g · 급회전 0.35g · ${certification.testedScenarios}/3` : '물리 검증 완료 후 출발 → 급정거 → 급회전 순차 검사',
        status: certification ? (approval === 'pass' ? '통과' : approval === 'caution' ? '보완 권장' : approval === 'danger' ? '위험' : '진행') : '대기',
        tone: inertiaTone,
      },
      {
        step: 5,
        label: '작업지시서',
        note: approval === 'caution' ? '주의사항을 포함해 발급할 수 있습니다.' : approval === 'pass' ? '최종 검사 완료 · 발급할 수 있습니다.' : approval === 'danger' ? '재배치/보강 후 최종 적재를 다시 진행하세요.' : '관성 3종 완료 후 발급 가능 여부를 판정합니다.',
        status: workStatus,
        tone: workTone,
      },
    ];
  }, [target, checks, certification, physicsSeen, physicsError]);

  const displayedRows = useMemo<StatusRow[]>(() => {
    if (workflowStage === null || workflowStage === 5) return rows;
    return rows.map(row => {
      if (row.step < workflowStage) {
        if (row.tone === 'danger' || row.tone === 'warning') return row;
        return {
          ...row,
          status: row.step === 1 || row.step === 3 ? '완료' : '통과',
          tone: 'pass' as Tone,
        };
      }
      if (row.step === workflowStage) {
        if (row.tone === 'danger' || row.tone === 'warning') return row;
        const runningNote = row.step === 3
          ? `Rapier ${physicsScenarioLabel(physicsScenario)} · ${physicsProgress}% 계산 중`
          : RUNNING_NOTE[row.step] ?? row.note;
        return {
          ...row,
          note: runningNote,
          status: '진행',
          tone: 'running' as Tone,
        };
      }
      return {
        ...row,
        status: '대기',
        tone: 'pending' as Tone,
      };
    });
  }, [rows, workflowStage, physicsProgress, physicsScenario]);

  if (!host) return null;

  const current = workflowStage !== null && workflowStage < 5
    ? displayedRows.find(row => row.tone === 'running')
      ?? displayedRows.find(row => row.tone === 'danger')
      ?? displayedRows.find(row => row.tone === 'warning')
      ?? displayedRows.find(row => row.tone === 'pending')
      ?? displayedRows[displayedRows.length - 1]
    : displayedRows.find(row => row.tone === 'danger')
      ?? displayedRows.find(row => row.tone === 'warning')
      ?? displayedRows.find(row => row.tone === 'running')
      ?? displayedRows.find(row => row.tone === 'pending')
      ?? displayedRows[displayedRows.length - 1];

  return createPortal(
    <section className="dashboard-card inspection-flow-card" aria-labelledby="inspection-flow-title">
      <div className="inspection-flow-head">
        <div><h2 id="inspection-flow-title">검사 진행 상황</h2><span>최종 적재 진행 시 적재 → 제약 → Rapier 물리 → 관성 3종 순서로 자동 검사</span></div>
        <b className={`inspection-overall tone-${current.tone}`}>{toneLabel(current.tone)}</b>
      </div>
      <table className="inspection-status-table">
        <thead><tr><th>순서</th><th>검사</th><th>상황</th></tr></thead>
        <tbody>{displayedRows.map(row => <tr key={row.step} className={`tone-${row.tone}`}>
          <td><span className="inspection-step-no">{row.step}</span></td>
          <td><b>{row.label}</b><small>{row.note}</small></td>
          <td><strong>{row.status}</strong></td>
        </tr>)}</tbody>
      </table>
    </section>,
    host,
  );
}
