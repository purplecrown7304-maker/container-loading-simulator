import { requestCertifiedResults } from './inertiaCertification';
import { publishPhysicsTarget, type PhysicsTarget } from './physicsTarget';

export const REQUEST_NEXT_PALLET_CERTIFICATION_EVENT = 'container-loading:request-next-pallet-inertia-certification';

export function requestExactCertification(target: PhysicsTarget) {
  if (typeof window === 'undefined') return;
  publishPhysicsTarget(target);
  requestCertifiedResults({ container: target.container, cargo: target.cargo, result: target.result });
}

export function requestNextPalletCertification() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(REQUEST_NEXT_PALLET_CERTIFICATION_EVENT));
}
