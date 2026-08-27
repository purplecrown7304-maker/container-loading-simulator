import type { PhysicsSupport } from './engine/physicsValidation';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { createExternalStore } from './store/externalStore';

export const PHYSICS_TARGET_EVENT = 'container-loading:physics-target';

export type PhysicsTarget = {
  mode: 'boxes' | 'pallets';
  container: ContainerSpec;
  cargo: CargoItem[];
  result: LoadingResult;
  supports?: PhysicsSupport[];
};

type PhysicsTargetWindow = Window & { __containerLoadingPhysicsTarget?: PhysicsTarget };

const store = createExternalStore<PhysicsTarget | undefined>(undefined);

function readLegacyWindowTarget() {
  if (typeof window === 'undefined') return undefined;
  return (window as PhysicsTargetWindow).__containerLoadingPhysicsTarget;
}

function mirrorLegacyWindowTarget(target: PhysicsTarget | undefined) {
  if (typeof window === 'undefined') return;
  (window as PhysicsTargetWindow).__containerLoadingPhysicsTarget = target;
}

export function publishPhysicsTarget(target: PhysicsTarget) {
  store.setSnapshot(target);
  mirrorLegacyWindowTarget(target);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<PhysicsTarget>(PHYSICS_TARGET_EVENT, { detail: target }));
  }
}

export function clearPhysicsTarget(mode?: PhysicsTarget['mode']) {
  const current = store.getSnapshot() ?? readLegacyWindowTarget();
  if (mode && current?.mode !== mode) return;
  store.setSnapshot(undefined);
  mirrorLegacyWindowTarget(undefined);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<PhysicsTarget | undefined>(PHYSICS_TARGET_EVENT, { detail: undefined }));
  }
}

export function readPhysicsTarget() {
  return store.getSnapshot() ?? readLegacyWindowTarget();
}

export function subscribePhysicsTarget(listener: () => void) {
  return store.subscribe(listener);
}

export function usePhysicsTarget() {
  return store.useSnapshot();
}
