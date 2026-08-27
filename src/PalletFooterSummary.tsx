import { useEffect, useState } from 'react';
import type { OptimizedPalletPackingResult } from './engine/palletOptimization';

type PalletSnapshot = { result: OptimizedPalletPackingResult };
type PalletWindow = Window & { __containerLoadingPalletSnapshot?: PalletSnapshot };

const PALLET_SNAPSHOT_UPDATED_EVENT = 'container-loading:pallet-snapshot-updated';

function readSnapshot() {
  if (typeof window === 'undefined') return null;
  return (window as PalletWindow).__containerLoadingPalletSnapshot ?? null;
}

export default function PalletFooterSummary({ active }: { active: boolean }) {
  const [snapshot, setSnapshot] = useState<PalletSnapshot | null>(() => active ? readSnapshot() : null);

  useEffect(() => {
    if (!active) {
      setSnapshot(null);
      return;
    }

    setSnapshot(readSnapshot());
    const onSnapshot = (event: Event) => {
      const next = (event as CustomEvent<PalletSnapshot>).detail;
      setSnapshot(next ?? readSnapshot());
    };
    window.addEventListener(PALLET_SNAPSHOT_UPDATED_EVENT, onSnapshot);
    return () => window.removeEventListener(PALLET_SNAPSHOT_UPDATED_EVENT, onSnapshot);
  }, [active]);

  if (!active || !snapshot) return null;
  const { result } = snapshot;
  return (
    <div className="pallet-footer-summary" aria-label="팔레트 적재 요약">
      <span>팔레트 <b>{result.palletCount}</b></span>
      <span>화물 <b>{result.placements.length} EA</b></span>
      <span>중량 <b>{result.totalPalletizedWeightKg.toFixed(0)} kg</b></span>
      <span>배치 <b>{result.optimization.selectedStackTarget}단 · 바닥 {result.optimization.floorPositions}열</b></span>
    </div>
  );
}
