import { readSecuringMaterialSettings, type SecuringMaterialSettings } from '../securingMaterialSettings';
import type { ContainerSpec, Placement } from './types';

export type GapFillKind = 'side-gap' | 'door-face' | 'height-step' | 'row-gap' | 'top-void';
export type GapFillMaterial = 'dunnage-airbag' | 'paper-honeycomb' | 'load-bar' | 'unresolved';

export type GapFill = {
  id: string;
  kind: GapFillKind;
  material: GapFillMaterial;
  quantity: number;
  weightKg: number;
  fixedSupportEligible: boolean;
  gapM: number;
  voidVolumeM3: number;
  x: number;
  y: number;
  z: number;
  length: number;
  width: number;
  height: number;
};

const EPS = 1e-6;
const MIN_GAP = 0.012;
const MIN_STEP = 0.05;
/** Search reach for a nearby higher cargo face. This is an app geometry rule, not material strength. */
export const BRACE_REACH_M = 1.2;

function inRange(value: number, min: number, max: number) {
  return value + EPS >= min && value <= max + EPS;
}

function materialize(
  base: Omit<GapFill, 'material' | 'quantity' | 'weightKg' | 'fixedSupportEligible'>,
  settings: SecuringMaterialSettings,
): GapFill {
  const airBagCandidate = base.kind === 'side-gap' || base.kind === 'row-gap';
  if (airBagCandidate && inRange(base.gapM, settings.voidAirBagMinGapM, settings.voidAirBagMaxGapM)) {
    const faceArea = Math.max(EPS, base.length * base.height);
    const quantity = Math.max(1, Math.ceil(faceArea / Math.max(EPS, settings.voidAirBagFaceAreaM2)));
    return { ...base, material: 'dunnage-airbag', quantity, weightKg: quantity * settings.voidAirBagKgPerEa, fixedSupportEligible: true };
  }
  if (inRange(base.gapM, settings.voidHoneycombMinGapM, settings.voidHoneycombMaxGapM)) {
    const moduleVolume = Math.max(EPS, settings.voidHoneycombModuleVolumeM3);
    const quantity = Math.max(1, Math.ceil(base.voidVolumeM3 / moduleVolume));
    return {
      ...base,
      material: 'paper-honeycomb',
      quantity,
      weightKg: quantity * moduleVolume * settings.voidHoneycombKgPerM3,
      fixedSupportEligible: true,
    };
  }
  return { ...base, material: 'unresolved', quantity: 0, weightKg: 0, fixedSupportEligible: false };
}

/**
 * Void-fill demand from the actual occupied height map. Empty longitudinal slabs are not
 * converted into solid filler: the inner wall already blocks X=0 and the door-side face is
 * handled by a load-bar plan at the cargo face.
 *
 * Material defaults are planning values only. A fill becomes a fixed inertia support only
 * when its geometry falls inside the configured material range.
 */
export function gapSecuringPlan(
  container: ContainerSpec,
  placements: Placement[],
  settings: SecuringMaterialSettings = readSecuringMaterialSettings(),
) {
  const fills: GapFill[] = [];
  const empty = { fills, sideGapM: 0, rearGapM: 0, volumeM3: 0, weightKg: 0, unresolvedCount: 0 };
  if (!placements.length) return empty;

  const r = (v: number) => Math.round(v * 1e6) / 1e6;
  const uniq = (values: number[]) => [...new Set(values.map(r))].sort((a, b) => a - b);
  const xs = uniq([0, container.length, ...placements.flatMap(p => [p.x, p.x + p.length])])
    .filter(v => v >= 0 && v <= container.length + EPS);
  const ys = uniq([0, container.width, ...placements.flatMap(p => [p.y, p.y + p.width])])
    .filter(v => v >= 0 && v <= container.width + EPS);
  const nx = xs.length - 1;
  const ny = ys.length - 1;
  const h = Array.from({ length: nx }, () => new Float64Array(ny));
  const lower = (arr: number[], v: number) => {
    let lo = 0, hi = arr.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] < v - EPS) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  for (const p of placements) {
    const i0 = lower(xs, r(p.x));
    const i1 = lower(xs, r(p.x + p.length));
    const j0 = lower(ys, r(p.y));
    const j1 = lower(ys, r(p.y + p.width));
    const top = p.z + p.height;
    for (let i = i0; i < i1; i += 1) for (let j = j0; j < j1; j += 1) {
      if (top > h[i][j]) h[i][j] = top;
    }
  }

  const slabMax = h.map(row => Math.max(...row));
  let sideGapM = 0;
  for (let i = 0; i < nx; i += 1) {
    if (slabMax[i] <= EPS || xs[i + 1] - xs[i] <= MIN_GAP) continue;

    let target = slabMax[i];
    for (let k = 0; k < nx; k += 1) {
      if (slabMax[k] <= EPS) continue;
      const distance = k < i ? xs[i] - xs[k + 1] : k > i ? xs[k] - xs[i + 1] : 0;
      if (distance <= BRACE_REACH_M + EPS && slabMax[k] > target) target = slabMax[k];
    }

    let covered = 0;
    for (let j = 0; j < ny; j += 1) if (h[i][j] > EPS) covered += ys[j + 1] - ys[j];
    sideGapM = Math.max(sideGapM, container.width - covered);

    for (let j = 0; j < ny;) {
      const base = h[i][j];
      let end = j + 1;
      while (end < ny && Math.abs(h[i][end] - base) < EPS) end += 1;
      const width = ys[end] - ys[j];
      const height = target - base;
      if (height > MIN_STEP && width > MIN_GAP) {
        const boundary = j === 0 || end === ny;
        const kind: GapFillKind = base <= EPS
          ? boundary ? 'side-gap' : 'row-gap'
          : boundary ? 'height-step' : 'top-void';
        const gapM = base <= EPS ? width : height;
        const length = xs[i + 1] - xs[i];
        const voidVolumeM3 = length * width * height;
        fills.push(materialize({
          id: `fill-${i}-${j}`,
          kind,
          gapM,
          voidVolumeM3,
          x: xs[i],
          y: ys[j],
          z: base,
          length,
          width,
          height,
        }, settings));
      }
      j = end;
    }
  }

  const maxX = Math.max(...placements.map(p => p.x + p.length));
  const rearGapM = Math.max(0, container.length - maxX);
  if (rearGapM > MIN_GAP) {
    const cargoTop = Math.max(...placements.map(p => p.z + p.height));
    const spanOk = inRange(container.width, settings.voidDoorBarMinSpanM, settings.voidDoorBarMaxSpanM);
    const coverage = Math.max(EPS, settings.voidDoorBarCoverageHeightM);
    const quantity = spanOk ? Math.max(1, Math.ceil(cargoTop / coverage)) : 0;
    const supportDepth = Math.min(0.03, rearGapM);
    fills.push({
      id: 'fill-door-face',
      kind: 'door-face',
      material: spanOk ? 'load-bar' : 'unresolved',
      quantity,
      weightKg: quantity * settings.voidDoorBarKgPerEa,
      fixedSupportEligible: spanOk,
      gapM: rearGapM,
      voidVolumeM3: rearGapM * container.width * cargoTop,
      x: maxX,
      y: 0,
      z: 0,
      length: supportDepth,
      width: container.width,
      height: cargoTop,
    });
  }

  return {
    fills,
    sideGapM,
    rearGapM,
    volumeM3: fills.reduce((sum, fill) => sum + fill.voidVolumeM3, 0),
    weightKg: fills.reduce((sum, fill) => sum + fill.weightKg, 0),
    unresolvedCount: fills.filter(fill => !fill.fixedSupportEligible).length,
  };
}

