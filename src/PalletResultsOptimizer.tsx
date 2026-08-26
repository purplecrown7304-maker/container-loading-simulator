import { useCallback, useEffect, useRef, useState } from 'react';
import { centerPalletCargo, setNextPalletCenteredResultOverride } from './engine/palletCentering';
import { validatePlacements } from './engine/constraints';
import { packOnPallets, type OptimizedPalletPackingResult, type PalletLoad, type PalletSpec } from './engine/palletOptimization';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import {
  INERTIA_CERTIFICATION_EVENT,
  INERTIA_PASS_PALLET_CARGO_SLIP_M,
  INERTIA_PASS_SHIFT_M,
  INERTIA_PASS_SUPPORT_SHIFT_M,
  INERTIA_PASS_TILT_DEG,
  createPhysicsTargetSignature,
  runInertiaCertification,
  type CertificationProgress,
  type InertiaCertification,
} from './inertiaCertification';
import { publishPhysicsTarget, readPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import {
  REQUEST_PALLET_RESULTS_OPTIMIZATION_EVENT,
  openResultsModal,
  type ResultsModalDetail,
} from './resultsModalEvents';

const PALLET_SPEC_FROM_RESULTS_EVENT = 'container-loading:pallet-spec-from-results';
const PALLET_SNAPSHOT_UPDATED_EVENT = 'container-loading:pallet-snapshot-updated';
const EPS = 1e-9;

type PalletSnapshot = { spec: PalletSpec; result: OptimizedPalletPackingResult };
type PalletWindow = Window & {
  __containerLoadingPalletSnapshot?: PalletSnapshot;
  __containerLoadingLatestCertification?: InertiaCertification;
};

type Candidate = {
  label: string;
  spec: PalletSpec;
  result: OptimizedPalletPackingResult;
  target: PhysicsTarget;
  staticPenalty: number;
};

type Evaluated = Candidate & { certification: InertiaCertification; risk: number };

function readPalletSnapshot() {
  if (typeof window === 'undefined') return undefined;
  return (window as PalletWindow).__containerLoadingPalletSnapshot;
}

function loadedCounts(result: LoadingResult | OptimizedPalletPackingResult) {
  const counts = new Map<string, number>();
  result.placements.forEach(item => counts.set(item.cargoId, (counts.get(item.cargoId) ?? 0) + 1));
  return counts;
}

function sameLoadedCargo(a: LoadingResult | OptimizedPalletPackingResult, b: LoadingResult | OptimizedPalletPackingResult) {
  const A = loadedCounts(a);
  const B = loadedCounts(b);
  if (A.size !== B.size) return false;
  for (const [id, count] of A) if (B.get(id) !== count) return false;
  return true;
}

function toTarget(container: ContainerSpec, cargo: CargoItem[], result: OptimizedPalletPackingResult): PhysicsTarget {
  const loadingResult: LoadingResult = {
    placements: result.placements,
    remaining: result.remaining,
    loadedWeightKg: result.totalPalletizedWeightKg,
    usedVolumeM3: result.placements.reduce((sum, item) => sum + item.length * item.width * item.height, 0),
    validationIssues: validatePlacements(container, result.placements),
  };
  const supports = result.pallets.map(pallet => ({
    id: `PALLET-${String(pallet.palletIndex).padStart(2, '0')}`,
    x: pallet.x,
    y: pallet.y,
    z: pallet.z,
    length: pallet.length,
    width: pallet.width,
    height: pallet.height,
    weightKg: Math.max(0.01, pallet.totalWeightKg - pallet.cargoWeightKg),
    dynamic: true,
  }));
  return { mode: 'pallets', container, cargo, result: loadingResult, supports };
}

function moveLoad(load: PalletLoad, x: number, y: number): PalletLoad {
  const dx = x - load.x;
  const dy = y - load.y;
  return {
    ...load,
    x,
    y,
    cargoPlacements: load.cargoPlacements.map(item => ({ ...item, x: item.x + dx, y: item.y + dy })),
    centerOfGravity: { ...load.centerOfGravity, x: load.centerOfGravity.x + dx, y: load.centerOfGravity.y + dy },
  };
}

function lateralImbalance(pallets: PalletLoad[], container: ContainerSpec) {
  let left = 0;
  let right = 0;
  pallets.forEach(pallet => {
    if (pallet.centerOfGravity.y < container.width / 2) left += pallet.totalWeightKg;
    else right += pallet.totalWeightKg;
  });
  return Math.abs(left - right);
}

function compactResult(input: OptimizedPalletPackingResult, container: ContainerSpec, spec: PalletSpec, fromDoor: boolean) {
  const grouped = new Map<number, PalletLoad[]>();
  input.pallets.forEach(pallet => {
    const list = grouped.get(pallet.stackColumn) ?? [];
    list.push({ ...pallet, cargoPlacements: pallet.cargoPlacements.map(item => ({ ...item })), centerOfGravity: { ...pallet.centerOfGravity } });
    grouped.set(pallet.stackColumn, list);
  });
  const columns = [...grouped.values()]
    .map(loads => ({ loads: loads.sort((a, b) => a.stackLevel - b.stackLevel), weight: loads.reduce((sum, item) => sum + item.totalWeightKg, 0) }))
    .sort((a, b) => b.weight - a.weight);
  const rowCapacity = Math.max(1, Math.floor((container.width + EPS) / spec.width));
  const lanes = Math.min(rowCapacity, Math.max(1, columns.length));
  const yOffset = Math.max(0, (container.width - lanes * spec.width) / 2);
  const moved: PalletLoad[] = [];

  columns.forEach((column, index) => {
    const band = Math.floor(index / lanes);
    const rawLane = index % lanes;
    const lane = band % 2 === 0 ? rawLane : lanes - 1 - rawLane;
    const x = fromDoor
      ? Math.max(0, container.length - (band + 1) * spec.length)
      : Math.min(container.length - spec.length, band * spec.length);
    const y = yOffset + lane * spec.width;
    const stackColumn = index + 1;
    column.loads.forEach(load => moved.push({ ...moveLoad(load, x, y), stackColumn }));
  });

  moved.sort((a, b) => a.stackColumn - b.stackColumn || a.stackLevel - b.stackLevel);
  return {
    ...input,
    pallets: moved,
    placements: moved.flatMap(item => item.cargoPlacements),
    lateralImbalanceKg: lateralImbalance(moved, container),
    optimization: {
      ...input.optimization,
      floorPositions: columns.length,
      redistributedForLowUtilization: true,
    },
  } satisfies OptimizedPalletPackingResult;
}

function maxUnitHeight(result: OptimizedPalletPackingResult) {
  return result.pallets.reduce((max, pallet) => {
    const top = pallet.cargoPlacements.reduce((value, item) => Math.max(value, item.z + item.height), pallet.z + pallet.height);
    return Math.max(max, Math.max(0, top - pallet.z - pallet.height));
  }, 0);
}

function staticPenalty(result: OptimizedPalletPackingResult) {
  return result.stackedPallets * 20
    + Math.max(0, result.maxUsedStackLevel - 1) * 8
    + maxUnitHeight(result) * 3
    + result.lateralImbalanceKg / 1500
    + result.palletCount * 0.02;
}

function cappedCargo(cargo: CargoItem[], spec: PalletSpec, heightRatio: number) {
  const preferredHeight = Math.max(0.1, Math.min(spec.length, spec.width) * heightRatio);
  return cargo.map(item => {
    const physicalLayers = Math.max(1, Math.floor((preferredHeight + EPS) / item.height));
    const configured = item.maxStackLayers ?? Number.POSITIVE_INFINITY;
    return { ...item, maxStackLayers: Math.max(1, Math.min(configured, physicalLayers)) };
  });
}

function addCandidate(list: Candidate[], seen: Set<string>, current: PhysicsTarget, spec: PalletSpec, result: OptimizedPalletPackingResult, label: string) {
  if (!sameLoadedCargo(current.result, result)) return;
  const target = toTarget(current.container, current.cargo, result);
  if (target.result.validationIssues.length) return;
  const signature = createPhysicsTargetSignature(target);
  if (seen.has(signature)) return;
  seen.add(signature);
  list.push({ label, spec, result, target, staticPenalty: staticPenalty(result) });
}

function buildCandidates(current: PhysicsTarget, snapshot: PalletSnapshot) {
  const seen = new Set<string>([createPhysicsTargetSignature(current)]);
  const list: Candidate[] = [];
  const maxLevels = Math.max(1, Math.min(3, Math.floor(snapshot.spec.maxStackLevels || 1)));
  const levelOptions = Array.from(new Set([1, Math.min(2, maxLevels), maxLevels]));
  const heightRatios = [0.72, 0.82, 0.92, 1.0, 1.15];

  for (const heightRatio of heightRatios) {
    for (const maxStackLevels of levelOptions) {
      const spec = { ...snapshot.spec, maxStackLevels };
      const cargo = cappedCargo(current.cargo, spec, heightRatio);
      const packed = centerPalletCargo(packOnPallets(current.container, cargo, spec));
      addCandidate(list, seen, current, spec, packed, `낮고 넓게 · 높이 ${Math.round(heightRatio * 100)}% · ${maxStackLevels}단 제한`);
      addCandidate(list, seen, current, spec, compactResult(packed, current.container, spec, false), `안쪽 밀착 2열 · 높이 ${Math.round(heightRatio * 100)}% · ${maxStackLevels}단 제한`);
      addCandidate(list, seen, current, spec, compactResult(packed, current.container, spec, true), `문쪽 밀착 2열 · 높이 ${Math.round(heightRatio * 100)}% · ${maxStackLevels}단 제한`);
    }
  }

  return list.sort((a, b) => a.staticPenalty - b.staticPenalty).slice(0, 6);
}

function certificationRisk(result: InertiaCertification) {
  const shift = result.maxHorizontalShiftM / Math.max(EPS, INERTIA_PASS_SHIFT_M);
  const tilt = result.maxTiltDeg / Math.max(EPS, INERTIA_PASS_TILT_DEG);
  const slip = (result.maxCargoRelativeSlipM ?? 0) / Math.max(EPS, INERTIA_PASS_PALLET_CARGO_SLIP_M);
  const support = (result.maxSupportShiftM ?? 0) / Math.max(EPS, INERTIA_PASS_SUPPORT_SHIFT_M);
  return Math.max(shift, tilt, slip, support) + (shift + tilt + slip + support) * 0.15 + result.securing.level * 0.03;
}

function better(a: Evaluated, b: Evaluated) {
  if (Math.abs(a.risk - b.risk) > 1e-6) return a.risk < b.risk;
  if (a.certification.securing.level !== b.certification.securing.level) return a.certification.securing.level < b.certification.securing.level;
  if (a.result.stackedPallets !== b.result.stackedPallets) return a.result.stackedPallets < b.result.stackedPallets;
  if (Math.abs(a.staticPenalty - b.staticPenalty) > 1e-6) return a.staticPenalty < b.staticPenalty;
  return a.result.palletCount < b.result.palletCount;
}

function publishCertification(certification: InertiaCertification) {
  (window as PalletWindow).__containerLoadingLatestCertification = certification;
  window.dispatchEvent(new CustomEvent<InertiaCertification>(INERTIA_CERTIFICATION_EVENT, { detail: certification }));
}

function applyCandidate(candidate: Candidate, certification: InertiaCertification) {
  const snapshot: PalletSnapshot = { spec: candidate.spec, result: candidate.result };
  const state = window as PalletWindow;
  state.__containerLoadingPalletSnapshot = snapshot;
  window.dispatchEvent(new CustomEvent<PalletSnapshot>(PALLET_SNAPSHOT_UPDATED_EVENT, { detail: snapshot }));
  publishPhysicsTarget(candidate.target);
  publishCertification(certification);
  setNextPalletCenteredResultOverride(candidate.result);
  window.dispatchEvent(new CustomEvent<PalletSpec>(PALLET_SPEC_FROM_RESULTS_EVENT, { detail: candidate.spec }));

  const restore = () => {
    const target = readPhysicsTarget();
    if (target && createPhysicsTargetSignature(target) === certification.targetSignature) publishCertification(certification);
  };
  window.setTimeout(restore, 80);
  window.setTimeout(restore, 250);
}

export default function PalletResultsOptimizer() {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [attempt, setAttempt] = useState({ index: 0, total: 0, label: '' });
  const [progress, setProgress] = useState<CertificationProgress | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const runId = useRef(0);

  const execute = useCallback(async (detail: ResultsModalDetail) => {
    const id = ++runId.current;
    const current = readPhysicsTarget();
    const snapshot = readPalletSnapshot();
    setOpen(true);
    setRunning(true);
    setProgress(null);
    setMessage('팔레트 결과용 최종 적재안을 다시 비교하고 있습니다.');
    setError('');

    if (!current || current.mode !== 'pallets' || !snapshot) {
      setRunning(false);
      setError('현재 팔레트 적재 결과를 찾지 못했습니다. 팔레트 최적 적재를 먼저 실행하세요.');
      return;
    }

    const initialSignature = createPhysicsTargetSignature(current);
    const baseline: Candidate = {
      label: '현재 팔레트 적재안',
      spec: snapshot.spec,
      result: snapshot.result,
      target: current,
      staticPenalty: staticPenalty(snapshot.result),
    };
    const candidates = [baseline, ...buildCandidates(current, snapshot)];
    setAttempt({ index: 0, total: candidates.length, label: '' });

    let bestPass: Evaluated | null = null;
    let bestOverall: Evaluated | null = null;

    for (let index = 0; index < candidates.length; index += 1) {
      if (runId.current !== id) return;
      const liveTarget = readPhysicsTarget();
      if (!liveTarget || createPhysicsTargetSignature(liveTarget) !== initialSignature) {
        setRunning(false);
        setError('자동 재배치 중 적재안이 변경되어 중단했습니다. 현재 팔레트안으로 결과 보기를 다시 실행하세요.');
        return;
      }

      const candidate = candidates[index];
      setAttempt({ index: index + 1, total: candidates.length, label: candidate.label });
      setMessage(`재배치 ${index + 1}/${candidates.length} · ${candidate.label}`);
      const certification = await runInertiaCertification(candidate.target, next => {
        if (runId.current === id) setProgress(next);
      });
      if (runId.current !== id) return;

      const evaluated: Evaluated = { ...candidate, certification, risk: certificationRisk(certification) };
      if (!bestOverall || better(evaluated, bestOverall)) bestOverall = evaluated;
      if (certification.status === 'passed' && (!bestPass || better(evaluated, bestPass))) bestPass = evaluated;
    }

    if (runId.current !== id) return;
    setRunning(false);

    if (bestPass) {
      applyCandidate(bestPass, bestPass.certification);
      setMessage(`최종 PASS · ${bestPass.label} · 위험지수 ${bestPass.risk.toFixed(2)}`);
      setOpen(false);
      openResultsModal({
        container: bestPass.target.container,
        cargo: bestPass.target.cargo,
        result: bestPass.target.result,
        certification: bestPass.certification,
      });
      return;
    }

    if (bestOverall) {
      applyCandidate(bestOverall, bestOverall.certification);
      setMessage(`가장 안전한 재배치안 적용 · ${bestOverall.label}`);
    }
    setError('같은 화물 수량을 유지한 팔레트 재배치 후보를 모두 시험했지만 관성 3종 PASS를 만들지 못했습니다. 가장 안전했던 안을 시뮬레이터에 적용했으며 결과 보기는 잠금 상태를 유지합니다.');
  }, []);

  useEffect(() => {
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<ResultsModalDetail>).detail;
      if (detail) void execute(detail);
    };
    window.addEventListener(REQUEST_PALLET_RESULTS_OPTIMIZATION_EVENT, onRequest);
    return () => window.removeEventListener(REQUEST_PALLET_RESULTS_OPTIMIZATION_EVENT, onRequest);
  }, [execute]);

  useEffect(() => () => { runId.current += 1; }, []);

  if (!open) return null;
  const percent = attempt.total > 0 ? Math.round(attempt.index / attempt.total * 100) : 0;
  return <div className="final-cert-backdrop">
    <section className="final-cert-modal" role="dialog" aria-modal="true" aria-labelledby="pallet-result-opt-title">
      <header>
        <div>
          <span>FINAL RESULTS OPTIMIZER · PALLET · RAPIER 3D</span>
          <h2 id="pallet-result-opt-title">팔레트 결과보기 전 자동 재배치</h2>
          <p>현재안이 실패해도 멈추지 않고 낮은 적재·2열 분산·1단 우선·안쪽/문쪽 밀착 후보를 다시 만들어 관성 3종을 재검증합니다.</p>
        </div>
        {!running && <button type="button" onClick={() => setOpen(false)}>닫기</button>}
      </header>

      <div className="final-cert-running">
        {running && <div className="physics-spinner" />}
        <div><b>{message}</b><span>{attempt.total ? `레이아웃 ${attempt.index}/${attempt.total} · 전체 탐색 ${percent}%` : '후보 생성 중'}</span></div>
        <progress max="100" value={percent} />
      </div>

      {progress && <div className="final-cert-metrics">
        <span>현재 보강 <b>{progress.levelLabel}</b></span>
        <span>관성 시나리오 <b>{progress.scenarioIndex}/{progress.scenarioCount}</b></span>
        <span>물리 계산 <b>{Math.round(progress.physicsProgress * 100)}%</b></span>
        <span>선정 순서 <b>PASS → 안전여유 → 낮은 적층 → 적은 보강</b></span>
      </div>}

      <article className="final-cert-materials">
        <div className="final-cert-material-head"><div><b>자동 재배치 범위</b><span>화물 수량 유지</span></div><strong>최대 {attempt.total || '-'} 후보</strong></div>
        <div className="final-cert-material-grid">
          <div><span>팔레트 높이</span><b>낮고 넓게</b><small>유닛 높이 단계 하향</small></div>
          <div><span>바닥 배치</span><b>2열 우선</b><small>폭이 허용하면 좌우 동시 사용</small></div>
          <div><span>팔레트 적층</span><b>1단 우선</b><small>빈 바닥이 있으면 위로 안 올림</small></div>
          <div><span>길이 방향</span><b>밀착 비교</b><small>안쪽/문쪽 후보 모두 시험</small></div>
          <div><span>보강재</span><b>자동 재산정</b><small>밴딩·각대·랩핑·고정바</small></div>
          <div><span>최종 결과</span><b>관성 3종 PASS</b><small>PASS 전 결과 잠금</small></div>
        </div>
      </article>

      {error && <div className="final-cert-error"><b>결과보기 잠금 유지</b><span>{error}</span></div>}
    </section>
  </div>;
}
