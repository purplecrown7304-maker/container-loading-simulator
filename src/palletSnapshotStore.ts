import type { OptimizedPalletPackingResult, PalletSpec } from './engine/palletOptimization';
import { clearLatestInertiaCertification } from './inertiaCertification';
import { createExternalStore } from './store/externalStore';

export const PALLET_SNAPSHOT_UPDATED_EVENT = 'container-loading:pallet-snapshot-updated';

export type PalletSnapshot = {
  spec: PalletSpec;
  result: OptimizedPalletPackingResult;
};

type PalletWindow = Window & { __containerLoadingPalletSnapshot?: PalletSnapshot };

const store = createExternalStore<PalletSnapshot | undefined>(undefined);
let legacyEventBound = false;
let preserveCertificationForNextLegacyEvent = false;

function legacyWindowSnapshot() {
  if (typeof window === 'undefined') return undefined;
  return (window as PalletWindow).__containerLoadingPalletSnapshot;
}

function mirrorLegacyWindow(snapshot: PalletSnapshot | undefined) {
  if (typeof window === 'undefined') return;
  (window as PalletWindow).__containerLoadingPalletSnapshot = snapshot;
}

function ensureLegacyEventAdapter() {
  if (legacyEventBound || typeof window === 'undefined') return;
  legacyEventBound = true;
  window.addEventListener(PALLET_SNAPSHOT_UPDATED_EVENT, (event: Event) => {
    const snapshot = (event as CustomEvent<PalletSnapshot | undefined>).detail;
    if (!preserveCertificationForNextLegacyEvent) clearLatestInertiaCertification();
    preserveCertificationForNextLegacyEvent = false;
    store.setSnapshot(snapshot ?? legacyWindowSnapshot());
  });
}

ensureLegacyEventAdapter();

export function readPalletSnapshot() {
  ensureLegacyEventAdapter();
  return store.getSnapshot() ?? legacyWindowSnapshot();
}

export function publishPalletSnapshot(snapshot: PalletSnapshot, options?: { preserveCertification?: boolean; emitLegacyEvent?: boolean }) {
  ensureLegacyEventAdapter();
  if (!options?.preserveCertification) clearLatestInertiaCertification();
  store.setSnapshot(snapshot);
  mirrorLegacyWindow(snapshot);
  if (options?.emitLegacyEvent !== false && typeof window !== 'undefined') {
    preserveCertificationForNextLegacyEvent = options?.preserveCertification === true;
    window.dispatchEvent(new CustomEvent<PalletSnapshot>(PALLET_SNAPSHOT_UPDATED_EVENT, { detail: snapshot }));
  }
}

export function clearPalletSnapshot(options?: { preserveCertification?: boolean }) {
  ensureLegacyEventAdapter();
  if (!options?.preserveCertification) clearLatestInertiaCertification();
  store.setSnapshot(undefined);
  mirrorLegacyWindow(undefined);
}

export function subscribePalletSnapshot(listener: () => void) {
  ensureLegacyEventAdapter();
  return store.subscribe(listener);
}

export function usePalletSnapshot() {
  ensureLegacyEventAdapter();
  return store.useSnapshot() ?? legacyWindowSnapshot();
}
