import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { analyzeConstraints } from './engine/constraintAnalysis';
import { analyzeFloorLoad } from './engine/floorLoad';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import {
  INERTIA_CERTIFICATION_EVENT,
  createPhysicsTargetSignature,
  readLatestInertiaCertification,
  type InertiaCertification,
} from './inertiaCertification';
import { assessWorkOrderCertification } from './inertiaWorkOrderPolicy';
import { OPEN_INERTIA_TEST_EVENT } from './inertiaTestEvents';
import { readPhysicsTarget, type PhysicsTarget } from './physicsTarget';

const PHYSICS_RESULT_EVENT = 'container-loading:physics-validation-result';
const PALLET_SNAPSHOT_EVENT = 'container-loading:pallet-snapshot-updated';

type LatestResultWindow = Window & {
  __containerLoadingLatestResult?: { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
  __containerLoadingLatestPhysics?: unknown;
};

type Tone = 'pass' | 'warning' | 'danger' | 'pending' | 'running';

type StatusRow = {
  step: number;
  label: string;
  note: string;
  status: string;
  tone: Tone;
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

export default function InspectionStatusPanel() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [target, setTarget] = useState<PhysicsTarget | undefined>(() => currentTarget());
  const [certification, setCertification] = useState<InertiaCertification | undefined>(() => matchingCertification(currentTarget()));
  const [physicsSeen, setPhysicsSeen] = useState(() => typeof window !== 'undefined' && Boolean((window as LatestResultWindow).__containerLoadingLatestPhysics));

  useEffect(() => {
    setHost(document.querySelector<HTMLElement>('.dashboard-right'));
    const refresh = () => {
      const nextTarget = currentTarget();
      setTarget(nextTarget);
      setCertification(matchingCertification(nextTarget));
      setPhysicsSeen(Boolean((window as LatestResultWindow).__containerLoadingLatestPhysics));
    };
    window.addEventListener(LOADING_RESULT_EVENT, refresh);
    window.addEventListener(PHYSICS_RESULT_EVENT, refresh);
    window.addEventListener(INERTIA_CERTIFICATION_EVENT, refresh);
    window.addEventListener(PALLET_SNAPSHOT_EVENT, refresh);
    return () => {
      window.removeEventListener(LOADING_RESULT_EVENT, refresh);
      window.removeEventListener(PHYSICS_RESULT_EVENT, refresh);
      window.removeEventListener(INERTIA_CERTIFICATION_EVENT, refresh);
      window.removeEventListener(PALLET_SNAPSHOT_EVENT, refresh);
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
        ? '생성 차단'
        : approval === 'incomplete'
          ? '검사 필요'
          : approval === 'caution'
            ? '주의 승인'
            : '생성 가능';
    return [
      {
        step: 1,
        label: '적재 계산',
        note: placements ? `${placements} EA · ${weight.toLocaleString()} kg` : '자동 적재를 먼저 실행',
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
        note: physicsSeen ? 'Rapier 배치 안정성 계산 완료' : '자동 적재 시 함께 실행',
        status: physicsSeen ? '완료' : '대기',
        tone: physicsSeen ? 'pass' : 'pending',
      },
      {
        step: 4,
        label: '관성 3종',
        note: certification ? `출발 0.30g · 급정거 0.50g · 급회전 0.35g · ${certification.testedScenarios}/3` : '출발 · 급정거 · 급회전',
        status: certification ? (approval === 'pass' ? '통과' : approval === 'caution' ? '보완 권장' : approval === 'danger' ? '위험' : '진행') : '대기',
        tone: inertiaTone,
      },
      {
        step: 5,
        label: '작업지시서',
        note: approval === 'caution' ? '위험 기준 이내 · 권장사항 포함 출력' : approval === 'pass' ? '관성 검사 완료 · 출력 가능' : approval === 'danger' ? '재배치/보강 후 재검사 필요' : '관성 3종 완료 후 판정',
        status: workStatus,
        tone: workTone,
      },
    ];
  }, [target, checks, certification, physicsSeen]);

  if (!host) return null;
  const current = rows.find(row => row.tone === 'danger') ?? rows.find(row => row.tone === 'warning') ?? rows.find(row => row.tone === 'running') ?? rows.find(row => row.tone === 'pending') ?? rows[rows.length - 1];

  return createPortal(
    <section className="dashboard-card inspection-flow-card" aria-labelledby="inspection-flow-title">
      <div className="inspection-flow-head">
        <div><h2 id="inspection-flow-title">검사 진행 상황</h2><span>위에서 아래 순서대로 확인</span></div>
        <b className={`inspection-overall tone-${current.tone}`}>{toneLabel(current.tone)}</b>
      </div>
      <table className="inspection-status-table">
        <thead><tr><th>순서</th><th>검사</th><th>상황</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.step} className={`tone-${row.tone}`}>
          <td><span className="inspection-step-no">{row.step}</span></td>
          <td><b>{row.label}</b><small>{row.note}</small></td>
          <td><strong>{row.status}</strong></td>
        </tr>)}</tbody>
      </table>
      <button type="button" className="inspection-inertia-action" onClick={() => window.dispatchEvent(new Event(OPEN_INERTIA_TEST_EVENT))}>
        4단계 관성 테스트 열기
      </button>
    </section>,
    host,
  );
}
