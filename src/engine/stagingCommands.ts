import type { StagingUnit } from '../stagingInventory';
import { defaultSecuringMaterialSettings, type SecuringMaterialSettings } from '../securingMaterialSettings';
import { buildSecuringUsage } from '../inertiaCertification';
import { nextSpaces, type Space } from './blockSpaceBeamPackerV2';
import { isInsideContainer, overlaps, usableHeight, validatePlacements } from './constraints';
import { containerInputError, preflightCargoInput } from './inputPreflight';
import { resolveLimitReview, reviewPlacementBlockers } from './limitReview';
import { aCandidateAllowed, auditAIdentity } from './loadSimAdapter';
import { isARules } from './loadingRuleset';
import type { LoadingStrategy } from './loadingEngine';
import { MANUAL_MOVE_VERDICT_CODES, manualEditRegressionReasons, manualMoveBalanceCautions, recomputeManualEditResult } from './manualEditPolicy';
import { snapManualCoordinate, supportsOtherPlacement } from './manualPlacement';
import { validateOperationalLoading } from './operationalValidator';
import { canSupportUpper, hasPalletFootprintSupport, type PalletLoad, type PalletSpec } from './palletPacking';
import type { OptimizedPalletPackingResult } from './palletOptimization';
import type { MixedModePackingResult } from './mixedModePacking';
import { palletAdvisoryFindings, palletSupportBodies } from './palletPlanValidation';
import { hasAdequateSupport, supportContactArea } from './support';
import { canPlaceByStackingRules } from './stacking';
import type { CargoItem, ContainerSpec, LoadingResult, Placement } from './types';

export type StagingPosition = { x: number; y: number; z: number };
export type StagingCommandContext = {
  container: ContainerSpec;
  cargo: CargoItem[];
  result: LoadingResult;
  pallets?: PalletLoad[];
  palletSpec?: PalletSpec;
  mode?: 'boxes' | 'pallets' | 'mixed';
  materials?: SecuringMaterialSettings;
  securingLevel?: 1 | 2 | 3;
  strategy?: LoadingStrategy;
  /** Cargo allocated to other vehicles is neither available nor current-vehicle remaining. */
  assignedElsewhere?: Array<{ id: string; cargoId: string }>;
};
export type StagingCommandAssessment = {
  valid: boolean;
  reasons: string[];
  /** For an accepted command only: centre-of-gravity errors it leaves on the plan. They do
   * not refuse it; the plan cannot pass verification or be dispatched while they stand. */
  cautions: string[];
  unitId: string;
  candidate?: Placement;
  result: LoadingResult;
  pallets: PalletLoad[];
  changed: boolean;
  invalidateVerification: boolean;
  /** Coordinates, quantity and membership only. Never restores an old certification. */
  previous: { result: LoadingResult; pallets: PalletLoad[] };
};
const EPS = 1e-6;
const volume = (p: Placement) => p.length * p.width * p.height;
const same = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= EPS;
const unitHeight = (load: PalletLoad) => Math.max(load.height, ...load.cargoPlacements.map(p => p.z + p.height - load.z)) + load.packagingExtraHeightM;
const envelope = (load: PalletLoad): Placement => ({ cargoId: `PALLET-${load.palletIndex}`, x: load.x, y: load.y, z: load.z, length: load.length, width: load.width, height: unitHeight(load), weightKg: load.totalWeightKg });
const strategy = (context: StagingCommandContext) => context.strategy === 'unloading' || (!context.strategy && context.result.operationalFindings?.some(f => f.code === 'HEAVY_INNER_UNLOAD_CONFLICT')) ? 'unloading' as const : 'capacity' as const;
const owned = (load: PalletLoad, p: Placement) => load.cargoPlacements.some(q => q === p || (q.unitId && q.unitId === p.unitId));

function outcome(context: StagingCommandContext, unit: Pick<StagingUnit, 'id'>, reasons: string[], candidate?: Placement, result = context.result, pallets = context.pallets ?? [], cautions: string[] = []): StagingCommandAssessment {
  const valid = reasons.length === 0;
  return { valid, reasons: [...new Set(reasons)], cautions: valid ? [...new Set(cautions)] : [], unitId: unit.id, candidate,
    result: valid ? result : context.result, pallets: valid ? pallets : context.pallets ?? [],
    changed: valid && result !== context.result, invalidateVerification: valid && result !== context.result,
    previous: { result: context.result, pallets: context.pallets ?? [] } };
}

function inputReasons(context: StagingCommandContext, unit: StagingUnit) {
  const reasons: string[] = [];
  const badContainer = containerInputError(context.container);
  if (badContainer) reasons.push(badContainer);
  if (unit.location === 'other-vehicle') reasons.push('다른 차량에 배치된 화물은 현재 차량으로 옮길 수 없습니다.');
  if (unit.verdict === 'error') reasons.push('입력 또는 포장 오류를 먼저 해결하세요.');
  if (unit.requiresPackaging && unit.kind !== 'pallet') reasons.push('포장 계획 완료 후 상차할 수 있습니다.');
  if (!unit.boxUnits.length || new Set(unit.boxUnits.map(p => p.id)).size !== unit.boxUnits.length) reasons.push('화물 개체 식별 정보가 유효하지 않습니다.');
  const preflight = preflightCargoInput(context.cargo);
  const byId = new Map(preflight.cargo.map(item => [item.id, item]));
  for (const box of unit.boxUnits) if (!byId.has(box.cargoId)) reasons.push(`유효한 품목 정보를 찾을 수 없습니다: ${box.cargoId}`);
  if (context.container.limitReview !== undefined && (unit.kind === 'pallet' || (context.pallets?.length ?? 0) > 0 || (context.mode && context.mode !== 'boxes'))) reasons.push('WHAT-IF REVIEW는 legacy 직접 박스 적재만 지원합니다. A·팔레트·MIXED는 엄격 모드로 전환하세요.');
  const review = resolveLimitReview(context.container, context.cargo);
  if (review.status === 'invalid' || review.status === 'unsupported') reasons.push(...review.errors);
  return reasons;
}

function quantityReasons(context: StagingCommandContext, placements: Placement[]) {
  const reasons: string[] = [];
  const counts = new Map<string, number>();
  const ids = new Set<string>();
  for (const p of [...placements, ...(context.assignedElsewhere ?? []).map(p => ({ cargoId: p.cargoId, unitId: p.id }))]) {
    counts.set(p.cargoId, (counts.get(p.cargoId) ?? 0) + 1);
    if (p.unitId) {
      if (ids.has(p.unitId)) reasons.push('같은 화물 개체가 중복 배치되어 있습니다.');
      ids.add(p.unitId);
    }
  }
  const byId = new Map(preflightCargoInput(context.cargo).cargo.map(item => [item.id, item]));
  for (const [id, count] of counts) if (count > (byId.get(id)?.quantity ?? 0)) reasons.push(`화물 ${id}의 등록 수량을 초과했습니다.`);
  reasons.push(...auditAIdentity(context.container, context.cargo, placements).filter(issue => issue.type === 'INVALID_CARGO' || issue.type === 'QUANTITY').map(issue => issue.message));
  if (!isARules(context.container)) for (const p of placements) {
    const item = byId.get(p.cargoId);
    if (item && (!same(p.height, item.height) || !(p.rotated ? same(p.length, item.width) && same(p.width, item.length) : same(p.length, item.length) && same(p.width, item.width)))) reasons.push('등록 화물의 규격·회전 허용·중량과 배치가 일치하지 않습니다.');
  }
  return reasons;
}

function remainingRows(context: StagingCommandContext, placements: Placement[], withdrawn: boolean): LoadingResult['remaining'] {
  const active = preflightCargoInput(context.cargo);
  const byId = new Map(active.cargo.map(item => [item.id, item]));
  const rows = context.result.remaining.filter(row => !byId.has(row.cargoId)).map(row => ({ ...row }));
  for (const item of active.cargo) {
    let count = item.quantity - placements.filter(p => p.cargoId === item.id).length - (context.assignedElsewhere ?? []).filter(p => p.cargoId === item.id).length;
    for (const row of context.result.remaining.filter(row => row.cargoId === item.id)) {
      const quantity = Math.min(count, Math.max(0, row.quantity));
      if (quantity > 0) rows.push({ ...row, quantity });
      count -= quantity;
    }
    if (count > 0) rows.push({ cargoId: item.id, quantity: count,
      reason: withdrawn ? '대기장으로 회수한 화물입니다.' : '아직 차량에 배치하지 않은 대기 화물입니다.',
      reasonCode: withdrawn ? 'STAGING_WITHDRAWN' : 'STAGING_PENDING' });
  }
  return rows;
}

function evidence(context: StagingCommandContext, placements: Placement[], pallets: PalletLoad[], withdrawn = false): LoadingResult {
  const level = Math.max(context.securingLevel ?? 1, context.result.securingBudget?.level ?? 1) as 1 | 2 | 3;
  const materials = context.materials ?? defaultSecuringMaterialSettings;
  if (!pallets.length && (!context.mode || context.mode === 'boxes')) {
    const result = recomputeManualEditResult(context.container, context.cargo, { ...context.result, securingBudget: { level, reservedWeightKg: context.result.securingBudget?.reservedWeightKg ?? 0, requiredWeightKg: 0, totalTransportWeightKg: 0 } }, placements, strategy(context), materials);
    return { ...result, usedVolumeM3: placements.reduce((n, p) => n + volume(p), 0), remaining: remainingRows(context, placements, withdrawn) };
  }
  const supports = palletSupportBodies({ pallets } as import('./palletPacking').PalletPackingResult);
  const loadedWeightKg = placements.reduce((n, p) => n + p.weightKg, 0) + supports.reduce((n, p) => n + p.weightKg, 0);
  const result: LoadingResult = { ...context.result, placements, remaining: remainingRows(context, placements, withdrawn),
    loadedWeightKg, usedVolumeM3: placements.reduce((n, p) => n + volume(p), 0),
    validationIssues: validatePlacements(context.container, placements),
    operationalFindings: [...validateOperationalLoading(context.container, context.cargo, placements, supports), ...palletAdvisoryFindings(context.container, { pallets }, context.palletSpec)],
    voidFillPlan: undefined };
  const usage = buildSecuringUsage({ mode: 'pallets', container: context.container, cargo: context.cargo, result, supports }, level, materials);
  const requiredWeightKg = usage.estimatedAddedWeightKg;
  result.securingBudget = { level, reservedWeightKg: Math.max(context.result.securingBudget?.reservedWeightKg ?? 0, requiredWeightKg), requiredWeightKg, totalTransportWeightKg: loadedWeightKg + requiredWeightKg };
  if (loadedWeightKg + requiredWeightKg > context.container.maxPayloadKg + EPS) result.validationIssues.push({ type: 'PAYLOAD', message: '화물과 필수 고정·메움재 합계가 원래 허용 적재 중량을 초과합니다.', placementIndexes: [] });
  return result;
}

/** Owner decision 2026-11-19: under the legacy rules a move made by hand is not refused
 * for the vehicle's centre of gravity; that error is a verdict the plan then carries.
 * A-rules and the numerical WHAT-IF review keep their own handling. */
const balanceIsVerdict = (context: StagingCommandContext) => !isARules(context.container) && context.container.limitReview === undefined;
const cautionText = (finding: { code: string; message: string }) => `무게중심 기준을 벗어납니다. 이 오류가 해소될 때까지 운송 검증과 출고는 통과할 수 없습니다: ${finding.code} · ${finding.message}`;

/** `strictBalance` is for a position the program itself proposes: it should not choose a
 * place that puts the centre of gravity out of range when another place does not. */
function regressionReasons(context: StagingCommandContext, result: LoadingResult, pallets: PalletLoad[], strictBalance = false) {
  const before = evidence(context, context.result.placements, context.pallets ?? []);
  // Removal changes flat array indexes. Compare the same surviving physical objects.
  const remap = (indexes: number[]) => indexes.flatMap(index => {
    const old = before.placements[index];
    const next = result.placements.findIndex(p => p === old || Boolean(old?.unitId && p.unitId === old.unitId));
    return next < 0 ? [] : [next];
  });
  const aligned = { ...before, validationIssues: before.validationIssues.map(f => ({ ...f, placementIndexes: remap(f.placementIndexes) })), operationalFindings: before.operationalFindings?.map(f => ({ ...f, placementIndexes: remap(f.placementIndexes) })) };
  const verdict = balanceIsVerdict(context) && !strictBalance;
  const reasons = manualEditRegressionReasons(aligned, result, { balanceIsVerdict: verdict });
  const cautions = verdict ? manualMoveBalanceCautions(aligned, result).map(cautionText) : [];
  if (context.container.limitReview === undefined) return { reasons, cautions };
  return { reasons: [...reviewPlacementBlockers(context.container, context.cargo, result.placements, result.securingBudget?.totalTransportWeightKg), ...reasons.filter(reason => reason.includes('기존 운영 오류'))], cautions };
}

function palletReasons(context: StagingCommandContext, pallets: PalletLoad[]) {
  const reasons: string[] = [];
  const spec = context.palletSpec;
  if (!spec) return ['파렛트 규격 정보를 찾을 수 없습니다.'];
  const cargoMap = new Map(preflightCargoInput(context.cargo).cargo.map(item => [item.id, item]));
  for (const load of pallets) {
    if (![load.x, load.y, load.z, load.length, load.width, load.height, load.totalWeightKg, load.cargoWeightKg, load.packagingWeightKg, load.packagingExtraHeightM, load.centerOfGravity.x, load.centerOfGravity.y, load.centerOfGravity.z].every(Number.isFinite)
      || Math.min(load.length, load.width, load.height, load.totalWeightKg) <= 0 || Math.min(load.packagingWeightKg, load.packagingExtraHeightM) < 0) reasons.push('파렛트 규격·포장·중량 정보가 유효하지 않습니다.');
    if (!same(load.length, spec.length) || !same(load.width, spec.width) || !same(load.height, spec.height)) reasons.push('파렛트 받침 규격이 현재 선택한 규격과 일치하지 않습니다.');
    const packagingWeight = (load.cornerGuardsUsed ? spec.cornerGuardWeightKg : 0) + (load.wrappingUsed ? spec.wrappingWeightKg : 0);
    const packagingHeight = (load.cornerGuardsUsed ? spec.cornerGuardExtraHeightM : 0) + (load.wrappingUsed ? spec.wrappingExtraHeightM : 0);
    if ((load.cornerGuardsUsed && !spec.useCornerGuards) || (load.wrappingUsed && !spec.useWrapping) || !same(load.packagingWeightKg, packagingWeight) || !same(load.packagingExtraHeightM, packagingHeight)) reasons.push('파렛트 포장 구성과 현재 포장 설정이 일치하지 않습니다.');
    if (!Number.isInteger(load.stackLevel) || load.stackLevel < 1 || load.stackLevel > spec.maxStackLevels) reasons.push('파렛트 최대 적층단 조건을 만족하지 않습니다.');
    if (!isInsideContainer(context.container, envelope(load))) reasons.push('파렛트와 포장재가 차량 경계를 벗어납니다.');
    const weight = load.cargoPlacements.reduce((n, p) => n + p.weightKg, 0);
    if (!same(weight, load.cargoWeightKg) || !same(load.totalWeightKg, weight + spec.tareWeightKg + load.packagingWeightKg)) reasons.push('파렛트 구성 중량과 전체 중량이 일치하지 않습니다.');
    if (weight > spec.maxLoadKg + EPS) reasons.push('파렛트 최대 적재중량을 초과합니다.');
    if (load.cargoPlacements.some(p => p.x < load.x - EPS || p.y < load.y - EPS || p.x + p.length > load.x + load.length + EPS || p.y + p.width > load.y + load.width + EPS || p.z < load.z + load.height - EPS)) reasons.push('파렛트 화물이 받침의 허용 범위를 벗어납니다.');
    const above = pallets.filter(p => p !== load && p.z >= load.z + unitHeight(load) - .001 && Math.min(p.x + p.length, load.x + load.length) > Math.max(p.x, load.x) + EPS && Math.min(p.y + p.width, load.y + load.width) > Math.max(p.y, load.y) + EPS);
    if (above.length) {
      if (above.length + 1 > spec.maxStackLevels || !Number.isFinite(spec.maxStaticLoadKg) || !canSupportUpper(load, above.reduce((n, p) => n + p.totalWeightKg, 0), cargoMap, spec)) reasons.push('파렛트 최대 적층단·정하중 또는 하부 화물 상부하중 조건을 만족하지 않습니다.');
    }
  }
  return reasons;
}

/** No command writes stores, publishes events or changes the original input/plan. */
export function assessStagingAddition(context: StagingCommandContext, unit: StagingUnit, target: StagingPosition, rotate = false, options: { strictBalance?: boolean } = {}): StagingCommandAssessment {
  return assessAddition(context, unit, target, rotate, context, options.strictBalance === true);
}

/** Relocation evaluates the final plan against its original accepted baseline,
 * never against the temporary state with the moving unit removed. */
function assessAddition(context: StagingCommandContext, unit: StagingUnit, target: StagingPosition, rotate: boolean, baseline: StagingCommandContext, strictBalance = false): StagingCommandAssessment {
  const reasons = inputReasons(context, unit);
  if (unit.location !== 'yard') reasons.push('대기장에 있는 화물만 상차할 수 있습니다.');
  if (![target.x, target.y, target.z].every(value => Number.isFinite(value) && value >= 0)) reasons.push('적재 위치는 차량 내부의 유한한 좌표여야 합니다.');
  if (reasons.length) return outcome(baseline, unit, reasons);
  const position = { x: snapManualCoordinate(target.x, .001), y: snapManualCoordinate(target.y, .001), z: snapManualCoordinate(target.z, .001) };
  const occupiedIds = new Set([...context.result.placements.map(p => p.unitId), ...(context.assignedElsewhere ?? []).map(p => p.id)]);
  if (unit.boxUnits.some(box => occupiedIds.has(box.id))) return outcome(baseline, unit, ['선택한 화물 개체가 이미 차량에 배치되어 있습니다.']);
  let pallets = context.pallets ?? [];
  let added: Placement[];
  let candidate: Placement;
  if (unit.kind === 'pallet') {
    if (!unit.pallet || !context.palletSpec || unit.pallet.cargoPlacements.length !== unit.boxUnits.length || unit.pallet.cargoPlacements.some((p, i) => p.cargoId !== unit.boxUnits[i].cargoId)) return outcome(baseline, unit, ['완성된 파렛트 구성 정보를 찾을 수 없습니다.']);
    if (rotate) return outcome(baseline, unit, ['포장된 파렛트는 전체 구성과 방향을 유지해 이동합니다.']);
    const source = unit.pallet;
    const dx = position.x - source.x, dy = position.y - source.y, dz = position.z - source.z;
    const index = pallets.some(p => p.palletIndex === source.palletIndex) ? Math.max(0, ...pallets.map(p => p.palletIndex)) + 1 : source.palletIndex;
    const moved: PalletLoad = { ...source, ...position, palletIndex: index,
      cargoPlacements: source.cargoPlacements.map((p, i) => ({ ...p, x: p.x + dx, y: p.y + dy, z: p.z + dz, unitId: unit.boxUnits[i].id })),
      centerOfGravity: { x: source.centerOfGravity.x + dx, y: source.centerOfGravity.y + dy, z: source.centerOfGravity.z + dz } };
    candidate = envelope(moved);
    const below = pallets.filter(p => p.x <= moved.x + EPS && p.y <= moved.y + EPS && p.x + p.length >= moved.x + moved.length - EPS && p.y + p.width >= moved.y + moved.width - EPS && Math.abs(p.z + unitHeight(p) - moved.z) <= .001);
    moved.stackLevel = moved.z <= .001 ? 1 : Math.max(0, ...below.map(p => p.stackLevel)) + 1;
    moved.stackColumn = below[0]?.stackColumn ?? index;
    if (moved.z > .001 && !below.length) reasons.push('상부 파렛트는 검증된 하부 파렛트 전체 지지면 위에 놓아야 합니다.');
    // Owner decision 2026-11-19: a pallet stacked by hand needs what the planner needs of
    // its own stacks, not more. The lower pallet's top cartons must carry it by the shared
    // support rule; its wrapping and corner guards between the two are not a gap.
    const spec = context.palletSpec;
    if (moved.z > .001 && below.length && !below.some(lower => hasPalletFootprintSupport(lower, spec))) reasons.push('하부 파렛트 윗면 화물이 상부 파렛트 바닥을 충분히(80% 이상) 받치지 못합니다.');
    if (pallets.some(p => overlaps(candidate, envelope(p)))) reasons.push('다른 파렛트와 충돌합니다.');
    const loose = context.result.placements.filter(p => !pallets.some(load => owned(load, p)));
    if (loose.some(p => overlaps(candidate, p))) reasons.push('파렛트 전체 단위가 다른 화물과 충돌합니다.');
    pallets = [...pallets, moved]; added = moved.cargoPlacements;
    reasons.push(...palletReasons(context, pallets));
  } else {
    if (unit.boxUnits.length !== 1) return outcome(baseline, unit, ['낱박스 개체 정보가 유효하지 않습니다.']);
    const review = resolveLimitReview(context.container, context.cargo);
    const item = review.cargo.find(p => p.id === unit.boxUnits[0].cargoId)!;
    candidate = baseline !== context && unit.placement ? { ...unit.placement, ...position }
      : { cargoId: item.id, unitId: unit.boxUnits[0].id, ...position, length: rotate ? item.width : item.length, width: rotate ? item.length : item.width, height: item.height, weightKg: item.weightKg, rotated: rotate, orientation: rotate ? 'WLH' : 'LWH' };
    if (!isInsideContainer(context.container, candidate)) reasons.push('컨테이너 벽·바닥·천장 경계를 벗어납니다.');
    if (context.result.placements.some(p => overlaps(candidate, p)) || pallets.some(p => overlaps(candidate, envelope(p)))) reasons.push('다른 화물과 충돌합니다.');
    const supports = palletSupportBodies({ pallets } as import('./palletPacking').PalletPackingResult).map(p => ({ ...p, cargoId: `PALLET-${p.id}` }));
    if (!hasAdequateSupport(candidate, [...context.result.placements, ...supports], undefined, review.status === 'active' && context.container.limitReview?.minimumSupportRatio !== undefined ? review.minimumSupportRatio : 1)) reasons.push('바닥 또는 하부 화물이 전체 바닥면을 지지하지 못합니다.');
    if (isARules(context.container) && !pallets.length ? !aCandidateAllowed(context.container, context.cargo, context.result.placements, candidate) : !canPlaceByStackingRules(item, candidate, context.result.placements, new Map(review.cargo.map(p => [p.id, p])))) reasons.push('최대 적층단·회전 또는 상부 허용중량 조건을 만족하지 않습니다.');
    added = [candidate];
  }
  let placements = [...context.result.placements, ...added];
  if (baseline !== context) {
    const moved = new Map(added.map(p => [p.unitId, p]));
    placements = baseline.result.placements.map(p => moved.get(p.unitId) ?? p);
    const byIndex = new Map(pallets.map(load => [load.palletIndex, load]));
    pallets = (baseline.pallets ?? []).map(load => byIndex.get(load.palletIndex) ?? load);
  }
  reasons.push(...quantityReasons(context, placements));
  if (reasons.length) return outcome(baseline, unit, reasons, candidate);
  const result = evidence(context, placements, pallets);
  const regression = regressionReasons(baseline, result, pallets, strictBalance);
  reasons.push(...regression.reasons);
  return outcome(baseline, unit, reasons, candidate, result, pallets, regression.cautions);
}

/** Membership and physical support locks are shared; no intermediate plan is
 * published or judged for CG/payload during a whole-unit relocation. */
function withdrawalSelection(context: StagingCommandContext, unit: StagingUnit) {
  const reasons = inputReasons(context, unit);
  if (unit.location !== 'vehicle') reasons.push('현재 차량에 배치된 화물만 회수할 수 있습니다.');
  const ids = new Set(unit.boxUnits.map(p => p.id));
  const indexes = context.result.placements.flatMap((p, i) => p.unitId && ids.has(p.unitId) ? [i] : []);
  if (indexes.length !== ids.size) reasons.push('선택한 화물 개체와 현재 배치가 일치하지 않습니다.');
  let pallets = context.pallets ?? [];
  const selected = new Set(indexes);
  if (unit.kind === 'box' && pallets.some(load => load.cargoPlacements.some(p => p.unitId && ids.has(p.unitId)))) reasons.push('포장된 파렛트 내부 박스는 개별 회수할 수 없습니다.');
  if (unit.kind === 'pallet') {
    const load = pallets.find(p => p.cargoPlacements.length === ids.size && p.cargoPlacements.every(box => box.unitId && ids.has(box.unitId)));
    if (!load) reasons.push('선택한 파렛트 전체 구성과 현재 배치가 일치하지 않습니다.');
    else {
      if (pallets.some(p => p !== load && p.z >= load.z + load.height && overlaps({ ...envelope(load), z: 0, height: context.container.height }, envelope(p)))) reasons.push('위 화물을 지지하는 하부 파렛트는 먼저 회수할 수 없습니다.');
      const unitBodies = [envelope(load), ...load.cargoPlacements];
      if (context.result.placements.some((p, i) => !selected.has(i) && unitBodies.some(base => supportContactArea(base, p) > 0))) reasons.push('위 화물을 지지하는 하부 파렛트는 먼저 회수할 수 없습니다.');
      pallets = pallets.filter(p => p !== load);
    }
  } else if (indexes.some(index => supportsOtherPlacement(index, context.result.placements))) reasons.push('위 화물을 지지하는 하부 박스는 먼저 회수할 수 없습니다.');
  const placements = context.result.placements.filter((_, index) => !selected.has(index));
  return { reasons, placements, pallets, indexes };
}

export function assessStagingWithdrawal(context: StagingCommandContext, unit: StagingUnit): StagingCommandAssessment {
  const { reasons, placements, pallets } = withdrawalSelection(context, unit);
  if (reasons.length) return outcome(context, unit, reasons);
  const result = evidence(context, placements, pallets, true);
  const regression = regressionReasons(context, result, pallets);
  reasons.push(...quantityReasons(context, placements), ...palletReasonsIfPresent(context, pallets), ...regression.reasons);
  return outcome(context, unit, reasons, undefined, result, pallets, regression.cautions);
}

/** Atomic in-vehicle movement. Temporary removal supplies collision/support
 * candidates only; every safety verdict and undo baseline uses the final plan. */
export function assessStagingRelocation(context: StagingCommandContext, unit: StagingUnit, target: StagingPosition): StagingCommandAssessment {
  const selection = withdrawalSelection(context, unit), reasons = selection.reasons;
  if (new Set((context.pallets ?? []).map(load => load.palletIndex)).size !== (context.pallets?.length ?? 0)) reasons.push('현재 파렛트 식별 번호가 중복되어 있습니다.');
  let sourceUnit = unit;
  if (unit.kind === 'pallet') {
    const ids = new Set(unit.boxUnits.map(box => box.id));
    const load = context.pallets?.find(candidate => candidate.cargoPlacements.length === ids.size && candidate.cargoPlacements.every(p => p.unitId && ids.has(p.unitId)));
    const expected = unit.pallet;
    if (!load || !expected || load.palletIndex !== expected.palletIndex
      || !['x', 'y', 'z', 'length', 'width', 'height', 'totalWeightKg', 'cargoWeightKg', 'packagingWeightKg', 'packagingExtraHeightM'].every(key => same(load[key as 'x'], expected[key as 'x']))
      || load.wrappingUsed !== expected.wrappingUsed || load.cornerGuardsUsed !== expected.cornerGuardsUsed
      || load.cargoPlacements.some(p => !expected.cargoPlacements.some(q => q.unitId === p.unitId && q.cargoId === p.cargoId
        && ['x', 'y', 'z', 'length', 'width', 'height', 'weightKg'].every(key => same(p[key as 'x'], q[key as 'x']))))
      || load.cargoPlacements.some(p => !unit.boxUnits.some(box => box.id === p.unitId && box.cargoId === p.cargoId))) {
      reasons.push('선택한 파렛트 정보와 현재 차량의 전체 구성이 일치하지 않습니다.');
    } else sourceUnit = { ...unit, pallet: load,
      boxUnits: load.cargoPlacements.map(p => unit.boxUnits.find(box => box.id === p.unitId)!) };
  } else if (selection.indexes.length === 1) {
    const current = context.result.placements[selection.indexes[0]];
    if (unit.boxUnits[0]?.cargoId !== current.cargoId || (unit.placement && !['x', 'y', 'z', 'length', 'width', 'height', 'weightKg'].every(key => same(unit.placement![key as 'x'], current[key as 'x'])))) reasons.push('선택한 화물 정보와 현재 차량의 배치가 일치하지 않습니다.');
    sourceUnit = { ...unit, placement: current };
  }
  if (reasons.length) return outcome(context, unit, reasons);
  const temporary = { ...context, result: { ...context.result, placements: selection.placements }, pallets: selection.pallets };
  return assessAddition(temporary, { ...sourceUnit, location: 'yard' }, target, sourceUnit.kind === 'box' && sourceUnit.placement?.rotated === true, context);
}

/** Undo/restoration reuses current inputs and materials. No historical PASS enters this command. */
export function assessStagingRestore(context: StagingCommandContext, previous: { result: LoadingResult; pallets: PalletLoad[] }): StagingCommandAssessment {
  const unit = { id: 'staging-restore' };
  const reasons: string[] = [];
  const badContainer = containerInputError(context.container);
  if (badContainer) reasons.push(badContainer);
  const restoredContext = { ...context, result: previous.result,
    securingLevel: Math.max(context.securingLevel ?? 1, context.result.securingBudget?.level ?? 1, previous.result.securingBudget?.level ?? 1) as 1 | 2 | 3 };
  reasons.push(...quantityReasons(context, previous.result.placements), ...palletReasonsIfPresent(context, previous.pallets));
  const membership = new Set<string>();
  for (const load of previous.pallets) for (const p of load.cargoPlacements) {
    if (!p.unitId || membership.has(p.unitId) || !previous.result.placements.some(box => box.unitId === p.unitId && ['x', 'y', 'z', 'length', 'width', 'height', 'weightKg'].every(key => same(box[key as 'x'], p[key as 'x'])))) reasons.push('파렛트 포함 관계와 복원할 배치가 일치하지 않습니다.');
    if (p.unitId) membership.add(p.unitId);
  }
  const explicitPallet = new Set(context.cargo.filter(item => item.mixedLoadingMethod === 'pallet').map(item => item.id));
  if (previous.result.placements.some(p => (!p.unitId || !membership.has(p.unitId))
    && (context.mode === 'pallets' || (context.mode === 'mixed' && explicitPallet.has(p.cargoId))))) reasons.push('포장 계획 완료 후 상차할 수 있습니다.');
  if (reasons.length) return outcome(context, unit, reasons);
  const result = evidence(restoredContext, previous.result.placements, previous.pallets);
  // A plan that a move left with a centre-of-gravity error can be gone back to: that error
  // was accepted as a verdict when the move was made and still blocks verification.
  const carried = (code: string) => balanceIsVerdict(context) && MANUAL_MOVE_VERDICT_CODES.has(code);
  if (context.container.limitReview === undefined) reasons.push(...result.validationIssues.map(issue => issue.message),
    ...(result.operationalFindings ?? []).filter(finding => finding.severity === 'error' && !carried(finding.code)).map(finding => finding.message));
  else if (previous.pallets.length || (context.mode && context.mode !== 'boxes')) reasons.push('WHAT-IF REVIEW는 legacy 직접 박스 적재만 지원합니다. A·팔레트·MIXED는 엄격 모드로 전환하세요.');
  const regression = regressionReasons(context, result, previous.pallets);
  reasons.push(...regression.reasons);
  return outcome(context, unit, reasons, undefined, result, previous.pallets, regression.cautions);
}

function palletReasonsIfPresent(context: StagingCommandContext, pallets: PalletLoad[]) { return pallets.length ? palletReasons(context, pallets) : []; }

/** Reuse the engine's EMS subtraction, without reordering SKUs or running a packing algorithm. */
export function findStagingLoadingPosition(context: StagingCommandContext, unit: StagingUnit): StagingCommandAssessment {
  const initialReasons = inputReasons(context, unit);
  if (initialReasons.length) return outcome(context, unit, initialReasons);
  const dimensions = unit.kind === 'pallet' && unit.pallet ? envelope(unit.pallet) : unit;
  const occupied = [...(context.pallets ?? []).map(envelope), ...context.result.placements.filter(p => !(context.pallets ?? []).some(load => owned(load, p)))];
  let spaces: Space[] = [{ x: 0, y: 0, z: 0, length: context.container.length, width: context.container.width, height: usableHeight(context.container) }];
  for (const body of occupied) spaces = nextSpaces(spaces, body);
  let firstFailure: StagingCommandAssessment | undefined;
  const rotations = unit.kind === 'box' && !same(dimensions.length, dimensions.width) ? [false, true] : [false];
  // A place the program proposes keeps the centre of gravity in range whenever any place
  // does. Only when none does is the first otherwise-safe place offered, with its caution.
  for (const strictBalance of balanceIsVerdict(context) ? [true, false] : [true]) {
    // The second pass ignores only the balance; what still fails there is the real obstacle.
    if (!strictBalance) firstFailure = undefined;
    for (const rotate of rotations) {
      const length = rotate ? dimensions.width : dimensions.length, width = rotate ? dimensions.length : dimensions.width;
      for (const space of [...spaces].sort((a, b) => a.z - b.z || a.x - b.x || a.y - b.y)) {
        if (length > space.length + EPS || width > space.width + EPS || dimensions.height > space.height + EPS) continue;
        const xs = [...new Set([space.x + (space.length - length) / 2, space.x, space.x + space.length - length])];
        const ys = [...new Set([space.y + (space.width - width) / 2, space.y, space.y + space.width - width])];
        for (const x of xs) for (const y of ys) {
          const checked = assessStagingAddition(context, unit, { x, y, z: space.z }, rotate, { strictBalance });
          if (checked.valid) return checked;
          firstFailure ??= checked;
        }
      }
    }
  }
  return firstFailure ?? outcome(context, unit, ['현재 조건을 만족하는 차량 내부 적재 위치를 찾지 못했습니다.']);
}

/** Keep the owning pallet panel's existing result format without repacking or unpacking units. */
export function rebuildStagingPalletResult<T extends OptimizedPalletPackingResult>(source: T, result: LoadingResult, pallets: PalletLoad[], container: Pick<ContainerSpec, 'width'>): T & Pick<LoadingResult, 'securingBudget'> {
  const direct = result.placements.filter(p => !pallets.some(load => owned(load, p)));
  const gross = pallets.reduce((sum, load) => sum + load.totalWeightKg, 0);
  const left = pallets.filter(load => load.centerOfGravity.y < container.width / 2 - EPS).reduce((sum, load) => sum + load.totalWeightKg, 0);
  const right = pallets.filter(load => load.centerOfGravity.y > container.width / 2 + EPS).reduce((sum, load) => sum + load.totalWeightKg, 0);
  const rebuilt = { ...source, pallets, placements: result.placements, remaining: result.remaining, limitReview: result.limitReview, securingBudget: result.securingBudget,
    palletCount: pallets.length, loadedCargoWeightKg: result.placements.reduce((sum, p) => sum + p.weightKg, 0),
    totalPackagingWeightKg: pallets.reduce((sum, load) => sum + load.packagingWeightKg, 0),
    packagedPalletCount: pallets.filter(load => load.cornerGuardsUsed || load.wrappingUsed).length,
    totalPalletizedWeightKg: gross, lateralImbalanceKg: Math.abs(left - right),
    stackedPallets: pallets.filter(load => load.stackLevel > 1).length,
    maxUsedStackLevel: Math.max(0, ...pallets.map(load => load.stackLevel)),
    optimization: { ...source.optimization, floorPositions: new Set(pallets.map(load => load.stackColumn)).size },
  };
  if ('mixed' in source) {
    const previous = (source as MixedModePackingResult).mixed;
    Object.assign(rebuilt, { mixed: { ...previous, directBoxCount: direct.length, directFloorBoxCount: direct.filter(p => p.z <= .0015).length,
      palletBoxCount: pallets.reduce((sum, load) => sum + load.cargoPlacements.length, 0), palletCount: pallets.length,
      totalLoadedWeightKg: gross + direct.reduce((sum, p) => sum + p.weightKg, 0),
      palletFillRates: pallets.map(load => ({ palletIndex: load.palletIndex,
        fillRate: load.cargoPlacements.reduce((sum, p) => sum + volume(p), 0) / Math.max(EPS, load.length * load.width * (unitHeight(load) - load.height - load.packagingExtraHeightM)),
        eligibleForDirect: previous.palletFillRates.find(row => row.palletIndex === load.palletIndex)?.eligibleForDirect ?? false,
      })) } });
  }
  return rebuilt;
}
