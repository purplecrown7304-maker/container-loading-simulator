import type { OptimizedPalletPackingResult, PalletSpec } from './engine/palletOptimization';
import { palletResultToLoadingResult } from './engine/palletContainerPlacement';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { validateExistingWithLoadSim } from './rule-engine/loadSimEngine';

export type PalletWorkOrderSnapshot = { spec: PalletSpec; result: OptimizedPalletPackingResult };

/** A's exact input/final validation is the only loading-output authority. */
export function boxWorkOrderHardBlockers(container: ContainerSpec, result: LoadingResult, cargo?: CargoItem[]): string[] {
  const blockers = result.validationIssues.map(issue => issue.message);
  blockers.push(...(result.operationalFindings ?? []).filter(finding => finding.severity === 'error').map(finding => finding.message));
  if (result.ruleEngine !== 'load-sim') blockers.push('A 적재 방식으로 다시 계산해야 합니다.');
  if (!result.placements.length) blockers.push('적재된 화물이 없습니다.');
  const input = result.ruleEngineInput;
  if (input || cargo) {
    const checked = validateExistingWithLoadSim(container, input?.cargo ?? cargo!, input?.placements ?? result.placements);
    blockers.push(...checked.validationIssues.map(issue => issue.message));
  }
  return [...new Set(blockers)];
}

export function palletWorkOrderHardBlockers(container: ContainerSpec, snapshot: PalletWorkOrderSnapshot): string[] {
  return boxWorkOrderHardBlockers(container, palletResultToLoadingResult(snapshot.result, snapshot.spec));
}
