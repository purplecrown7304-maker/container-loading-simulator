import { loadContainer } from '../engine/loadingEngine';
import type { CargoItem, ContainerSpec } from '../engine/types';
import { loadContainerWithLoadSim } from './loadSimEngine';

function counts(rows: Array<{ cargoId: string; quantity: number }>) {
  return Object.fromEntries(rows.map(row => [row.cargoId, row.quantity]));
}

export function compareRuleEngines(container: ContainerSpec, cargo: CargoItem[]) {
  const legacy = loadContainer(container, cargo, { publish: false, ruleEngineMode: 'legacy' });
  const next = loadContainerWithLoadSim(container, cargo);
  return {
    legacy,
    next,
    summary: {
      legacyLoaded: legacy.placements.length,
      nextLoaded: next.placements.length,
      legacyRemaining: counts(legacy.remaining),
      nextRemaining: counts(next.remaining),
      legacyViolations: [...legacy.validationIssues.map(v => v.type), ...(legacy.operationalFindings ?? []).map(v => v.code)],
      nextViolations: [...next.validationIssues.map(v => v.type), ...(next.operationalFindings ?? []).map(v => v.code)],
    },
  };
}
