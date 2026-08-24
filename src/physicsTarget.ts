import type { PhysicsSupport } from './engine/physicsValidation';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';

export const PHYSICS_TARGET_EVENT = 'container-loading:physics-target';

export type PhysicsTarget = {
  mode: 'boxes' | 'pallets';
  container: ContainerSpec;
  cargo: CargoItem[];
  result: LoadingResult;
  supports?: PhysicsSupport[];
};

type PhysicsTargetWindow = Window & { __containerLoadingPhysicsTarget?: PhysicsTarget };

export function publishPhysicsTarget(target: PhysicsTarget) {
  if (typeof window === 'undefined') return;
  (window as PhysicsTargetWindow).__containerLoadingPhysicsTarget = target;
  window.dispatchEvent(new CustomEvent<PhysicsTarget>(PHYSICS_TARGET_EVENT, { detail: target }));
}

export function clearPhysicsTarget(mode?: PhysicsTarget['mode']) {
  if (typeof window === 'undefined') return;
  const current = (window as PhysicsTargetWindow).__containerLoadingPhysicsTarget;
  if (mode && current?.mode !== mode) return;
  (window as PhysicsTargetWindow).__containerLoadingPhysicsTarget = undefined;
  window.dispatchEvent(new CustomEvent<PhysicsTarget | undefined>(PHYSICS_TARGET_EVENT, { detail: undefined }));
}

export function readPhysicsTarget() {
  if (typeof window === 'undefined') return undefined;
  return (window as PhysicsTargetWindow).__containerLoadingPhysicsTarget;
}
