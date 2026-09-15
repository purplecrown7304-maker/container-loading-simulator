import { usePalletSnapshot } from './palletSnapshotStore';

export default function PalletFooterSummary({ active }: { active: boolean }) {
  const snapshot = usePalletSnapshot();
  if (!active || !snapshot) return null;
  const { result } = snapshot;
  return (
    <div className="pallet-footer-summary" aria-label="팔레트 적재 요약">
      <span>팔레트 <b>요청 {result.requestedPalletCount} · 적재 {result.loadedPalletCount} · 미적재 {result.unloadedPalletCount}</b></span>
      <span>박스 <b>요청 {result.requestedBoxCount} · 적재 {result.loadedBoxCount} · 미적재 {result.unloadedBoxCount}</b></span>
      <span>중량 <b>{result.totalPalletizedWeightKg.toFixed(0)} kg</b></span>
      <span>배치 <b>{result.optimization.selectedStackTarget}단 · 바닥 {result.optimization.floorPositions}열</b></span>
    </div>
  );
}
