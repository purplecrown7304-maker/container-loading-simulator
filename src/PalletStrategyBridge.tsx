import { useEffect } from 'react';
import { applyPalletStrategyToResult } from './engine/palletStrategy';
import { setNextPalletCenteredResultOverride } from './engine/palletCentering';
import type { OptimizedPalletPackingResult, PalletSpec } from './engine/palletOptimization';
import { LOADING_STRATEGY_SELECTION_EVENT } from './engine/loadingStrategy';
import { readPhysicsTarget } from './physicsTarget';

const PALLET_SPEC_FROM_RESULTS_EVENT = 'container-loading:pallet-spec-from-results';
const PALLET_SNAPSHOT_UPDATED_EVENT = 'container-loading:pallet-snapshot-updated';

type PalletSnapshot = { spec: PalletSpec; result: OptimizedPalletPackingResult };
type PalletWindow = Window & { __containerLoadingPalletSnapshot?: PalletSnapshot };

function signature(result: OptimizedPalletPackingResult) {
  return result.pallets
    .map(item => [item.stackColumn, item.stackLevel, item.x.toFixed(5), item.y.toFixed(5), item.z.toFixed(5), item.totalWeightKg.toFixed(3)].join(':'))
    .sort()
    .join('|');
}

export default function PalletStrategyBridge() {
  useEffect(() => {
    let timer = 0;
    let applying = false;

    const apply = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const snapshot = (window as PalletWindow).__containerLoadingPalletSnapshot;
        const target = readPhysicsTarget();
        if (!snapshot || !target || target.mode !== 'pallets') return;
        const next = applyPalletStrategyToResult(snapshot.result, target.container, target.cargo, snapshot.spec);
        if (signature(next) === signature(snapshot.result)) {
          applying = false;
          return;
        }
        applying = true;
        setNextPalletCenteredResultOverride(next);
        window.dispatchEvent(new CustomEvent<PalletSpec>(PALLET_SPEC_FROM_RESULTS_EVENT, { detail: snapshot.spec }));
      }, 0);
    };

    const onSnapshot = () => {
      if (applying) {
        applying = false;
        return;
      }
      apply();
    };
    const onStrategy = () => apply();

    window.addEventListener(PALLET_SNAPSHOT_UPDATED_EVENT, onSnapshot);
    window.addEventListener(LOADING_STRATEGY_SELECTION_EVENT, onStrategy);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(PALLET_SNAPSHOT_UPDATED_EVENT, onSnapshot);
      window.removeEventListener(LOADING_STRATEGY_SELECTION_EVENT, onStrategy);
    };
  }, []);

  return null;
}
