import {
  INERTIA_CERTIFICATION_EVENT,
  readLatestInertiaCertification,
  type InertiaCertification,
} from './inertiaCertification';
import { createExternalStore } from './store/externalStore';

const store = createExternalStore<InertiaCertification | undefined>(undefined);
let legacyEventBound = false;

function ensureLegacyEventAdapter() {
  if (legacyEventBound || typeof window === 'undefined') return;
  legacyEventBound = true;
  window.addEventListener(INERTIA_CERTIFICATION_EVENT, (event: Event) => {
    const certification = (event as CustomEvent<InertiaCertification | undefined>).detail;
    store.setSnapshot(certification);
  });
}

ensureLegacyEventAdapter();

export function readCertificationState() {
  ensureLegacyEventAdapter();
  return store.getSnapshot() ?? readLatestInertiaCertification();
}

export function subscribeCertification(listener: () => void) {
  ensureLegacyEventAdapter();
  return store.subscribe(listener);
}

export function useCertification() {
  ensureLegacyEventAdapter();
  return store.useSnapshot() ?? readLatestInertiaCertification();
}
