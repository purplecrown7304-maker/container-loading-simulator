import { uiText, useUiLanguage } from './uiLanguage';
import { usePalletSnapshot } from './palletSnapshotStore';

export default function PalletFooterSummary({ active }: { active: boolean }) {
  useUiLanguage();
  const snapshot = usePalletSnapshot();
  if (!active || !snapshot) return null;
  const { result } = snapshot;
  return (
    <div className="pallet-footer-summary" aria-label={uiText("팔레트 적재 요약")}>
      <span>{uiText("팔레트")}{' '}<b>{result.palletCount}</b></span>
      <span>{uiText("화물")}{' '}<b>{result.placements.length} EA</b></span>
      <span>{uiText("중량")}{' '}<b>{result.totalPalletizedWeightKg.toFixed(0)} kg</b></span>
      <span>{uiText("배치")}{' '}<b>{uiText("{0}단 · 바닥 {1}열", [result.optimization.selectedStackTarget, result.optimization.floorPositions])}</b></span>
    </div>
  );
}
