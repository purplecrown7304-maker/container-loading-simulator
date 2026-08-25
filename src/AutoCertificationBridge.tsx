import { useEffect, useRef } from 'react';
import { REQUEST_NEXT_PALLET_CERTIFICATION_EVENT, requestExactCertification } from './autoCertification';
import { PHYSICS_TARGET_EVENT, type PhysicsTarget } from './physicsTarget';

export default function AutoCertificationBridge() {
  const pendingPallet = useRef(false);

  useEffect(() => {
    const onRequestPallet = () => { pendingPallet.current = true; };
    const onTarget = (event: Event) => {
      const target = (event as CustomEvent<PhysicsTarget | undefined>).detail;
      if (!pendingPallet.current || !target || target.mode !== 'pallets' || !target.result.placements.length) return;
      pendingPallet.current = false;
      requestExactCertification(target);
    };
    window.addEventListener(REQUEST_NEXT_PALLET_CERTIFICATION_EVENT, onRequestPallet);
    window.addEventListener(PHYSICS_TARGET_EVENT, onTarget);
    return () => {
      window.removeEventListener(REQUEST_NEXT_PALLET_CERTIFICATION_EVENT, onRequestPallet);
      window.removeEventListener(PHYSICS_TARGET_EVENT, onTarget);
    };
  }, []);

  return null;
}
