import { requestCertifiedResults } from './inertiaCertification';
import { publishPhysicsTarget, readPhysicsTarget, subscribePhysicsTarget, type PhysicsTarget } from './physicsTarget';

let pendingPalletCertification = false;

subscribePhysicsTarget(() => {
  if (!pendingPalletCertification) return;
  const target = readPhysicsTarget();
  if (!target || target.mode !== 'pallets' || !target.result.placements.length) return;
  pendingPalletCertification = false;
  requestCertifiedResults({ container: target.container, cargo: target.cargo, result: target.result });
});

export function requestExactCertification(target: PhysicsTarget) {
  if (typeof window === 'undefined') return;
  publishPhysicsTarget(target);
  requestCertifiedResults({ container: target.container, cargo: target.cargo, result: target.result });
}

export function requestNextPalletCertification() {
  pendingPalletCertification = true;
}
