import type { CargoItem, ContainerSpec, LoadingResult } from './types';

const KEY = 'container-loading-manual-override-v1';

type ManualOverride = { fingerprint: string; result: LoadingResult };

function fingerprint(container: ContainerSpec, cargo: CargoItem[]): string {
  return JSON.stringify({
    c:[container.length,container.width,container.height,container.maxPayloadKg],
    items:cargo.map(item => [item.id,item.length,item.width,item.height,item.weightKg,item.quantity,item.maxStackLayers??null,item.maxTopLoadKg??null,item.allowRotation!==false,item.unloadPriority??null]),
  });
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
