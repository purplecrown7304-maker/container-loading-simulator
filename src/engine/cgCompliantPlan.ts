import { loadContainer, type LoadingOptions } from './loadingEngine';
import type { CargoItem, ContainerSpec, LoadingResult } from './types';

const hasCgError = (result: LoadingResult) => (result.operationalFindings ?? []).some(f => f.code === 'CG_LONGITUDINAL' && f.severity === 'error');

/**
 * Alternative offered next to a full load that fails longitudinal CG: the largest quantity
 * that passes, removing cartons from the heavy end. The removed quantity is reported as
 * CG_LIMIT instead of being hidden behind a space reason.
 */
export function cgCompliantAlternative(container: ContainerSpec, cargo: CargoItem[], options: LoadingOptions = {}) {
  const full = loadContainer(container, cargo, { ...options, publish: false });
  if (!hasCgError(full) || !full.placements.length) return null;
  const weight = full.placements.reduce((s, p) => s + p.weightKg, 0);
  const cg = full.placements.reduce((s, p) => s + (p.x + p.length / 2) * p.weightKg, 0) / weight;
  const doorHeavy = cg > container.length / 2;
  const mean = new Map<string, { moment: number; weight: number; count: number }>();
  for (const p of full.placements) { const e = mean.get(p.cargoId) ?? { moment: 0, weight: 0, count: 0 }; e.moment += (p.x + p.length / 2) * p.weightKg; e.weight += p.weightKg; e.count++; mean.set(p.cargoId, e); }
  const order = [...mean.entries()].map(([id, e]) => ({ id, x: e.moment / e.weight, count: e.count })).sort((a, b) => doorHeavy ? b.x - a.x : a.x - b.x);
  const loaded = new Map(order.map(row => [row.id, row.count]));
  const reduce = (removed: number) => {
    let leftToRemove = removed;
    const cut = new Map<string, number>();
    for (const row of order) { const n = Math.min(row.count, leftToRemove); cut.set(row.id, n); leftToRemove -= n; }
    return { cut, cargo: cargo.map(item => ({ ...item, quantity: Math.max(0, (loaded.get(item.id) ?? 0) - (cut.get(item.id) ?? 0)) })).filter(item => item.quantity > 0) };
  };
  const total = order.reduce((s, row) => s + row.count, 0);
  let lo = 1, hi = total, best: { result: LoadingResult; cut: Map<string, number> } | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const trial = reduce(mid);
    const result = trial.cargo.length ? loadContainer(container, trial.cargo, { ...options, publish: false }) : full;
    if (trial.cargo.length && !hasCgError(result)) { best = { result, cut: trial.cut }; hi = mid - 1; } else lo = mid + 1;
  }
  if (!best) return null;
  const removed = [...best.cut.entries()].filter(([, n]) => n > 0).map(([cargoId, quantity]) => ({ cargoId, quantity, reasonCode: 'CG_LIMIT', reason: '길이 방향 무게중심 허용범위를 지키기 위해 제외' }));
  return { result: { ...best.result, remaining: [...best.result.remaining, ...removed] }, removed };
}
