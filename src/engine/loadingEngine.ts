import { decorateLimitReview, resolveLimitReview, reviewPlacementBlockers } from './limitReview';
import { isARules } from './loadingRuleset';
import { packWithARules, validateAPlan, auditAIdentity } from './loadSimAdapter';
import { fillUnloadingTrenches } from './trenchFilling';
import type { AutoCorrectionRecord, CargoItem, ContainerSpec, LoadingResult, Placement } from './types';
import { auditLoading } from './loadingAudit';
import { validateOperationalLoading } from './operationalValidator';
import { centerPlacementsOnContainer } from './containerCentering';
import { packByHybridOptimizer } from './hybridLoadingOptimizer';
import { readManualOverride } from './manualOverride';
import { containerInputError, preflightCargoInput } from './inputPreflight';
import { completeResidualPacking } from './residualPacking';
import { settleSparseTopLayer } from './topLayerSettling';
import { cargoWithUnloadingPolicy } from './unloadingPolicy';
import { balanceLongitudinalWalls } from './longitudinalBalance';
import { readSecuringMaterialSettings, type SecuringMaterialSettings } from '../securingMaterialSettings';
import { usesHeavyInnerLoading, centerHeavyInnerLaterally, heavyInnerConflictFindings } from './heavyInnerPolicy';
import { boxSecuringCapacity, boxSecuringRequirements, type BoxSecuringLevel } from './securingBudget';
import { gapSecuringPlan } from './gapSecuring';
import { planningContainer } from './constraints';

const AUTO_CORRECTION_EVENT = 'container-loading:auto-corrections';
export const LOADING_RESULT_EVENT = 'container-loading:result';
export const LOADING_STRATEGY_STORAGE_KEY = 'container-loading-strategy';
export type LoadingStrategy = 'capacity' | 'stability' | 'unloading';
export type LoadingOptions = { strategy?: LoadingStrategy; publish?: boolean; securingLevel?: BoxSecuringLevel; securingMaterials?: SecuringMaterialSettings };

type CorrectionWindow = Window & {
  __containerLoadingAutoCorrections?: AutoCorrectionRecord[];
  __containerLoadingLatestResult?: { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
};

function browserStrategy(): LoadingStrategy {
  if (typeof window === 'undefined') return 'capacity';
  const value = window.localStorage?.getItem(LOADING_STRATEGY_STORAGE_KEY);
  return value === 'stability' || value === 'unloading' ? value : 'capacity';
}

function publishCorrections(corrections: AutoCorrectionRecord[]) {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  (window as CorrectionWindow).__containerLoadingAutoCorrections = corrections;
  window.dispatchEvent(new CustomEvent(AUTO_CORRECTION_EVENT, { detail: { corrections } }));
}

export function publishLoadingResult(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult) {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  publishCorrections(result.autoCorrections ?? []);
  const detail = { container, cargo, result };
  (window as CorrectionWindow).__containerLoadingLatestResult = detail;
  window.dispatchEvent(new CustomEvent(LOADING_RESULT_EVENT, { detail }));
}

/** Input changes invalidate the previous layout; packing starts only on an explicit run. */
export function pendingLoadingResult(container: ContainerSpec, cargo: CargoItem[]): LoadingResult {
  const result: LoadingResult = {
    placements: [], remaining: [], loadedWeightKg: 0, usedVolumeM3: 0,
    validationIssues: [], operationalFindings: [], autoCorrections: [],
  };
  publishLoadingResult(container, cargo, result);
  return result;
}

/** Recompute evidence from coordinates, never trust a saved total or old material budget. */
function revalidateRestoredResult(container: ContainerSpec, cargo: CargoItem[], saved: LoadingResult): LoadingResult {
  const loadedWeightKg = saved.placements.reduce((sum, p) => sum + p.weightKg, 0);
  const level = saved.securingBudget?.level ?? 1;
  const materials = readSecuringMaterialSettings();
  const approvedDirectBox = usesHeavyInnerLoading(container, preflightCargoInput(cargo).cargo);
  const countWeightKg = boxSecuringRequirements(saved.placements.length, level, materials).weightKg;
  const voidFillPlan = approvedDirectBox ? gapSecuringPlan(container, saved.placements, materials) : undefined;
  const required = Math.max(countWeightKg, voidFillPlan?.weightKg ?? 0);
  const operationalFindings = [ ...validateOperationalLoading(container, cargo, saved.placements, [], { approvedDirectBox }),
      ...heavyInnerConflictFindings(container, cargo, saved.placements, browserStrategy()) ];
  if (voidFillPlan?.fills.length) operationalFindings.push({ code: 'VOID_FILL_REQUIRED', severity: 'warning' as const, placementIndexes: [], value: voidFillPlan.volumeM3,
    message: `빈 공간 ${voidFillPlan.fills.length}곳(${voidFillPlan.volumeM3.toFixed(2)}m³)에 메움·버팀 계획이 필요합니다. 자재 ${voidFillPlan.weightKg.toFixed(2)}kg, 적용범위 밖 ${voidFillPlan.unresolvedCount}곳. 앱 기본값이며 현장 자재로 확인 필요합니다.` });
  const result: LoadingResult = { ...saved, loadedWeightKg,
    usedVolumeM3: saved.placements.reduce((sum,p)=>sum+p.length*p.width*p.height,0),
    validationIssues: auditLoading(container, container.limitReview === undefined ? cargo : preflightCargoInput(cargo).cargo, saved.placements),
    operationalFindings,
    voidFillPlan,
    securingBudget: { level, reservedWeightKg: required,
      requiredWeightKg: required, totalTransportWeightKg: loadedWeightKg + required },
  };
  if (loadedWeightKg + required > container.maxPayloadKg + 1e-6) result.validationIssues.push({
    type: 'PAYLOAD', message: '화물과 현재 고정재의 합계가 최대 허용중량을 초과합니다. 검토용 배치이며 다시 적재해야 합니다.', placementIndexes: [],
  });
  return decorateLimitReview(container, cargo, result);
}

/** Restore accepted coordinates; a rejected edit leaves the previous plan visible for review. */
export function restoreLoadingResult(container: ContainerSpec, cargo: CargoItem[], previousResult?: LoadingResult): LoadingResult {
  const manual = readManualOverride(container, cargo);
  const restored = manual ? revalidateRestoredResult(container, cargo, manual) : undefined;
  const acceptable = (result: LoadingResult) => container.limitReview !== undefined
    ? reviewPlacementBlockers(container,cargo,result.placements,result.securingBudget?.totalTransportWeightKg).length === 0
    : result.validationIssues.length === 0 && !result.operationalFindings?.some(f=>f.severity==='error');
  if (!restored || !acceptable(restored)) {
    if (previousResult) {
      const previous = revalidateRestoredResult(container, cargo, previousResult);
      const retainStrictReview = container.limitReview === undefined && previousResult.limitReview === undefined && auditLoading(container,cargo,previousResult.placements).length === 0;
      if (acceptable(previous) || retainStrictReview) {
        publishLoadingResult(container, cargo, previous);
        return previous;
      }
    }
    return pendingLoadingResult(container, cargo);
  }
  publishLoadingResult(container, cargo, restored);
  return restored;
}

function averageDepthByPriority(cargo: CargoItem[], placements: Placement[]) {
  const priorities = new Map(
    cargo
      .filter(item => Number.isFinite(item.unloadPriority) && (item.unloadPriority ?? 0) > 0)
      .map(item => [item.id, item.unloadPriority as number]),
  );
  const grouped = new Map<number, number[]>();
  for (const placement of placements) {
    const priority = priorities.get(placement.cargoId);
    if (priority == null) continue;
    const list = grouped.get(priority) ?? [];
    list.push(placement.x + placement.length / 2);
    grouped.set(priority, list);
  }
  return [...grouped.entries()]
    .map(([priority, xs]) => ({ priority, x: xs.reduce((sum, value) => sum + value, 0) / xs.length }))
    .sort((a, b) => a.priority - b.priority);
}

/**
 * The door is the +X end of the container. Higher unloadPriority means later unloading,
 * so those items should sit deeper toward X=0. Some dense packers can produce the exact
 * reverse order while still scoring well on utilization. A whole-plan X reflection keeps
 * every collision/support/stack relation identical while correcting that reversed flow.
 */
function orientForUnloading(container: ContainerSpec, cargo: CargoItem[], placements: Placement[]) {
  const rows = averageDepthByPriority(cargo, placements);
  if (rows.length < 2) return placements;

  let priorityDelta = 0;
  let depthDelta = 0;
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    priorityDelta += current.priority - previous.priority;
    depthDelta += current.x - previous.x;
  }

  // Desired relation is negative: later-unloaded cargo (higher priority) is deeper (smaller X).
  if (priorityDelta <= 0 || depthDelta <= 1e-9) return placements;
  return placements.map(placement => ({
    ...placement,
    x: Math.round((container.length - placement.x - placement.length) * 1_000_000) / 1_000_000,
  }));
}

/** Raw packing under a cargo-only budget. The public wrapper reserves actual securing
 * weight and revalidates against the original equipment. A remains independent;
 * legacy direct boxes use the owner-approved inner-to-door working blocks. */
function loadCargoOnly(container: ContainerSpec, cargo: CargoItem[], options: LoadingOptions = {}): LoadingResult {
  const strategy = options.strategy ?? browserStrategy();
  const shouldPublish = options.publish !== false;
  const preflight = preflightCargoInput(cargo);
  const normalizedCargo = cargoWithUnloadingPolicy(container, preflight.cargo);
  const invalidContainer = containerInputError(container);

  if (invalidContainer) {
    const result: LoadingResult = {
      placements: [],
      remaining: [
        ...preflight.rejected,
        ...normalizedCargo.map((item) => ({ cargoId: item.id, quantity: item.quantity, reason: invalidContainer })),
      ],
      loadedWeightKg: 0,
      usedVolumeM3: 0,
      validationIssues: [],
      operationalFindings: [],
      autoCorrections: [],
    };
    if (shouldPublish) {
      publishLoadingResult(container, normalizedCargo, result);
    }
    return result;
  }

  if (preflight.rejected.length === 0 && shouldPublish && options.strategy === undefined) {
    const manual = readManualOverride(container, normalizedCargo);
    if (manual && auditLoading(container, normalizedCargo, manual.placements).length === 0) {
      const checked = isARules(container) ? { ...manual, operationalFindings: validateOperationalLoading(container, normalizedCargo, manual.placements) } : manual;
      publishLoadingResult(container, normalizedCargo, checked);
      return checked;
    }
  }

  if (isARules(container)) {
    const packed = packWithARules(container, normalizedCargo, strategy);
    // Preserve existing sparse-tier/trench/centering policies; only adopt valid whole plans.
    const completed = settleSparseTopLayer(container, normalizedCargo,
      completeResidualPacking(container, normalizedCargo, packed, strategy), strategy);
    const flattened = strategy === 'unloading' ? fillUnloadingTrenches(container, normalizedCargo, completed.placements) : completed.placements;
    const centered = centerPlacementsOnContainer(container, flattened);
    const candidate = strategy === 'unloading' ? orientForUnloading(container, normalizedCargo, centered) : centered;
    const findings = validateAPlan(container, normalizedCargo, candidate);
    if (!findings.some(f => f.severity === 'error') && candidate.length >= packed.placements.length) {
      packed.placements = candidate;
      packed.remaining = completed.remaining;
      packed.operationalFindings = findings;
      packed.validationIssues = auditAIdentity(container, normalizedCargo, candidate);
      packed.loadedWeightKg = candidate.reduce((sum,p)=>sum+p.weightKg,0);
      packed.usedVolumeM3 = candidate.reduce((sum,p)=>sum+p.length*p.width*p.height,0);
    }
    packed.remaining = [...preflight.rejected, ...packed.remaining];
    if (shouldPublish) publishLoadingResult(container, normalizedCargo, packed);
    return packed;
  }

  // Packers read container.height directly: plan inside the ceiling clearance, audit on the original.
  const planning = planningContainer(container);
  const sequential = usesHeavyInnerLoading(container, normalizedCargo);
  const initial = packByHybridOptimizer(planning, normalizedCargo, strategy);
  // Sequential work fronts cannot be permuted by residual, top-tier or balance passes.
  const packed = sequential ? initial : settleSparseTopLayer(planning, normalizedCargo,
    completeResidualPacking(planning, normalizedCargo, initial, strategy), strategy);
  const flattened = !sequential && strategy === 'unloading' ? fillUnloadingTrenches(planning, normalizedCargo, packed.placements) : packed.placements;
  const centered = sequential ? centerHeavyInnerLaterally(planning, flattened)
    : centerPlacementsOnContainer(planning, balanceLongitudinalWalls(planning, normalizedCargo, flattened));
  const finalPlacements = !sequential && strategy === 'unloading'
    ? orientForUnloading(planning, normalizedCargo, centered) : centered;
  const result: LoadingResult = {
    placements: finalPlacements,
    remaining: [
      ...preflight.rejected,
      ...packed.remaining,
    ],
    loadedWeightKg: packed.loadedWeightKg,
    usedVolumeM3: packed.usedVolumeM3,
    validationIssues: auditLoading(container, normalizedCargo, finalPlacements),
    operationalFindings: validateOperationalLoading(container, normalizedCargo, finalPlacements, [], { approvedDirectBox: sequential }),
    autoCorrections: [],
  };

  if (shouldPublish) {
    publishLoadingResult(container, normalizedCargo, result);
  }
  return result;
}

/** Reserve compulsory transport securing before accepting a direct-box load. The final
 * certification still checks its exact reinforcement level against the original limit. */
function loadStrictContainer(container: ContainerSpec, cargo: CargoItem[], options: LoadingOptions = {}): LoadingResult {
  const level = options.securingLevel ?? 1;
  const materials = options.securingMaterials ?? readSecuringMaterialSettings();
  const preflight = preflightCargoInput(cargo);
  const securedCapacity = boxSecuringCapacity(container, preflight.cargo, level, materials);
  let reserve = 0;
  // Rigid pallet units are handled by their independent pallet/MIXED planner.
  const useBudget = !cargo.some(item => item.unitKind === 'pallet');
  const approvedDirectBox = usesHeavyInnerLoading(container, preflight.cargo);
  const useVoidFill = useBudget && approvedDirectBox;
  const requiredSecuring = (placements: Placement[]) => {
    const countWeightKg = boxSecuringRequirements(placements.length, level, materials).weightKg;
    const voidPlan = useVoidFill ? gapSecuringPlan(container, placements, materials) : undefined;
    return { weightKg: Math.max(countWeightKg, voidPlan?.weightKg ?? 0), voidPlan };
  };

  if (options.publish !== false && options.strategy === undefined) {
    const manual = readManualOverride(container, cargo);
    if (manual) {
      const checked = revalidateRestoredResult(container, cargo, manual);
      if (!checked.validationIssues.length && !checked.operationalFindings?.some(f=>f.severity === 'error')) {
        publishLoadingResult(container, cargo, checked);
        return checked;
      }
    }
  }
  let packed = loadCargoOnly(container, cargo, { ...options, publish: false });
  const initialRemaining = packed.remaining;
  let packingCargo = cargo;
  let clippedCount = false;
  if (useBudget && packed.placements.length > securedCapacity.maxCount) {
    const selected = new Map<string, number>();
    for (const p of packed.placements.slice(0, securedCapacity.maxCount)) selected.set(p.cargoId, (selected.get(p.cargoId) ?? 0) + 1);
    packingCargo = preflight.cargo.map(item => ({ ...item, quantity: selected.get(item.id) ?? 0 }));
    clippedCount = true;
    packed = loadCargoOnly(container, packingCargo, { ...options, publish: false });
  }
  // Recompute from the actual layout, including void-fill. Search iterations are a fixed
  // function of input count; no wall-clock/device-speed cut-off is used.
  if (useBudget && !containerInputError(container)) {
    const requestedCount = preflight.cargo.reduce((sum, item) => sum + Math.max(0, Math.floor(item.quantity)), 0);
    const maxIterations = Math.max(6, Math.ceil(Math.log2(requestedCount + 1)) + 4);
    const feasible: Array<{ packed: LoadingResult; required: number }> = [];
    const seen = new Set<string>();
    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const actual = requiredSecuring(packed.placements);
      const isFeasible = packed.loadedWeightKg + actual.weightKg <= container.maxPayloadKg + 1e-6;
      if (isFeasible) feasible.push({ packed, required: actual.weightKg });
      const signature = `${packed.placements.length}|${actual.weightKg.toFixed(6)}|${reserve.toFixed(6)}`;
      if (seen.has(signature)) break;
      seen.add(signature);
      if (isFeasible && reserve <= actual.weightKg + 1e-9) break;
      const nextReserve = actual.weightKg;
      if (container.maxPayloadKg - nextReserve <= 0) break;
      reserve = nextReserve;
      packed = loadCargoOnly({ ...container, maxPayloadKg: container.maxPayloadKg - reserve }, packingCargo, { ...options, publish: false });
    }
    if (feasible.length) {
      feasible.sort((a, b) => b.packed.placements.length - a.packed.placements.length
        || b.packed.loadedWeightKg - a.packed.loadedWeightKg || a.required - b.required);
      packed = feasible[0].packed;
      reserve = feasible[0].required;
    } else {
      packed = { placements: [], remaining: [...preflight.rejected, ...preflight.cargo.map(c=>({ cargoId:c.id, quantity:c.quantity,
        reason:'필수 고정·메움재를 포함하면 최대 허용중량을 초과합니다.', reasonCode:'PAYLOAD_LIMIT' }))],
        loadedWeightKg:0, usedVolumeM3:0, validationIssues:[], operationalFindings:[], autoCorrections:[] };
      reserve = 0;
    }
  }
  if (clippedCount) {
    const counts = new Map<string, number>();
    for (const p of packed.placements) counts.set(p.cargoId, (counts.get(p.cargoId) ?? 0) + 1);
    packed.remaining = [...preflight.rejected, ...preflight.cargo.flatMap(item => {
      const quantity = item.quantity - (counts.get(item.id) ?? 0);
      const reason = packed.remaining.find(row=>row.cargoId === item.id) ?? initialRemaining.find(row=>row.cargoId === item.id);
      return quantity > 0 ? [{ cargoId:item.id, quantity, reasonCode:reason?.reasonCode ?? 'PAYLOAD_LIMIT',
        reason:reason?.reason ?? '화물과 필수 고정재 합계의 중량 한도를 확보하기 위해 미적재' }] : [];
    })];
  }
  const result: LoadingResult = { ...packed,
    loadedWeightKg: packed.placements.reduce((sum,p)=>sum+p.weightKg,0),
    usedVolumeM3: packed.placements.reduce((sum,p)=>sum+p.length*p.width*p.height,0),
    validationIssues: auditLoading(container, cargoWithUnloadingPolicy(container, preflightCargoInput(cargo).cargo), packed.placements),
    operationalFindings: [
      ...validateOperationalLoading(container, cargo, packed.placements, [], { approvedDirectBox }),
      ...heavyInnerConflictFindings(container, cargo, packed.placements, options.strategy ?? browserStrategy()),
    ],
  };
  if (useBudget) {
    // Securing follows actual voids. The count-based reservation remains a lower bound.
    const actualSecuring = requiredSecuring(result.placements);
    const voidPlan = actualSecuring.voidPlan;
    result.voidFillPlan = voidPlan;
    if (voidPlan?.fills.length) result.operationalFindings!.push({ code: 'VOID_FILL_REQUIRED', severity: 'warning', placementIndexes: [], value: voidPlan.volumeM3,
      message: `빈 공간 ${voidPlan.fills.length}곳(${voidPlan.volumeM3.toFixed(2)}m³)에 메움·버팀 계획이 필요합니다. 자재 ${voidPlan.weightKg.toFixed(2)}kg, 적용범위 밖 ${voidPlan.unresolvedCount}곳. 앱 기본값이며 현장 자재로 확인 필요합니다.` });
    const required = actualSecuring.weightKg;
    result.securingBudget = { level, reservedWeightKg: reserve, requiredWeightKg: required,
      totalTransportWeightKg: result.loadedWeightKg + required };
    result.remaining = result.remaining.map(row => row.reasonCode === 'PAYLOAD_LIMIT'
      ? { ...row, reason: `${row.reason} (필수 고정재 중량 ${required.toFixed(2)}kg 포함)` } : row);
    if (result.securingBudget.totalTransportWeightKg > container.maxPayloadKg + 1e-6) result.validationIssues.push({
      type: 'PAYLOAD', message: '화물과 필수 고정재의 합계가 최대 허용중량을 초과합니다.', placementIndexes: [],
    });
  }
  if (options.publish !== false) publishLoadingResult(container, cargo, result);
  return result;
}

/** Explicit, isolated numerical review. The original equipment and cargo remain immutable. */
export function loadContainer(container: ContainerSpec, cargo: CargoItem[], options: LoadingOptions = {}): LoadingResult {
  if (container.limitReview === undefined) return loadStrictContainer(container,cargo,options);
  const review=resolveLimitReview(container,cargo);
  if (review.status !== 'active') {
    const preflight=preflightCargoInput(cargo);
    const result=decorateLimitReview(container,cargo,{placements:[],remaining:[...preflight.rejected,...preflight.cargo.map(item=>({cargoId:item.id,quantity:item.quantity,reason:review.errors.join(' '),reasonCode:'LIMIT_REVIEW_INVALID'}))],loadedWeightKg:0,usedVolumeM3:0,validationIssues:[],operationalFindings:[],autoCorrections:[]});
    if(options.publish!==false) publishLoadingResult(container,cargo,result);
    return result;
  }
  if(options.publish!==false && options.strategy===undefined) {
    const manual=readManualOverride(container,cargo);
    if(manual) {
      const checked=revalidateRestoredResult(container,cargo,manual);
      if(!reviewPlacementBlockers(container,cargo,checked.placements,checked.securingBudget?.totalTransportWeightKg).length){publishLoadingResult(container,cargo,checked);return checked;}
    }
  }
  let packed=loadStrictContainer(review.container,review.cargo,{...options,publish:false});
  const blockers=reviewPlacementBlockers(container,cargo,packed.placements,packed.securingBudget?.totalTransportWeightKg);
  if(blockers.length) {
    const preflight=preflightCargoInput(cargo);
    packed={placements:[],remaining:[...preflight.rejected,...preflight.cargo.map(item=>({cargoId:item.id,quantity:item.quantity,reason:`WHAT-IF REVIEW 계산 차단: ${blockers.join(' ')}`,reasonCode:'LIMIT_REVIEW_BLOCKED'}))],loadedWeightKg:0,usedVolumeM3:0,validationIssues:[],operationalFindings:[],autoCorrections:[]};
  }
  const result:LoadingResult={...packed,
    validationIssues:auditLoading(container,cargoWithUnloadingPolicy(container,preflightCargoInput(cargo).cargo),packed.placements),
    operationalFindings:[...validateOperationalLoading(container,cargo,packed.placements),...heavyInnerConflictFindings(container,cargo,packed.placements,options.strategy??browserStrategy())],
  };
  if((result.securingBudget?.totalTransportWeightKg??result.loadedWeightKg)>container.maxPayloadKg+1e-6) result.validationIssues.push({type:'PAYLOAD',message:'WHAT-IF REVIEW: 화물과 필수 고정재의 합계가 원래 최대 허용중량을 초과합니다.',placementIndexes:[]});
  if(blockers.length) result.operationalFindings!.push({code:'LIMIT_REVIEW_BLOCKED',severity:'error',message:`WHAT-IF REVIEW 계산 차단: ${blockers.join(' ')}`,placementIndexes:[]});
  const decorated=decorateLimitReview(container,cargo,result);
  if(options.publish!==false) publishLoadingResult(container,cargo,decorated);
  return decorated;
}
