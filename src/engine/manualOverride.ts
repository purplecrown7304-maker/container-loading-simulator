import type { CargoItem, ContainerSpec, LoadingResult } from './types';

const KEY = 'container-loading-manual-override-v1';

type ManualOverride = { fingerprint: string; result: LoadingResult };

function fingerprint(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult): string {
  return JSON.stringify({
    version: 2,
    // Preserve all equipment/cargo fields so new safety metadata cannot reuse an
    // override fingerprint produced for weaker or different inputs.
    container,
    cargo: cargo.map(item => ({ ...item, allowRotation: item.allowRotation !== false })),
    ruleEngine: result.ruleEngine ?? 'legacy',
    ruleEngineInput: result.ruleEngineInput ?? null,
    placements: result.placements.map(item => [item.cargoId, item.x, item.y, item.z, item.length, item.width, item.height, item.weightKg, item.rotated === true, item.loadSimOrientation ?? null]),
  });
}

export function readManualOverride(container: ContainerSpec, cargo: CargoItem[]): LoadingResult | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ManualOverride;
    // A is the sole loading method; old layouts must be recomputed under A.
    if (parsed.result.ruleEngine !== 'load-sim') return null;
    if (parsed.fingerprint !== fingerprint(container, cargo, parsed.result)) return null;
    return parsed.result;
  } catch { return null; }
}

export function writeManualOverride(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(KEY, JSON.stringify({ fingerprint:fingerprint(container,cargo,result), result } satisfies ManualOverride));
}

export function clearManualOverride(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(KEY);
}
