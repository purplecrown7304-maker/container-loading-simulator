import { decorateLimitReview, resolveLimitReview, reviewPlacementBlockers } from './limitReview';
import { isARules } from './loadingRuleset';
import { packWithARules, validateAPlan, auditAIdentity } from './loadSimAdapter';
import { fillUnloadingTrenches } from './trenchFilling';
import type { AutoCorrectionRecord, CargoItem, ContainerSpec, LoadingResult, Placement, VoidFillPlan } from './types';
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

const AUTO_CORRECTION_EVENT = 'container-loading:auto-corrections';
export const LOADING_RESULT_EVENT = 'container-loading:result';
export const LOADING_STRATEGY_STORAGE_KEY = 'container-loading-strategy';
export type LoadingStrategy = 'capacity' | 'stability' | 'unloading';
export type LoadingOptions = { strategy?: LoadingStrategy; publish?: boolean; securingLevel?: BoxSecuringLevel; securingMaterials?: SecuringMaterialSettings };

type CorrectionWindow = Window & {
  __containerLoadingAutoCorrections?: AutoCorrectionRecord[];
  __containerLoadingLatestResult?: { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
};

function voidFillFor(
  container: ContainerSpec,
  cargo: CargoItem[],
  placements: Placement[],
  materials: SecuringMaterialSettings,
): VoidFillPlan | undefined {
  return usesHeavyInnerLoading(container, cargo) ? gapSecuringPlan(container, placements, materials) : undefined;
}

function addVoidFindings(result: LoadingResult, plan?: VoidFillPlan) {
  if (!plan?.fills.length) return;
  result.operationalFindings ??= [];
  result.operationalFindings.push({
    code: 'VOID_FILL_REQUIRED',
    severity: 'warning',
    placementIndexes: [],
    value: plan.volumeM3,
    message: `빈 공간 ${plan.fills.length}곳(${plan.volumeM3.toFixed(2)}m³)에 메움/버팀이 필요합니다. 계획 중량 ${plan.weightKg.toFixed(2)}kg. ${plan.disclaimer}`,
  });
  if (plan.unresolvedCount > 0) result.operationalFindings.push({
    code: 'VOID_FILL_MATERIAL_OUT_OF_RANGE',
    severity: 'warning',
    placementIndexes: [],
    value: plan.unresolvedCount,
    message: `메움재 적용범위를 벗어난 빈 공간이 ${plan.unresolvedCount}곳 있습니다. 관성 검증에서 해당 자재를 고정 지지물로 처리하지 않습니다. ${plan.disclaimer}`,
  });
}

function securingEvidence(
  container: ContainerSpec,
  cargo: CargoItem[],
  placements: Placement[],
  level: BoxSecuringLevel,
  materials: SecuringMaterialSettings,
) {
  const requiredWeightKg = boxSecuringRequirements(placements.length, level, materials).weightKg;
  const voidFillPlan = voidFillFor(container, cargo, placements, materials);
  const voidFillWeightKg = voidFillPlan?.weightKg ?? 0;
  const transportSecuringWeightKg = Math.max(requiredWeightKg, voidFillWeightKg);
  return { requiredWeightKg, voidFillPlan, voidFillWeightKg, transportSecuringWeightKg };
}

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
  const securing = securingEvidence(container, cargo, saved.placements, level, materials);
  const result: LoadingResult = { ...saved, loadedWeightKg,
    usedVolumeM3: saved.placements.reduce((sum,p)=>sum+p.length*p.width*p.height,0),
    validationIssues: auditLoading(container, container.limitReview === undefined ? cargo : preflightCargoInput(cargo).cargo, saved.placements),
    operationalFindings: [ ...validateOperationalLoading(container, cargo, saved.placements, [], { legacyDirectBox: usesHeavyInnerLoading(container, cargo) }),
      ...heavyInnerConflictFindings(container, cargo, saved.placements, browserStrategy()) ],
    voidFillPlan: securing.voidFillPlan,
    securingBudget: { level, reservedWeightKg: securing.transportSecuringWeightKg,
      requiredWeightKg: securing.requiredWeightKg, voidFillWeightKg: securing.voidFillWeightKg,
      transportSecuringWeightKg: securing.transportSecuringWeightKg,
      totalTransportWeightKg: loadedWeightKg + securing.transportSecuringWeightKg },
  };
  addVoidFindings(result, securing.voidFillPlan);
  if (result.securingBudget!.totalTransportWeightKg > container.maxPayloadKg + 1e-6) result.validationIssues.push({
    type: 'PAYLOAD', message: '화물과 현재 고정·메움재의 합계가 최대 허용중량을 초과합니다. 검토용 배치이며 다시 적재해야 합니다.', placementIndexes: [],
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

  const sequential = usesHeavyInnerLoading(container, normalizedCargo);
  const initial = packByHybridOptimizer(container, normalizedCargo, strategy);
  // Sequential work fronts cannot be permuted by residual, top-tier or balance passes.
  const packed = sequential ? initial : settleSparseTopLayer(container, normalizedCargo,
    completeResidualPacking(container, normalizedCargo, initial, strategy), strategy);
  const flattened = !sequential && strategy === 'unloading' ? fillUnloadingTrenches(container, normalizedCargo, packed.placements) : packed.placements;
  const centered = sequential ? centerHeavyInnerLaterally(container, flattened)
    : centerPlacementsOnContainer(container, balanceLongitudinalWalls(container, normalizedCargo, flattened));
  const finalPlacements = !sequential && strategy === 'unloading'
    ? orientForUnloading(container, normalizedCargo, centered) : centered;
  const result: LoadingResult = {
    placements: finalPlacements,
    remaining: [
      ...preflight.rejected,
      ...packed.remaining,
    ],
    loadedWeightKg: packed.loadedWeightKg,
    usedVolumeM3: packed.usedVolumeM3,
    validationIssues: auditLoading(container, normalizedCargo, finalPlacements),
    operationalFindings: validateOperationalLoading(container, normalizedCargo, finalPlacements, [], { legacyDirectBox: sequential }),
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
  const maximumReserve = securedCapacity.weightKg;
  let reserve = 0;
  // Rigid pallet units are handled by their independent pallet/MIXED planner.
  const useBudget = !cargo.some(item => item.unitKind === 'pallet');

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
  // Compute materials from the actual placed count, not requested/impossible demand.
  // Count clipping and a monotonically increasing material budget prevent staircase loops.
  // Repack only when necessary; later passes can never silently exceed the original limit.
  if (useBudget && !containerInputError(container)) {
    for (;;) {
      const securing = securingEvidence(container, cargo, packed.placements, level, materials);
      const required = securing.transportSecuringWeightKg;
      if (packed.loadedWeightKg + required <= container.maxPayloadKg + 1e-6) { reserve = Math.max(reserve, required); break; }
      const nextReserve = reserve === 0 ? Math.max(Math.min(maximumReserve, required), required) : Math.max(reserve, required);
      if (nextReserve <= reserve + 1e-9 || container.maxPayloadKg - nextReserve <= 0) {
        packed = { placements: [], remaining: [...preflight.rejected, ...preflight.cargo.map(c=>({ cargoId:c.id, quantity:c.quantity,
          reason:'필수 고정·메움재를 포함하면 최대 허용중량을 초과합니다.', reasonCode:'PAYLOAD_LIMIT' }))],
          loadedWeightKg:0, usedVolumeM3:0, validationIssues:[], operationalFindings:[], autoCorrections:[] };
        break;
      }
      reserve = nextReserve;
      packed = loadCargoOnly({ ...container, maxPayloadKg: container.maxPayloadKg - reserve }, packingCargo, { ...options, publish: false });
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
      ...validateOperationalLoading(container, cargo, packed.placements, [], { legacyDirectBox: usesHeavyInnerLoading(container, cargo) }),
      ...heavyInnerConflictFindings(container, cargo, packed.placements, options.strategy ?? browserStrategy()),
    ],
  };
  if (useBudget) {
    const securing = securingEvidence(container, cargo, result.placements, level, materials);
    result.voidFillPlan = securing.voidFillPlan;
    addVoidFindings(result, securing.voidFillPlan);
    result.securingBudget = {
      level,
      reservedWeightKg: Math.max(reserve, securing.transportSecuringWeightKg),
      requiredWeightKg: securing.requiredWeightKg,
      voidFillWeightKg: securing.voidFillWeightKg,
      transportSecuringWeightKg: securing.transportSecuringWeightKg,
      totalTransportWeightKg: result.loadedWeightKg + securing.transportSecuringWeightKg,
    };
    result.remaining = result.remaining.map(row => row.reasonCode === 'PAYLOAD_LIMIT'
      ? { ...row, reason: `${row.reason} (필수 고정·메움재 계획중량 ${securing.transportSecuringWeightKg.toFixed(2)}kg 포함)` } : row);
    if (result.securingBudget.totalTransportWeightKg > container.maxPayloadKg + 1e-6) result.validationIssues.push({
      type: 'PAYLOAD', message: '화물과 필수 고정·메움재의 합계가 최대 허용중량을 초과합니다.', placementIndexes: [],
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
    operationalFindings:[...validateOperationalLoading(container,cargo,packed.placements,[],{legacyDirectBox:usesHeavyInnerLoading(container,cargo)}),...heavyInnerConflictFindings(container,cargo,packed.placements,options.strategy??browserStrategy())],
  };
  if((result.securingBudget?.totalTransportWeightKg??result.loadedWeightKg)>container.maxPayloadKg+1e-6) result.validationIssues.push({type:'PAYLOAD',message:'WHAT-IF REVIEW: 화물과 필수 고정재의 합계가 원래 최대 허용중량을 초과합니다.',placementIndexes:[]});
  if(blockers.length) result.operationalFindings!.push({code:'LIMIT_REVIEW_BLOCKED',severity:'error',message:`WHAT-IF REVIEW 계산 차단: ${blockers.join(' ')}`,placementIndexes:[]});
  const decorated=decorateLimitReview(container,cargo,result);
  if(options.publish!==false) publishLoadingResult(container,cargo,decorated);
  return decorated;
}
