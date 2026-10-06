import type { ContainerSpec, Placement } from './types';

export type GapFill = { id: string; x: number; y: number; z: number; length: number; width: number; height: number };
const MIN_GAP = 0.012;
const MIN_STEP = 0.05;
/** A brace/void fill acts on cargo faces within this longitudinal distance. */
export const BRACE_REACH_M = 1.2;
/** Placeholder unit weight until the company's material table is registered. */
export const VOID_FILL_KG_PER_M3 = 10;

/**
 * Void-fill demand from the actual height map: no gap, no material.
 * A cell lower than the tallest cargo within BRACE_REACH_M (same or neighbouring
 * X slab) must be filled/braced up to that height. Covers side gaps, the door-side
 * face, height steps, notches inside a row and missing cartons of a top tier.
 */
export function gapSecuringPlan(container: ContainerSpec, placements: Placement[]) {
  const fills: GapFill[] = [];
  const empty = { fills, sideGapM: 0, rearGapM: 0, volumeM3: 0, weightKg: 0 };
  if (!placements.length) return empty;
  const r = (v: number) => Math.round(v * 1e6) / 1e6;
  const uniq = (values: number[]) => [...new Set(values.map(r))].sort((a, b) => a - b);
  const xs = uniq([0, container.length, ...placements.flatMap(p => [p.x, p.x + p.length])]).filter(v => v >= 0 && v <= container.length + 1e-6);
  const ys = uniq([0, container.width, ...placements.flatMap(p => [p.y, p.y + p.width])]).filter(v => v >= 0 && v <= container.width + 1e-6);
  const nx = xs.length - 1, ny = ys.length - 1;
  const h = Array.from({ length: nx }, () => new Float64Array(ny));
  const lower = (arr: number[], v: number) => { let lo = 0, hi = arr.length - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < v - 1e-6) lo = mid + 1; else hi = mid; } return lo; };
  for (const p of placements) {
    const i0 = lower(xs, r(p.x)), i1 = lower(xs, r(p.x + p.length)), j0 = lower(ys, r(p.y)), j1 = lower(ys, r(p.y + p.width)), top = p.z + p.height;
    for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) if (top > h[i][j]) h[i][j] = top;
  }
  const slabMax = h.map(row => Math.max(...row));
  let sideGapM = 0;
  for (let i = 0; i < nx; i++) {
    if (xs[i + 1] - xs[i] <= MIN_GAP) continue;
    let target = slabMax[i];
    for (let k = 0; k < nx; k++) {
      const distance = k < i ? xs[i] - xs[k + 1] : k > i ? xs[k] - xs[i + 1] : 0;
      if (distance <= BRACE_REACH_M + 1e-6 && slabMax[k] > target) target = slabMax[k];
    }
    if (slabMax[i] > 0) { let covered = 0; for (let j = 0; j < ny; j++) if (h[i][j] > 0) covered += ys[j + 1] - ys[j]; sideGapM = Math.max(sideGapM, container.width - covered); }
    for (let j = 0; j < ny;) {
      const base = h[i][j];
      let end = j + 1;
      while (end < ny && Math.abs(h[i][end] - base) < 1e-6) end++;
      const width = ys[end] - ys[j];
      if (target - base > MIN_STEP && width > MIN_GAP) fills.push({ id: `fill-${i}-${j}`, x: xs[i], y: ys[j], z: base, length: xs[i + 1] - xs[i], width, height: target - base });
      j = end;
    }
  }
  const rearGapM = Math.max(0, container.length - Math.max(...placements.map(p => p.x + p.length)));
  const volumeM3 = fills.reduce((s, f) => s + f.length * f.width * f.height, 0);
  return { fills, sideGapM, rearGapM, volumeM3, weightKg: volumeM3 * VOID_FILL_KG_PER_M3 };
}

