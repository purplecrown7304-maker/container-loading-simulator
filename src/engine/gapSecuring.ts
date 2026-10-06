import {
  defaultSecuringMaterialSettings,
  type SecuringMaterialSettings,
  type VoidFillMaterialRule,
} from '../securingMaterialSettings';
import type { PhysicsSupport } from './physicsValidation';
import type { ContainerSpec, Placement, VoidFillKind, VoidFillPlan, VoidFillPlanItem } from './types';

type RawFill = { id: string; x: number; y: number; z: number; length: number; width: number; height: number; kind: VoidFillKind };
const MIN_GAP = 0.012;
const MIN_STEP = 0.05;
const EPS = 1e-6;
/** A brace/void fill acts on cargo faces within this longitudinal distance. */
export const BRACE_REACH_M = 1.2;
export const VOID_FILL_DISCLAIMER = '앱 기본값이며 현장 자재로 확인 필요. 자재 정격·운송 안전을 보증하지 않습니다.';

const keyForKind: Record<VoidFillKind, keyof SecuringMaterialSettings['voidFill']> = {
  'side-gap': 'sideGap',
  'door-face': 'doorFace',
  'height-step': 'heightStep',
  'row-hole': 'rowHole',
  'top-void': 'topVoid',
};

function faceArea(fill: RawFill) {
  if (fill.kind === 'door-face') return fill.width * fill.height;
  if (fill.kind === 'side-gap') return fill.length * fill.height;
  if (fill.kind === 'height-step' || fill.kind === 'top-void') return fill.length * fill.width;
  return Math.max(fill.length, fill.width) * fill.height;
}

function applicabilityMeasure(container: ContainerSpec, fill: RawFill) {
  if (fill.kind === 'door-face') return container.width;
  if (fill.kind === 'side-gap') return fill.width;
  if (fill.kind === 'height-step' || fill.kind === 'top-void') return fill.height;
  return Math.min(fill.length, fill.width);
}

function materialize(container: ContainerSpec, fill: RawFill, rule: VoidFillMaterialRule): VoidFillPlanItem {
  const area = Math.max(EPS, faceArea(fill));
  const quantity = Math.max(1, Math.ceil(area / Math.max(EPS, rule.unitCoverageM2)));
  const measure = applicabilityMeasure(container, fill);
  return {
    ...fill,
    volumeM3: fill.length * fill.width * fill.height,
    applicabilityMeasureM: measure,
    materialId: rule.materialId,
    materialLabel: rule.label,
    quantity,
    unitWeightKg: rule.unitWeightKg,
    totalWeightKg: quantity * rule.unitWeightKg,
    minGapM: rule.minGapM,
    maxGapM: rule.maxGapM,
    applicable: measure + EPS >= rule.minGapM && measure <= rule.maxGapM + EPS,
  };
}

/**
 * Void-fill demand from the actual height map: no gap, no material.
 * A cell lower than the tallest cargo within BRACE_REACH_M must be filled or braced.
 * Material quantities are deterministic ceil(face area / configured unit coverage).
 */
export function gapSecuringPlan(
  container: ContainerSpec,
  placements: Placement[],
  materials: SecuringMaterialSettings = defaultSecuringMaterialSettings,
): VoidFillPlan {
  const empty: VoidFillPlan = {
    fills: [], sideGapM: 0, rearGapM: 0, volumeM3: 0, weightKg: 0,
    applicableWeightKg: 0, unresolvedCount: 0, disclaimer: VOID_FILL_DISCLAIMER,
  };
  if (!placements.length) return empty;

  const r = (v: number) => Math.round(v * 1e6) / 1e6;
  const uniq = (values: number[]) => [...new Set(values.map(r))].sort((a, b) => a - b);
  const xs = uniq([0, container.length, ...placements.flatMap(p => [p.x, p.x + p.length])]).filter(v => v >= 0 && v <= container.length + EPS);
  const ys = uniq([0, container.width, ...placements.flatMap(p => [p.y, p.y + p.width])]).filter(v => v >= 0 && v <= container.width + EPS);
  const nx = xs.length - 1, ny = ys.length - 1;
  const h = Array.from({ length: nx }, () => new Float64Array(ny));
  const lower = (arr: number[], v: number) => {
    let lo = 0, hi = arr.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < v - EPS) lo = mid + 1; else hi = mid; }
    return lo;
  };
  for (const p of placements) {
    const i0 = lower(xs, r(p.x)), i1 = lower(xs, r(p.x + p.length)), j0 = lower(ys, r(p.y)), j1 = lower(ys, r(p.y + p.width)), top = p.z + p.height;
    for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) if (top > h[i][j]) h[i][j] = top;
  }

  const slabMax = h.map(row => Math.max(...row));
  const maxCargoX = Math.max(...placements.map(p => p.x + p.length));
  let sideGapM = 0;
  const raw: RawFill[] = [];

  for (let i = 0; i < nx; i++) {
    if (xs[i + 1] - xs[i] <= MIN_GAP) continue;
    let target = slabMax[i];
    for (let k = 0; k < nx; k++) {
      const distance = k < i ? xs[i] - xs[k + 1] : k > i ? xs[k] - xs[i + 1] : 0;
      if (distance <= BRACE_REACH_M + EPS && slabMax[k] > target) target = slabMax[k];
    }
    if (slabMax[i] > 0) {
      let covered = 0;
      for (let j = 0; j < ny; j++) if (h[i][j] > 0) covered += ys[j + 1] - ys[j];
      sideGapM = Math.max(sideGapM, container.width - covered);
    }

    for (let j = 0; j < ny;) {
      const base = h[i][j];
      let end = j + 1;
      while (end < ny && Math.abs(h[i][end] - base) < EPS) end++;
      const width = ys[end] - ys[j];
      if (target - base > MIN_STEP && width > MIN_GAP) {
        const x = xs[i], length = xs[i + 1] - xs[i], y = ys[j], height = target - base;
        let kind: VoidFillKind;
        if (x >= maxCargoX - EPS) kind = 'door-face';
        else if (base <= EPS && (y <= EPS || y + width >= container.width - EPS)) kind = 'side-gap';
        else if (base <= EPS) kind = 'row-hole';
        else {
          let surroundingHigh = 0;
          if (j > 0 && h[i][j - 1] >= target - EPS) surroundingHigh++;
          if (end < ny && h[i][end] >= target - EPS) surroundingHigh++;
          if (i > 0 && Array.from(h[i - 1].slice(j, end)).some(v => v >= target - EPS)) surroundingHigh++;
          if (i + 1 < nx && Array.from(h[i + 1].slice(j, end)).some(v => v >= target - EPS)) surroundingHigh++;
          kind = surroundingHigh >= 2 ? 'top-void' : 'height-step';
        }
        raw.push({ id: `fill-${i}-${j}`, x, y, z: base, length, width, height, kind });
      }
      j = end;
    }
  }

  const fills = raw.map(fill => materialize(container, fill, materials.voidFill[keyForKind[fill.kind]]));
  const rearGapM = Math.max(0, container.length - maxCargoX);
  const volumeM3 = fills.reduce((sum, fill) => sum + fill.volumeM3, 0);
  const weightKg = fills.reduce((sum, fill) => sum + fill.totalWeightKg, 0);
  const applicableWeightKg = fills.filter(fill => fill.applicable).reduce((sum, fill) => sum + fill.totalWeightKg, 0);
  const unresolvedCount = fills.filter(fill => !fill.applicable).length;
  return { fills, sideGapM, rearGapM, volumeM3, weightKg, applicableWeightKg, unresolvedCount, disclaimer: VOID_FILL_DISCLAIMER };
}

/** Only configured in-range materials become immovable physics obstacles. */
export function gapSecuringPhysicsSupports(plan?: VoidFillPlan): PhysicsSupport[] {
  if (!plan) return [];
  return plan.fills.filter(fill => fill.applicable).map(fill => ({
    id: `void-fill:${fill.id}:${fill.materialId}`,
    x: fill.x,
    y: fill.y,
    z: fill.z,
    length: fill.length,
    width: fill.width,
    height: fill.height,
    weightKg: Math.max(0.01, fill.totalWeightKg),
    dynamic: false,
  }));
}
