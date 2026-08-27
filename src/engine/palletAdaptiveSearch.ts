import { centerPalletCargo, setNextPalletCenteredResultOverride } from './palletCentering';
import { validatePlacements } from './constraints';
import { packOnPallets, type OptimizedPalletPackingResult, type PalletLoad, type PalletSpec } from './palletOptimization';
import type { CargoItem, ContainerSpec, LoadingResult, Placement } from './types';
import {
  INERTIA_CERTIFICATION_EVENT,
  INERTIA_PASS_PALLET_CARGO_SLIP_M,
  INERTIA_PASS_SHIFT_M,
  INERTIA_PASS_SUPPORT_SHIFT_M,
  INERTIA_PASS_TILT_DEG,
  createPhysicsTargetSignature,
  type InertiaCertification,
} from '../inertiaCertification';
import { publishPhysicsTarget, readPhysicsTarget, type PhysicsTarget } from '../physicsTarget';

const EPS = 1e-9;
const CENTERLINE_EPS = 1e-6;
const PALLET_SPEC_FROM_RESULTS_EVENT = 'container-loading:pallet-spec-from-results';
const PALLET_SNAPSHOT_UPDATED_EVENT = 'container-loading:pallet-snapshot-updated';

export type PalletSnapshot = { spec: PalletSpec; result: OptimizedPalletPackingResult };
export type PalletAdaptiveCandidate = {
  label: string;
  spec: PalletSpec;
  result: OptimizedPalletPackingResult;
  target: PhysicsTarget;
  staticPenalty: number;
};
export type EvaluatedPalletCandidate = PalletAdaptiveCandidate & { certification: InertiaCertification; risk: number };

type PalletWindow = Window & {
  __containerLoadingPalletSnapshot?: PalletSnapshot;
  __containerLoadingLatestCertification?: InertiaCertification;
};

type OrientationVariant = {
  label: string;
  cargo: CargoItem[];
  forcedRotatedIds: Set<string>;
};

export function readPalletSnapshot(): PalletSnapshot | undefined {
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

export function calculateAdaptiveLateralImbalanceKg(
  pallets: Array<Pick<PalletLoad, 'centerOfGravity' | 'totalWeightKg'>>,
  container: ContainerSpec,
) {
  let left = 0;
  let right = 0;
  for (const pallet of pallets) {
    const delta = pallet.centerOfGravity.y - container.width / 2;
    if (Math.abs(delta) < CENTERLINE_EPS) continue;
    if (delta < 0) left += pallet.totalWeightKg;
    else right += pallet.totalWeightKg;
  }
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
  const maxBands = Math.max(1, Math.floor((container.length + EPS) / spec.length));
  if (columns.length > maxBands * lanes) return input;
  const moved: PalletLoad[] = [];

  columns.forEach((column, index) => {
    const band = Math.floor(index / lanes);
    const rawLane = index % lanes;
    const lane = band % 2 === 0 ? rawLane : lanes - 1 - rawLane;
    const x = fromDoor
      ? Math.max(0, container.length - (band + 1) * spec.length)
      : band * spec.length;
    const y = yOffset + lane * spec.width;
    const stackColumn = index + 1;
    column.loads.forEach(load => moved.push({ ...moveLoad(load, x, y), stackColumn }));
  });

  moved.sort((a, b) => a.stackColumn - b.stackColumn || a.stackLevel - b.stackLevel);
  return {
    ...input,
    pallets: moved,
    placements: moved.flatMap(item => item.cargoPlacements),
    lateralImbalanceKg: calculateAdaptiveLateralImbalanceKg(moved, container),
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
  return result.stackedPallets * 24
    + Math.max(0, result.maxUsedStackLevel - 1) * 10
    + maxUnitHeight(result) * 4
    + result.lateralImbalanceKg / 1200
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

function orientationVariants(cargo: CargoItem[]): OrientationVariant[] {
  const rotatable = cargo.filter(item => item.allowRotation !== false && Math.abs(item.length - item.width) > EPS);
  const rotatableIds = new Set(rotatable.map(item => item.id));
  const alternatingIds = new Set(rotatable.filter((_, index) => index % 2 === 1).map(item => item.id));
  const buildFixed = (forced: Set<string>) => cargo.map(item => {
    const shouldRotate = forced.has(item.id);
    if (!rotatableIds.has(item.id)) return { ...item, allowRotation: false };
    return shouldRotate
      ? { ...item, length: item.width, width: item.length, allowRotation: false }
      : { ...item, allowRotation: false };
  });

  return [
    { label: '자동 방향', cargo: cargo.map(item => ({ ...item })), forcedRotatedIds: new Set<string>() },
    { label: '정방향 고정', cargo: buildFixed(new Set<string>()), forcedRotatedIds: new Set<string>() },
    { label: '90도 회전 고정', cargo: buildFixed(rotatableIds), forcedRotatedIds: rotatableIds },
    { label: 'SKU 교차 방향', cargo: buildFixed(alternatingIds), forcedRotatedIds: alternatingIds },
  ];
}

function markRotation(placement: Placement, forcedRotatedIds: Set<string>): Placement {
  return forcedRotatedIds.has(placement.cargoId) ? { ...placement, rotated: true } : placement;
}

function restoreRotationFlags(result: OptimizedPalletPackingResult, forcedRotatedIds: Set<string>) {
  if (!forcedRotatedIds.size) return result;
  const pallets = result.pallets.map(pallet => ({
    ...pallet,
    cargoPlacements: pallet.cargoPlacements.map(item => markRotation(item, forcedRotatedIds)),
  }));
  return { ...result, pallets, placements: pallets.flatMap(pallet => pallet.cargoPlacements) };
}

function addCandidate(
  list: PalletAdaptiveCandidate[],
  seen: Set<string>,
  current: PhysicsTarget,
  spec: PalletSpec,
  result: OptimizedPalletPackingResult,
  label: string,
) {
  if (!sameLoadedCargo(current.result, result)) return;
  const target = toTarget(current.container, current.cargo, result);
  if (target.result.validationIssues.length) return;
  const signature = createPhysicsTargetSignature(target);
  if (seen.has(signature)) return;
  seen.add(signature);
  list.push({ label, spec, result, target, staticPenalty: staticPenalty(result) });
}

export function buildPalletAdaptiveCandidates(current: PhysicsTarget, snapshot: PalletSnapshot): PalletAdaptiveCandidate[] {
  if (current.mode !== 'pallets') return [];
  const seen = new Set<string>([createPhysicsTargetSignature(current)]);
  const list: PalletAdaptiveCandidate[] = [];
  const configuredMax = Math.max(1, Math.floor(snapshot.spec.maxStackLevels || 1));
  const physicalMax = Math.max(1, Math.floor((current.container.height + EPS) / Math.max(snapshot.spec.height, EPS)));
  const maxLevels = Math.min(configuredMax, physicalMax);
  const levelOptions = Array.from({ length: maxLevels }, (_, index) => index + 1);
  const heightRatios = [0.6, 0.72, 0.84, 0.96, 1.05, 1.15];

  for (const variant of orientationVariants(current.cargo)) {
    for (const heightRatio of heightRatios) {
      for (const maxStackLevels of levelOptions) {
        const spec = { ...snapshot.spec, maxStackLevels };
        const cargo = cappedCargo(variant.cargo, spec, heightRatio);
        const packed = restoreRotationFlags(centerPalletCargo(packOnPallets(current.container, cargo, spec)), variant.forcedRotatedIds);
        const baseLabel = `${variant.label} · 높이 ${Math.round(heightRatio * 100)}% · ${maxStackLevels}단 제한`;
        addCandidate(list, seen, current, spec, packed, `팔레트 위 재배치 · ${baseLabel}`);
        addCandidate(list, seen, current, spec, compactResult(packed, current.container, spec, false), `안쪽 밀착 2열 · ${baseLabel}`);
        addCandidate(list, seen, current, spec, compactResult(packed, current.container, spec, true), `문쪽 밀착 2열 · ${baseLabel}`);
      }
    }
  }

  return list.sort((a, b) => a.staticPenalty - b.staticPenalty);
}

export function baselinePalletCandidate(current: PhysicsTarget, snapshot: PalletSnapshot): PalletAdaptiveCandidate {
  return {
    label: '현재 팔레트 적재안',
    spec: snapshot.spec,
    result: snapshot.result,
    target: current,
    staticPenalty: staticPenalty(snapshot.result),
  };
}

export function palletCertificationRisk(result: InertiaCertification) {
  const shift = result.maxHorizontalShiftM / Math.max(EPS, INERTIA_PASS_SHIFT_M);
  const tilt = result.maxTiltDeg / Math.max(EPS, INERTIA_PASS_TILT_DEG);
  const slip = (result.maxCargoRelativeSlipM ?? 0) / Math.max(EPS, INERTIA_PASS_PALLET_CARGO_SLIP_M);
  const support = (result.maxSupportShiftM ?? 0) / Math.max(EPS, INERTIA_PASS_SUPPORT_SHIFT_M);
  return Math.max(shift, tilt, slip, support) + (shift + tilt + slip + support) * 0.15 + result.securing.level * 0.03;
}

export function betterPalletEvaluation(a: EvaluatedPalletCandidate, b: EvaluatedPalletCandidate) {
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

export function applyPalletAdaptiveCandidate(candidate: PalletAdaptiveCandidate, certification: InertiaCertification) {
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
