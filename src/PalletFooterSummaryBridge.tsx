import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { OptimizedPalletPackingResult } from './engine/palletOptimization';
import { PHYSICS_TARGET_EVENT, type PhysicsTarget } from './physicsTarget';

type PalletSnapshot = { result: OptimizedPalletPackingResult };
type PalletWindow = Window & { __containerLoadingPalletSnapshot?: PalletSnapshot };

const PALLET_SNAPSHOT_UPDATED_EVENT = 'container-loading:pallet-snapshot-updated';

export default function PalletFooterSummaryBridge() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [snapshot, setSnapshot] = useState<PalletSnapshot | null>(null);

  useEffect(() => {
    const readSnapshot = () => (window as PalletWindow).__containerLoadingPalletSnapshot ?? null;
    const findHost = () => setHost(document.querySelector<HTMLElement>('.viewer-bottom-actions'));
    const sync = () => setSnapshot(readSnapshot());

    const onSnapshot = (event: Event) => {
      const next = (event as CustomEvent<PalletSnapshot>).detail;
      setSnapshot(next ?? readSnapshot());
      findHost();
    };
    const onPhysicsTarget = (event: Event) => {
      const target = (event as CustomEvent<PhysicsTarget | undefined>).detail;
      if (target?.mode === 'pallets') sync();
      else setSnapshot(null);
      findHost();
    };

    window.addEventListener(PALLET_SNAPSHOT_UPDATED_EVENT, onSnapshot);
    window.addEventListener(PHYSICS_TARGET_EVENT, onPhysicsTarget);
    const timer = window.setTimeout(() => {
      findHost();
      sync();
    }, 0);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(PALLET_SNAPSHOT_UPDATED_EVENT, onSnapshot);
      window.removeEventListener(PHYSICS_TARGET_EVENT, onPhysicsTarget);
    };
  }, []);

  useEffect(() => {
    if (!host) return;
    host.classList.toggle('pallet-summary-active', Boolean(snapshot));
    return () => host.classList.remove('pallet-summary-active');
  }, [host, snapshot]);

  if (!host || !snapshot) return null;

  const { result } = snapshot;
  return createPortal(
    <div className="pallet-footer-summary" aria-label="팔레트 적재 요약">
      <span>팔레트 <b>{result.palletCount}</b></span>
      <span>화물 <b>{result.placements.length} EA</b></span>
      <span>중량 <b>{result.totalPalletizedWeightKg.toFixed(0)} kg</b></span>
      <span>배치 <b>{result.optimization.selectedStackTarget}단 · 바닥 {result.optimization.floorPositions}열</b></span>
    </div>,
    host,
  );
}
