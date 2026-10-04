import { loadContainer, type LoadingStrategy } from './loadingEngine';
import { packOnPallets, type PalletSpec } from './palletOptimization';
import { packMixedMode } from './mixedModePacking';
import { centerPalletPlan } from './palletCentering';
import { validateOperationalLoading } from './operationalValidator';
import { palletSupportBodies } from './palletPlanValidation';
import { toAPlacements } from './loadSimAdapter';
import { centerOfGravity } from './loadSimA/validate';
import type { CargoItem, ContainerSpec } from './types';

export type ForecastInput = { container: ContainerSpec; cargo: CargoItem[]; mode: 'boxes' | 'pallets' | 'mixed'; pallet: PalletSpec };
export type LoadingForecast = { strategy: LoadingStrategy; loaded: number; waiting: number; pallets: number; volumePct: number; cogDeviationMm: number | null; errors: number; warnings: number };

/** A planning estimate only. Never publishes a plan or runs/claims transport certification. */
export function calculateLoadingForecast(input: ForecastInput, strategy: LoadingStrategy): LoadingForecast {
  const { container, cargo, mode, pallet } = input;
  const result = mode === 'boxes' ? loadContainer(container,cargo,{strategy,publish:false})
    : mode === 'mixed' ? packMixedMode(container,cargo,pallet,strategy)
    : centerPalletPlan(packOnPallets(container,cargo,pallet,strategy),container);
  const loads = 'pallets' in result ? result.pallets : [];
  const supports = 'pallets' in result ? palletSupportBodies(result) : [];
  const findings = validateOperationalLoading(container,cargo,result.placements,supports);
  // Use the same orientation-aware offsets as A validation. Add pallet bases
  // separately; unit gross weights would double-count the cartons above them.
  const cg = centerOfGravity([...toAPlacements(cargo,result.placements),...supports.map(s=>({
    item:{id:`base:${s.id}`,type:'pallet' as const,dims:{l:s.length*1000,w:s.width*1000,h:s.height*1000},weight:s.weightKg},
    pos:{x:s.x*1000,y:s.y*1000,z:s.z*1000},orientation:'LWH' as const,
  }))]);
  return { strategy,loaded:result.placements.length,waiting:result.remaining.reduce((sum,r)=>sum+r.quantity,0),pallets:loads.length,
    volumePct:result.placements.reduce((sum,p)=>sum+p.length*p.width*p.height,0)/(container.length*container.width*container.height)*100,
    cogDeviationMm:cg ? Math.hypot(cg.x-container.length*500,cg.y-container.width*500) : null,
    errors:findings.filter(f=>f.severity==='error').length + ('validationIssues' in result ? result.validationIssues.length : 0),
    warnings:findings.filter(f=>f.severity==='warning').length };
}
