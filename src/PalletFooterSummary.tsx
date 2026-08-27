import { usePalletSnapshot } from './palletSnapshotStore';

export default function PalletFooterSummary({ active }: { active: boolean }) {
  const snapshot = usePalletSnapshot();
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
