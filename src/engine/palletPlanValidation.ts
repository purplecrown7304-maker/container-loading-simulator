import type { PalletPackingResult, PalletSpec } from './palletPacking';
import type { ContainerSpec, OperationalRuleFinding } from './types';

/** Shared pallet bodies for final static checks and STEP04 estimates. */
export function palletSupportBodies(result: PalletPackingResult) {
  return result.pallets.map(s=>({ id:String(s.palletIndex), x:s.x,y:s.y,z:s.z,length:s.length,width:s.width,height:s.height,
    weightKg:s.totalWeightKg-s.cargoWeightKg,unitCenterOfGravity:s.centerOfGravity,
    unitHeightM:Math.max(s.height,...s.cargoPlacements.map(p=>p.z+p.height-s.z))+s.packagingExtraHeightM }));
}

/** LOADING_RULES R-9 default. `PalletSpec.minBottomLayerCoverageRatio` overrides it. */
export const DEFAULT_PALLET_BOTTOM_COVERAGE_RATIO = 0.9;
export const PALLET_ADVISORY_CODES = ['PALLET_DECK_COVERAGE', 'WRAP_RECOMMENDED'] as const;
const EPS = 1e-6;

/**
 * LOADING_RULES R-9 (owner decision 2026-10-08). Warnings only: they never add a pallet, move a
 * carton or change PASS. Rule #97 (top tier ≥ 50%) and pallet-count minimisation are untouched.
 * The final mixed tail pallet is exempt from coverage, as it is from rule #97.
 */
export function palletAdvisoryFindings(
  container: Pick<ContainerSpec, 'palletDestination'>,
  result: Pick<PalletPackingResult, 'pallets'>,
  spec?: Pick<PalletSpec, 'minBottomLayerCoverageRatio'>,
): OperationalRuleFinding[] {
  const out: OperationalRuleFinding[] = [];
  const configured = spec?.minBottomLayerCoverageRatio;
  const limit = configured !== undefined && Number.isFinite(configured) && configured > 0 && configured <= 1
    ? configured : DEFAULT_PALLET_BOTTOM_COVERAGE_RATIO;
  const loaded = result.pallets.filter(pallet => pallet.cargoPlacements.length > 0);

  const sparse: Array<{ index: number; ratio: number }> = [];
  for (const pallet of loaded) {
    if (pallet.isMixedTail) continue;
    const deckTop = Math.min(...pallet.cargoPlacements.map(p => p.z));
    const area = pallet.cargoPlacements.filter(p => p.z <= deckTop + EPS).reduce((sum, p) => {
      const dx = Math.max(0, Math.min(p.x + p.length, pallet.x + pallet.length) - Math.max(p.x, pallet.x));
      const dy = Math.max(0, Math.min(p.y + p.width, pallet.y + pallet.width) - Math.max(p.y, pallet.y));
      return sum + dx * dy;
    }, 0);
    const ratio = area / Math.max(EPS, pallet.length * pallet.width);
    if (ratio + EPS < limit) sparse.push({ index: pallet.palletIndex, ratio });
  }
  if (sparse.length) {
    const worst = sparse.reduce((a, b) => (b.ratio < a.ratio ? b : a));
    out.push({
      code: 'PALLET_DECK_COVERAGE', severity: 'warning', placementIndexes: [], value: worst.ratio, limit,
      message: `파렛트 ${sparse.length}개(번호 ${sparse.map(row => row.index).sort((a, b) => a - b).join(', ')})의 바닥 단이 파렛트 면적의 ${(limit * 100).toFixed(0)}% 미만입니다. 최저 ${(worst.ratio * 100).toFixed(0)}%. 파렛트 사이 틈과 흔들림을 확인하세요.`,
    });
  }

  const exportLoad = container.palletDestination?.transport === 'export';
  const stackedColumns = new Set(loaded.filter(pallet => pallet.stackLevel > 1).map(pallet => pallet.stackColumn));
  const unwrapped = loaded.filter(pallet => !pallet.wrappingUsed && (exportLoad || stackedColumns.has(pallet.stackColumn)));
  if (unwrapped.length) {
    const reason = exportLoad && stackedColumns.size ? '수출·2단 적재' : exportLoad ? '수출' : '2단 적재';
    out.push({
      code: 'WRAP_RECOMMENDED', severity: 'warning', placementIndexes: [], value: unwrapped.length,
      message: `${reason}인데 랩핑이 꺼진 파렛트가 ${unwrapped.length}개 있습니다(번호 ${unwrapped.map(pallet => pallet.palletIndex).sort((a, b) => a - b).join(', ')}). 랩핑 사용을 권고합니다.`,
    });
  }
  return out;
}
