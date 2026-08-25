import type { PhysicsTarget } from './physicsTarget';

export const REQUEST_EXACT_CERTIFICATION_EVENT = 'container-loading:request-exact-inertia-certification';
export const REQUEST_NEXT_PALLET_CERTIFICATION_EVENT = 'container-loading:request-next-pallet-inertia-certification';

export function requestExactCertification(target: PhysicsTarget) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<PhysicsTarget>(REQUEST_EXACT_CERTIFICATION_EVENT, { detail: target }));
}

export function requestNextPalletCertification() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(REQUEST_NEXT_PALLET_CERTIFICATION_EVENT));
}
