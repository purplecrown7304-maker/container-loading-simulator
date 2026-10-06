import type { CargoItem, ContainerSpec, LoadingResult } from './types';

const KEY = 'container-loading-manual-override-v1';

type ManualOverride = { fingerprint: string; result: LoadingResult };

function fingerprint(container: ContainerSpec, cargo: CargoItem[]): string {
  // Every declared constraint and review number participates. Legacy fingerprints
  // deliberately expire rather than revive a layout after a changed safety input.
  return JSON.stringify({ version: 2, container, cargo });
}

export function readManualOverride(container: ContainerSpec, cargo: CargoItem[]): LoadingResult | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ManualOverride;
    if (parsed.fingerprint !== fingerprint(container,cargo)) return null;
    return parsed.result;
  } catch { return null; }
}

export function writeManualOverride(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(KEY, JSON.stringify({ fingerprint:fingerprint(container,cargo), result } satisfies ManualOverride));
}

export function clearManualOverride(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(KEY);
}
