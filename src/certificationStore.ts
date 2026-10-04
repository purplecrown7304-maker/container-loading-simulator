import {
  INERTIA_CERTIFICATION_EVENT,
  hasBlockingLoadingRules,
  readLatestInertiaCertification,
  type InertiaCertification,
} from './inertiaCertification';
import { createExternalStore } from './store/externalStore';
import { readPhysicsTarget, subscribePhysicsTarget, usePhysicsTarget } from './physicsTarget';

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
  const target = readPhysicsTarget();
  if (target && hasBlockingLoadingRules(target.result)) return undefined;
  return store.getSnapshot() ?? readLatestInertiaCertification();
}

export function subscribeCertification(listener: () => void) {
  ensureLegacyEventAdapter();
  const unsubscribeCertification = store.subscribe(listener);
  const unsubscribeTarget = subscribePhysicsTarget(listener);
  return () => { unsubscribeCertification(); unsubscribeTarget(); };
}

export function useCertification() {
  ensureLegacyEventAdapter();
  const certification = store.useSnapshot();
  const target = usePhysicsTarget();
  if (target && hasBlockingLoadingRules(target.result)) return undefined;
  return certification ?? readLatestInertiaCertification();
}
