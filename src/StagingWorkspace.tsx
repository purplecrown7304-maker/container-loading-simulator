import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { StagingApplication, StagingWorkspaceProps } from './stagingWorkspaceTypes';
import { StagingSceneContext, type StagingCameraView, type StagingSceneBridge } from './stagingSceneContext';
import { buildStagingInventory, identifyStagingPlan, stagingInputSignature, type StagingIdentityHints,
  type StagingSelectedPlan, type StagingUnit } from './stagingInventory';
import { assessStagingAddition, assessStagingRelocation, assessStagingRestore, assessStagingWithdrawal, findStagingLoadingPosition,
  rebuildStagingPalletResult, type StagingCommandAssessment, type StagingCommandContext } from './engine/stagingCommands';
import type { LoadingResult, Placement } from './engine/types';
import type { MixedModePackingResult } from './engine/mixedModePacking';
import type { OptimizedPalletPackingResult, PalletLoad, PalletSpec } from './engine/palletOptimization';
import { buildStagingYardLayout, type StagingYardLayout } from './stagingYardLayout';
import StagingYardPanel from './StagingYardPanel';
import PalletContents from './PalletContents';
import { palletModelKey } from './palletModel';
import type { StagingYardDrag } from './ThreeStagingYard';
import { useStagingPackaging } from './useStagingPackaging';
import { usePalletSnapshot, type PalletSnapshot } from './palletSnapshotStore';
import { palletJobSpec, recordPalletJobSpec, usePalletJobSpecs } from './palletJobSpecs';
import { resolvePalletType, usePalletTypeSelection } from './palletTypeSelection';
import { STAGING_PALLET_READY_EVENT, publishStagingPalletPlan, sameStagingPalletSpec, stagingPalletSceneData, stagingPalletsWithBanding } from './stagingPalletBridge';
import { INERTIA_CERTIFICATION_EVENT, readLatestInertiaCertification } from './inertiaCertification';
import { matchingStagingMetadata, stagingMetadata, type SavedStagingWorkspace } from './stagingPersistence';
import { readStoredState, STORAGE_RESET_EVENT, STORAGE_UPDATED_EVENT, writeStoredState, type StoredState } from './storage';
import { ADMIN_ACCESS_EVENT, isAdminSession } from './adminAccess';
import { LOCAL_OPERATOR_EVENT, readLocalOperator } from './localOperator';
import { MEMBER_AUTH_EVENT, readSupabaseMember } from './memberAuth';
import { LOADING_STRATEGY_PREFERENCE_EVENT, readLoadingStrategyPreference } from './loadingStrategyPreference';
import { readSecuringMaterialSettings } from './securingMaterialSettings';
import { useTransportEquipment } from './transportEquipment';
import { vehicleRigForEquipment } from './threeVehicleLayout';
import { openPackagingContents } from './packagingContentsModel';
import { uiText } from './uiLanguage';
import { useStagingFlights } from './useStagingFlights';
import { STAGING_PLAN_MOTION_EVENT, STAGING_PLAN_MOTION_WAIT_MS } from './stagingPlanMotion';
import { stagingUnitDraggable } from './stagingDragCues';
import { stagingDragTarget } from './stagingDragTarget';
import { setStagingFlightVisible } from './stagingFlightVisibility';

type HistoryEntry = { previous: { result: LoadingResult; pallets: PalletLoad[] }; selection: string | null;
  identity: StagingIdentityHints; yardPallets: PalletLoad[]; snapshot?: PalletSnapshot };
type Control = { epoch: string; selected: string | null; inspected: string | null; identity: StagingIdentityHints; yardPallets: PalletLoad[];
  history: HistoryEntry[]; message: string; dragging: boolean; preview: StagingSceneBridge['preview'];
  view: StagingCameraView; viewRequest: number; page: number; arrange: number };
const ownerKey = () => isAdminSession() ? 'admin' : 'operator:' + (readSupabaseMember()?.id ?? readLocalOperator()?.id ?? 'guest');
const freshControl = (epoch: string): Control => ({ epoch, selected: null, inspected: null, identity: { unitToStableId: {} }, yardPallets: [],
  history: [], message: '', dragging: false, preview: null, view: 'all', viewRequest: 0, page: 0, arrange: 0 });
const planKey = (plan?: StagingSelectedPlan) => plan ? JSON.stringify([plan.result.placements, (plan.pallets ?? []).map(load =>
  [load.palletIndex, load.cargoPlacements.map(p => p.unitId)])]) : '';
function emptyResult(): LoadingResult { return { placements: [], remaining: [], loadedWeightKg: 0, usedVolumeM3: 0, validationIssues: [] }; }
export function emptyStagingPalletSnapshot(spec: PalletSpec, mode: 'pallets' | 'mixed'): PalletSnapshot {
  const result: OptimizedPalletPackingResult = { pallets: [], placements: [], remaining: [], palletCount: 0,
    loadedCargoWeightKg: 0, totalPackagingWeightKg: 0, avoidedPackagingWeightKg: 0, packagedPalletCount: 0,
    totalPalletizedWeightKg: 0, consolidatedPallets: 0, lateralImbalanceKg: 0, stackedPallets: 0, maxUsedStackLevel: 0,
    optimization: { selectedStackTarget: 1, candidateCount: 0, floorPositions: 0, redistributedForLowUtilization: false, consolidationPasses: 0 } };
  if (mode === 'mixed') Object.assign(result, { mixed: { enabled: true, directBoxCount: 0, directFloorBoxCount: 0,
    palletBoxCount: 0, palletCount: 0, demotedPalletCount: 0, candidateCount: 0, minPalletFillRatio: .7,
    totalLoadedWeightKg: 0, palletFillRates: [] } satisfies MixedModePackingResult['mixed'] });
  return { spec, result };
}
function identifiedLoad(unit: StagingUnit): PalletLoad {
  return { ...unit.pallet!, cargoPlacements: unit.pallet!.cargoPlacements.map((p, index) =>
    ({ ...p, unitId: unit.boxUnits[index].id })) };
}
function transferYardAliases(identity: StagingIdentityHints, units: StagingUnit[]): StagingIdentityHints {
  const aliases = { ...identity.unitToStableId };
  for (const unit of units) for (const box of unit.boxUnits) aliases[JSON.stringify(['yard', box.id])] = box.stableId;
  return { unitToStableId: aliases };
}
export function stagingDragPosition(unit: StagingUnit, point: [number, number, number], container: { length: number; width: number }) {
  // Inverse of sceneCenter: the cursor is the unit's floor-footprint center.
  // Outside ground height is display-only; the vehicle deck stays engine Z=0.
  return { x: point[0] + container.length / 2 - unit.length / 2,
    y: point[2] + container.width / 2 - unit.width / 2, z: Math.max(0, point[1]) };
}
export function stagingCommandContextForUnit(context: StagingCommandContext, unit?: StagingUnit, restoredPallets: readonly PalletLoad[] = []): StagingCommandContext {
  return { ...context, securingLevel: Math.max(context.securingLevel ?? 1, unit?.pallet?.bandingPlan?.securingLevel ?? 1, ...restoredPallets.map(load => load.bandingPlan?.securingLevel ?? 1)) as 1 | 2 | 3, materials: readSecuringMaterialSettings() };
}

/** One controller connects real input/accepted plans to both panel and scene. */
export default function StagingWorkspace(props: StagingWorkspaceProps) {
  const [certification, setCertification] = useState(readLatestInertiaCertification);
  const [owner, setOwner] = useState(ownerKey);
  const [strategy, setStrategy] = useState(() => readLoadingStrategyPreference() ?? 'capacity');
  const typeSelection = usePalletTypeSelection(), jobs = usePalletJobSpecs();
  const palletType = resolvePalletType(typeSelection);
  const spec = useMemo(() => palletJobSpec(palletType, jobs), [palletType, jobs]);
  const snapshot = usePalletSnapshot(), equipment = useTransportEquipment();
  const scopeKey = owner + '|active';
  const sourceCargo = props.preparedCargo ?? props.cargo;
  const base = useMemo(() => ({ scopeKey, mode: props.mode, container: props.container, cargo: sourceCargo,
    palletSpec: props.mode === 'boxes' ? undefined : spec, strategy }), [scopeKey, props.mode, props.container, sourceCargo, spec, strategy]);
  const signature = useMemo(() => stagingInputSignature(base), [base]);
  const epoch = scopeKey + '|' + props.inputKey + '|' + signature;
  const restorationInput = useRef({ key: scopeKey + '|' + props.inputKey, signature });
  if (restorationInput.current.key !== scopeKey + '|' + props.inputKey) {
    restorationInput.current = { key: scopeKey + '|' + props.inputKey, signature };
  }
  const [control, setControl] = useState(() => freshControl(epoch));
  const current = control.epoch === epoch ? control : { ...freshControl(epoch), view: control.view, viewRequest: control.viewRequest };
  const epochRef = useRef(epoch); epochRef.current = epoch;
  const [initialStored] = useState(readStoredState);
  const stored = useRef<StoredState | null>(initialStored);
  const [restoreRevision, setRestoreRevision] = useState(0);
  const restored = useRef<string | null>(null);
  const restorationGeneration = useRef(0);
  const manualPlan = useRef<string>('');
  const observedPlan = useRef<string>('');
  const drag = useRef<{ epoch: string; unitId: string; planKey: string } | null>(null);
  const confirmed = props.inputsConfirmed !== false && !(props.pendingProducts && props.pendingProducts > 0);
  const snapshotKeys = useRef(new WeakMap<object, string>()), resultKeys = useRef(new WeakMap<object, string>());
  if (snapshot && !snapshotKeys.current.has(snapshot)) snapshotKeys.current.set(snapshot, epoch);
  if (!resultKeys.current.has(props.result)) resultKeys.current.set(props.result, epoch);
  const rawPlan = useMemo<StagingSelectedPlan | undefined>(() => {
    if (props.isPreview) return undefined;
    if (props.mode === 'boxes') return resultKeys.current.get(props.result) === epoch
      ? { inputSignature: signature, result: props.result } : undefined;
    if (!snapshot || snapshotKeys.current.get(snapshot) !== epoch || !sameStagingPalletSpec(snapshot.spec, spec)) return undefined;
    return { inputSignature: signature, result: stagingPalletSceneData(props.container, sourceCargo, snapshot).result,
      pallets: stagingPalletsWithBanding(props.container, sourceCargo, snapshot, certification) };
  }, [props.isPreview, props.mode, props.result, props.container, snapshot, spec, sourceCargo, signature, epoch, certification]);
  const currentPlanKey = planKey(rawPlan);
  const usingManualPackaging = !currentPlanKey || !observedPlan.current || currentPlanKey === observedPlan.current || currentPlanKey === manualPlan.current;
  const packagingInput = useMemo(() => ({ ...base, selectedPlan: rawPlan, preservedPallets: usingManualPackaging ? current.yardPallets : [] }),
    [base, rawPlan, current.yardPallets, usingManualPackaging]);
  const packaging = useStagingPackaging(packagingInput, props.mode !== 'boxes' && sourceCargo.length > 0);
  const inventory = useMemo(() => buildStagingInventory({ ...base, selectedPlan: rawPlan, packaging: packaging.plan,
    calculating: props.calculating, identity: current.identity }), [base, rawPlan, packaging.plan, props.calculating, current.identity]);
  const previousLayout = useRef<{ epoch: string; arrange: number; layout: StagingYardLayout } | null>(null);
  const layout = useMemo(() => {
    const previous = previousLayout.current;
    const next = buildStagingYardLayout(inventory.yardUnits, { container: props.container,
      vehicleRig: vehicleRigForEquipment(equipment), previous: previous?.epoch === epoch && previous.arrange === current.arrange ? previous.layout : null });
    previousLayout.current = { epoch, arrange: current.arrange, layout: next };
    return next;
  }, [inventory.yardUnits, props.container, equipment, epoch, current.arrange]);
  const allZones = inventory.yardUnits.length <= 20;
  const pageCount = Math.max(1, allZones ? 1 : Math.ceil(layout.zones.length / 4));
  const page = Math.min(current.page, pageCount - 1);
  const visibleZoneIds = useMemo(() => (allZones ? layout.zones : layout.zones.slice(page * 4, page * 4 + 4)).map(zone => zone.id),
    [allZones, layout.zones, page]);
  const selected = inventory.units.find(unit => unit.id === current.selected);
  const normalizedPlan = useMemo(() => identifyStagingPlan(rawPlan ?? { inputSignature: signature, result: emptyResult(), pallets: [] }, inventory),
    [rawPlan, signature, inventory]);
  const context = useMemo<StagingCommandContext>(() => ({ container: props.container, cargo: sourceCargo,
    result: normalizedPlan.result, pallets: normalizedPlan.pallets ?? [], palletSpec: spec, mode: props.mode,
    securingLevel: Math.max(1, ...(normalizedPlan.pallets ?? []).map(load => load.bandingPlan?.securingLevel ?? 1)) as 1 | 2 | 3,
    strategy, materials: readSecuringMaterialSettings() }), [props.container, sourceCargo, normalizedPlan, spec, props.mode, strategy]);
  const flights = useStagingFlights({ epoch, inventory, layout, planKey: currentPlanKey, container: props.container,
    // The source captured by queueLoad is already packaged and validated. The
    // remaining yard may repack asynchronously after acceptance; waiting for that
    // unrelated work would flash the final slot before jumping back to the dock.
    vehicleRig: vehicleRigForEquipment(equipment), calculating: props.calculating, confirmed, isPreview: props.isPreview });
  // Lets an automatic check window wait for the motion instead of covering it.
  const flightId = flights.sequence?.id ?? 0;
  useEffect(() => { setStagingFlightVisible(flightId !== 0); return () => setStagingFlightVisible(false); }, [flightId]);
  const snapshotSource = useMemo(() => props.mode === 'boxes' ? undefined
    : rawPlan && snapshot ? rawPlan.pallets === snapshot.result.pallets ? snapshot : { ...snapshot, result: { ...snapshot.result, pallets: rawPlan.pallets ?? snapshot.result.pallets } }
      : emptyStagingPalletSnapshot(spec, props.mode), [props.mode, rawPlan, snapshot, spec]);
  const live = useRef({ props, epoch, base, signature, inventory, layout, currentPlanKey, flights, context, selected, current, snapshotSource, spec, palletType, confirmed });
  live.current = { props, epoch, base, signature, inventory, layout, currentPlanKey, flights, context, selected, current, snapshotSource, spec, palletType, confirmed };

  const update = useCallback((change: (value: Control) => Control) => {
    if (epochRef.current !== epoch) return;
    setControl(previous => change(previous.epoch === epoch ? previous : { ...freshControl(epoch), view: previous.view, viewRequest: previous.viewRequest }));
  }, [epoch]);
  useEffect(() => {
    drag.current = null; manualPlan.current = ''; observedPlan.current = ''; restored.current = null;
    setControl(previous => previous.epoch === epoch ? previous : { ...freshControl(epoch), view: previous.view, viewRequest: previous.viewRequest });
  }, [epoch]);
  useEffect(() => {
    const receiveCertification = () => setCertification(readLatestInertiaCertification());
    window.addEventListener(INERTIA_CERTIFICATION_EVENT, receiveCertification);
    return () => window.removeEventListener(INERTIA_CERTIFICATION_EVENT, receiveCertification);
  }, []);
  useEffect(() => {
    const identity = () => setOwner(ownerKey());
    const preference = () => setStrategy(readLoadingStrategyPreference() ?? 'capacity');
    const load = (event: Event) => {
      const now = live.current;
      now.flights.cancel();
      // Input-only notifications also apply recovered manual plans. They must not
      // resurrect a different staging snapshot still held in localStorage.
      stored.current = (event as CustomEvent<StoredState>).detail ?? readStoredState();
      // Final certification republishes the same inputs after a user may have
      // selected a unit. Keep that stable view identity, while still cancelling
      // stale drags/history. Real input changes and saved snapshots reset it.
      const sameInputOnly = stored.current && !stored.current.staging
        && stagingInputSignature({ ...now.base, container: stored.current.container, cargo: stored.current.cargo }) === now.signature;
      restored.current = null; drag.current = null;
      restorationInput.current.signature = live.current.signature;
      setControl(value => ({ ...value, history: [], selected: sameInputOnly ? value.selected : null,
        inspected: null, preview: null, dragging: false })); setRestoreRevision(value => value + 1); };
    const reset = () => {
      live.current.flights.cancel();
      stored.current = null; restored.current = live.current.epoch; restorationGeneration.current++;
      drag.current = null; manualPlan.current = ''; observedPlan.current = '';
      setControl(value => ({ ...freshControl(epochRef.current), view: value.view, viewRequest: value.viewRequest }));
    };
    const planMotion = () => {
      const now = live.current;
      // Only from an accepted plan that is on screen. A preview, a running calculation and
      // a reference result have no accepted place to start a move from.
      if (now.props.calculating || now.props.isPreview || !now.confirmed || now.inventory.referenceResult || !now.currentPlanKey) return;
      now.flights.queueLoad({ inventory: now.inventory, layout: now.layout, planKey: now.currentPlanKey }, STAGING_PLAN_MOTION_WAIT_MS);
    };
    for (const event of [LOCAL_OPERATOR_EVENT, MEMBER_AUTH_EVENT, ADMIN_ACCESS_EVENT]) window.addEventListener(event, identity);
    window.addEventListener(LOADING_STRATEGY_PREFERENCE_EVENT, preference); window.addEventListener(STORAGE_UPDATED_EVENT, load);
    window.addEventListener(STORAGE_RESET_EVENT, reset); window.addEventListener(STAGING_PLAN_MOTION_EVENT, planMotion);
    return () => {
      for (const event of [LOCAL_OPERATOR_EVENT, MEMBER_AUTH_EVENT, ADMIN_ACCESS_EVENT]) window.removeEventListener(event, identity);
      window.removeEventListener(LOADING_STRATEGY_PREFERENCE_EVENT, preference); window.removeEventListener(STORAGE_UPDATED_EVENT, load);
      window.removeEventListener(STORAGE_RESET_EVENT, reset); window.removeEventListener(STAGING_PLAN_MOTION_EVENT, planMotion);
    };
  }, []);
  useEffect(() => {
    const key = planKey(rawPlan);
    if (key && observedPlan.current && observedPlan.current !== key && manualPlan.current !== key) {
      update(value => ({ ...value, yardPallets: [], history: [], preview: null, dragging: false }));
    }
    observedPlan.current = key;
  }, [rawPlan, update]);

  const save = useCallback((value: { identity: StagingIdentityHints; selected: string | null; yardPallets: PalletLoad[] },
    result: LoadingResult, palletSnapshot?: PalletSnapshot) => {
    const now = live.current;
    const metadata: SavedStagingWorkspace = { version: 1, scopeKey: now.base.scopeKey, inputSignature: now.signature,
      mode: now.props.mode, identity: value.identity, selectedUnitId: value.selected, yardPallets: value.yardPallets,
      ...(palletSnapshot ? { palletSnapshot, palletTypeId: now.palletType.id } : {}) };
    const old = readStoredState();
    const next: StoredState = { ...(old ?? { container: now.props.container, cargo: now.props.cargo }),
      container: now.props.container, cargo: now.props.cargo, result, staging: metadata };
    writeStoredState(next); stored.current = next;
  }, []);
  const applicationFor = useCallback((checked: StagingCommandAssessment, source?: PalletSnapshot): StagingApplication => {
    const now = live.current;
    if (now.props.mode === 'boxes') return { inputKey: now.props.inputKey, result: checked.result };
    const palletSnapshot: PalletSnapshot = { spec: now.spec,
      result: rebuildStagingPalletResult((source ?? now.snapshotSource!).result, checked.result, checked.pallets, now.props.container) };
    return { inputKey: now.props.inputKey, result: checked.result, palletSnapshot,
      scene: stagingPalletSceneData(now.props.container, now.context.cargo, palletSnapshot),
      adoptPallet: () => publishStagingPalletPlan(now.props.inputKey, palletSnapshot) };
  }, []);
  const apply = useCallback((checked: StagingCommandAssessment, options: { yardPallets: PalletLoad[]; selected: string | null;
    identity: StagingIdentityHints; history: HistoryEntry[]; source?: PalletSnapshot; message: string; animateLoad?: boolean }) => {
    const now = live.current;
    if (!checked.valid) { update(value => ({ ...value, message: checked.reasons.join(' · '), dragging: false,
      preview: checked.candidate ? { unitId: checked.unitId, candidate: checked.candidate, valid: false, reasons: checked.reasons } : null })); return false; }
    if (now.epoch !== epochRef.current || now.props.calculating || !now.confirmed) return false;
    const application = applicationFor(checked, options.source);
    if (!now.props.onApply(application)) { update(value => ({ ...value, message: '입력이 변경되었거나 현재 계획을 적용할 준비가 되지 않았습니다.', preview: null, dragging: false })); return false; }
    if (options.animateLoad) now.flights.queueLoad({ inventory: now.inventory, layout: now.layout, planKey: now.currentPlanKey });
    else now.flights.cancel();
    manualPlan.current = planKey({ inputSignature: now.signature, result: checked.result, pallets: checked.pallets });
    update(value => ({ ...value, identity: options.identity, selected: options.selected, yardPallets: options.yardPallets,
      history: options.history, message: options.message, inspected: null, dragging: false, preview: null }));
    save(options, checked.result, application.palletSnapshot);
    return true;
  }, [applicationFor, save, update]);
  const commit = useCallback((checked: StagingCommandAssessment, withdrawal = false, relocation = false) => {
    const now = live.current;
    const unit = now.selected;
    if (!unit) return false;
    const yardUnits = now.inventory.yardUnits.filter(candidate => candidate.kind === 'pallet' && (!withdrawal ? candidate.id !== unit.id : true));
    const yardPallets = yardUnits.map(identifiedLoad);
    const identity = transferYardAliases(now.inventory.identity, [...yardUnits, ...(withdrawal ? [unit] : [])]);
    if (withdrawal && unit.kind === 'pallet') {
      const ids = new Set(unit.boxUnits.map(box => box.id));
      const load = now.context.pallets?.find(candidate => candidate.cargoPlacements.every(p => p.unitId && ids.has(p.unitId)));
      if (load) yardPallets.push(load);
    }
    const history: HistoryEntry = { previous: checked.previous, selection: now.current.selected,
      identity: now.inventory.identity, yardPallets: now.inventory.yardUnits.filter(candidate => candidate.kind === 'pallet').map(identifiedLoad),
      snapshot: now.snapshotSource };
    const done = relocation ? '선택 화물 위치를 이동했습니다. 운송 검증을 다시 실행하세요.' : withdrawal ? '선택 화물을 대기장으로 회수했습니다. 운송 검증을 다시 실행하세요.' : '선택 화물을 차량에 배치했습니다. 운송 검증을 다시 실행하세요.';
    // An accepted move may leave a centre-of-gravity error on the plan; the operator is told.
    return apply(checked, { yardPallets, selected: unit.id, identity, history: [...now.current.history, history],
      animateLoad: !withdrawal && !relocation, message: [done, ...checked.cautions].join(' · ') });
  }, [apply]);
  const loadSelected = useCallback(() => {
    const now = live.current;
    if (!now.selected || now.props.calculating || !now.confirmed || now.selected.requiresPackaging) return;
    commit(findStagingLoadingPosition(stagingCommandContextForUnit(now.context, now.selected), now.selected));
  }, [commit]);
  const withdraw = useCallback(() => {
    const now = live.current; if (!now.selected || now.props.calculating || !now.confirmed) return;
    commit(assessStagingWithdrawal(stagingCommandContextForUnit(now.context, now.selected), now.selected), true);
  }, [commit]);
  const undo = useCallback(() => {
    const now = live.current, previous = now.current.history.at(-1);
    if (!previous || now.props.calculating || !now.confirmed) return;
    const checked = assessStagingRestore(stagingCommandContextForUnit(now.context, undefined, previous.previous.pallets), previous.previous);
    apply(checked, { yardPallets: previous.yardPallets, selected: previous.selection, identity: previous.identity,
      history: now.current.history.slice(0, -1), source: previous.snapshot, message: '이전 화물 위치와 포장 구성을 복원했습니다. 운송 검증을 다시 실행하세요.' });
  }, [apply]);
  const selectUnit = useCallback((id: string | null) => update(value => ({ ...value,
    selected: id && live.current.inventory.units.some(unit => unit.id === id) ? id : null, inspected: null, preview: null })), [update]);
  const vehicleUnitAt = (kind: 'cargo' | 'support', index: number) => {
    const now = live.current;
    const palletIndex = kind === 'support' ? now.context.pallets?.[index]?.palletIndex : undefined;
    const unit = now.inventory.vehicleUnits.find(candidate => kind === 'support' ? candidate.sourcePalletIndex === palletIndex
      : candidate.sourcePlacementIndex === index || candidate.sourcePlacementIndexes?.includes(index));
    return unit;
  };
  const selectVehicleUnit = useCallback((kind: 'cargo' | 'support', index: number) => {
    selectUnit(vehicleUnitAt(kind, index)?.id ?? null);
  }, [selectUnit]);
  const inspectUnit = useCallback((id: string) => {
    const unit = live.current.inventory.units.find(candidate => candidate.id === id);
    if (!unit) return;
    update(value => ({ ...value, selected: id, inspected: unit.kind === 'pallet' && unit.pallet ? id : null, preview: null }));
  }, [update]);
  const inspectVehicleUnit = useCallback((kind: 'cargo' | 'support', index: number) => {
    const unit = vehicleUnitAt(kind, index); if (unit) inspectUnit(unit.id);
  }, [inspectUnit]);
  const setView = useCallback((view: StagingCameraView) => update(value => ({ ...value, view, page: view === 'all' ? 0 : value.page, viewRequest: value.viewRequest + 1 })), [update]);
  const previewDrag = useCallback((event: StagingYardDrag) => {
    const now = live.current;
    if (drag.current?.epoch !== now.epoch || drag.current.planKey !== now.currentPlanKey || now.props.calculating || !now.confirmed) return;
    const unit = now.inventory.units.find(candidate => candidate.id === event.unitId && candidate.location !== 'other-vehicle');
    if (!unit || !stagingUnitDraggable(unit)) return;
    // Aim only: onto the cargo under the pointer and flush against what is nearly touched.
    const aimed = stagingDragTarget(unit, stagingDragPosition(unit, event.point, now.props.container), now.props.container, now.inventory.vehicleUnits);
    const position = { x: aimed.x, y: aimed.y, z: aimed.z };
    const checked = unit.location === 'vehicle'
      ? assessStagingRelocation(stagingCommandContextForUnit(now.context, unit), unit, position)
      : assessStagingAddition(stagingCommandContextForUnit(now.context, unit), unit, position);
    const candidate: Placement = checked.candidate ?? { cargoId: unit.cargoId ?? unit.id, ...position,
      length: unit.length, width: unit.width, height: unit.height, weightKg: unit.weightKg };
    update(value => ({ ...value, selected: unit.id, dragging: true,
      preview: { unitId: unit.id, candidate, valid: checked.valid, reasons: checked.reasons, cautions: checked.cautions } }));
  }, [update]);
  const onDragStart = useCallback((event: StagingYardDrag) => {
    drag.current = { epoch: live.current.epoch, unitId: event.unitId, planKey: live.current.currentPlanKey }; previewDrag(event);
  }, [previewDrag]);
  const onDragEnd = useCallback((event: StagingYardDrag) => {
    const now = live.current, started = drag.current; drag.current = null;
    if (event.cancelled || started?.epoch !== now.epoch || started.unitId !== event.unitId || started.planKey !== now.currentPlanKey
      || now.props.calculating || !now.confirmed) { update(value => ({ ...value, dragging: false, preview: null })); return; }
    const unit = now.inventory.units.find(candidate => candidate.id === event.unitId && candidate.location !== 'other-vehicle');
    if (!unit || unit.requiresPackaging) { update(value => ({ ...value, dragging: false, preview: null })); return; }
    // Reassess now; the preview is never itself permission to mutate the plan.
    const aimed = stagingDragTarget(unit, stagingDragPosition(unit, event.point, now.props.container), now.props.container, now.inventory.vehicleUnits);
    const target = { x: aimed.x, y: aimed.y, z: aimed.z };
    const checked = unit.location === 'vehicle'
      ? assessStagingRelocation(stagingCommandContextForUnit(now.context, unit), unit, target)
      : assessStagingAddition(stagingCommandContextForUnit(now.context, unit), unit, target);
    if (now.current.selected !== unit.id) live.current = { ...now, selected: unit, current: { ...now.current, selected: unit.id } };
    commit(checked, false, unit.location === 'vehicle');
  }, [commit, update]);

  const restoreAction = useRef<() => void>(() => {});
  restoreAction.current = () => {
    const now = live.current, saved = stored.current;
    if (now.props.calculating || !now.confirmed || restored.current === now.epoch) return;
    // Editing this job's physical settings is a new input, not a reload request.
    if (restorationInput.current.signature !== now.signature) { restored.current = now.epoch; return; }
    if (!saved?.staging) { restored.current = now.epoch; return; }
    const metadata = stagingMetadata(saved.staging);
    if (!metadata || metadata.scopeKey !== now.base.scopeKey || metadata.mode !== now.props.mode) { restored.current = now.epoch; return; }
    if (now.props.mode !== 'boxes' && metadata.palletSnapshot && metadata.palletTypeId === now.palletType.id
      && metadata.inputSignature === stagingInputSignature({ ...now.base, palletSpec: metadata.palletSnapshot.spec })
      && !sameStagingPalletSpec(now.spec, metadata.palletSnapshot.spec)) {
      restorationInput.current.signature = metadata.inputSignature;
      recordPalletJobSpec(now.palletType.id, metadata.palletSnapshot.spec); return;
    }
    const matching = matchingStagingMetadata(metadata, now.base);
    if (!matching || (matching.palletTypeId && matching.palletTypeId !== now.palletType.id)) {
      restored.current = now.epoch; update(value => ({ ...value, message: '저장된 이전 계획은 현재 입력과 달라 참고용으로만 남겨 두었습니다.' })); return;
    }
    const source = matching.palletSnapshot;
    const candidate = now.props.mode === 'boxes' ? saved.result
      : source ? stagingPalletSceneData(now.props.container, now.context.cargo, source).result : undefined;
    if (!candidate || (now.props.mode !== 'boxes' && !source)) { restored.current = now.epoch; return; }
    const plan = { inputSignature: now.signature, result: candidate, pallets: source?.result.pallets };
    const oldInventory = buildStagingInventory({ ...now.base, selectedPlan: plan, identity: matching.identity });
    if (oldInventory.referenceResult) { restored.current = now.epoch; return; }
    const identified = identifyStagingPlan(plan, oldInventory);
    const checked = assessStagingRestore(stagingCommandContextForUnit(now.context, undefined, identified.pallets),
      { result: identified.result, pallets: identified.pallets ?? [] });
    if (!checked.valid) {
      restored.current = now.epoch; update(value => ({ ...value, message: checked.reasons.join(' · ') })); return;
    }
    const application = applicationFor(checked, source);
    if (!now.props.onApply(application)) return; // The pallet owner may still be mounting.
    now.flights.cancel();
    restorationGeneration.current++;
    manualPlan.current = planKey({ ...plan, result: checked.result, pallets: checked.pallets });
    restored.current = now.epoch;
    update(value => ({ ...value, identity: matching.identity, selected: matching.selectedUnitId, inspected: null,
      yardPallets: matching.yardPallets ?? [], history: [], message: '저장된 화물 위치와 포장 계획을 복원했습니다. 운송 검증을 다시 실행하세요.' }));
  };
  useEffect(() => {
    const restore = () => restoreAction.current();
    const timer = window.setTimeout(restore, 0);
    window.addEventListener(STAGING_PALLET_READY_EVENT, restore);
    return () => { window.clearTimeout(timer); window.removeEventListener(STAGING_PALLET_READY_EVENT, restore); };
  }, [epoch, signature, props.calculating, confirmed, restoreRevision, applicationFor, update]);

  // Wait for restoration before saving. A preview or an input-invalidated old
  // result must never overwrite the accepted snapshot waiting to be restored.
  useEffect(() => {
    if (!rawPlan || props.calculating || !confirmed || inventory.referenceResult) return;
    const generation = restorationGeneration.current;
    const timer = window.setTimeout(() => {
      const now = live.current;
      if (generation !== restorationGeneration.current || now.epoch !== epoch || restored.current !== epoch || now.props.calculating || !now.confirmed) return;
      save({ identity: inventory.identity, selected: current.selected,
        yardPallets: usingManualPackaging ? current.yardPallets : [] }, rawPlan.result,
      props.mode === 'boxes' ? undefined : snapshotSource);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [rawPlan, props.calculating, props.mode, confirmed, inventory.referenceResult, inventory.identity,
    current.selected, current.yardPallets, usingManualPackaging, snapshotSource, epoch, save]);

  const [portal, setPortal] = useState<Element | null>(null);
  useEffect(() => {
    const find = () => setPortal(previous => {
      const next = document.querySelector('[data-staging-summary-slot]'); return previous === next ? previous : next;
    });
    find(); const observer = new MutationObserver(find); observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  const bridge: StagingSceneBridge = { inventory, layout, visibleZoneIds, selectedUnitId: current.selected, view: current.view,
    viewRequest: current.viewRequest, dragging: current.dragging, preview: current.preview,
    flight: flights.sequence, completeFlight: flights.complete, motionEnabled: flights.enabled && !flights.reducedMotion,
    selectUnit, selectVehicleUnit, inspectUnit, inspectVehicleUnit,
    canManipulate: confirmed && !props.calculating && !packaging.busy && !flights.sequence && !inventory.referenceResult
      && (inventory.packagingStatus === 'ready' || inventory.packagingStatus === 'not-required'),
    setView, onDragStart, onDragMove: previewDrag, onDragEnd,
    onDraggingChange: dragging => update(value => ({ ...value, dragging, ...(!dragging ? { preview: null } : {}) })) };
  const message = [props.pendingProducts ? uiText('포장 미확정 제품 {0} EA · 포장 확정 후 실제 박스 수량이 표시됩니다.', [props.pendingProducts]) : '',
    packaging.error, current.message].filter(Boolean).join(' ');
  const panel = <StagingYardPanel inventory={inventory} layout={layout} selectedId={current.selected} view={current.view}
    visibleZoneIds={visibleZoneIds} zonePage={page} zonePageCount={pageCount}
    busy={props.calculating || packaging.busy} canUndo={current.history.length > 0}
    canLoad={confirmed && !props.calculating && !selected?.requiresPackaging} canWithdraw={confirmed && !props.calculating}
    message={message} preview={current.preview ?? undefined} onSelect={selectUnit} onLoad={loadSelected} onWithdraw={withdraw}
    flightEnabled={flights.enabled} flightReducedMotion={flights.reducedMotion} flightCount={flights.sequence?.flights.length ?? 0}
    onFlightEnabled={flights.setEnabled} onSkipFlight={flights.cancel}
    onUndo={undo} onView={setView}
    onZonePage={next => update(value => ({ ...value, page: Math.max(0, Math.min(pageCount - 1, next)),
      view: 'yard', viewRequest: value.viewRequest + 1 }))}
    onArrange={() => update(value => ({ ...value, arrange: value.arrange + 1, viewRequest: value.viewRequest + 1 }))}
    onPackagingDetails={() => { const id = selected?.cargoId ?? selected?.cargoIds[0]; if (id) openPackagingContents({ cargoId: id }); }} />;
  const inspected = inventory.units.find(unit => unit.id === current.inspected);
  return <StagingSceneContext.Provider value={bridge}>{props.children}
    {inspected?.pallet && !current.dragging && !flights.sequence && !props.calculating && <div className="staging-pallet-details">
      <PalletContents pallet={inspected.pallet} cargo={sourceCargo} modelKey={palletModelKey(inspected.palletSpec ?? spec)}
        onClose={() => update(value => ({ ...value, inspected: null }))} />
    </div>}
    {portal ? createPortal(panel, portal) : <aside className="staging-workspace-fallback" style={{ position: 'absolute', right: 12, bottom: 12,
      zIndex: 12, width: 'min(320px, calc(100% - 24px))', maxHeight: 'calc(100% - 24px)', overflow: 'auto' }}>{panel}</aside>}
  </StagingSceneContext.Provider>;
}
