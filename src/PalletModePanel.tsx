import { uiText, useUiLanguage } from './uiLanguage';
import type { LoadingViewerProps } from './LoadingViewer';
import PalletContents from './PalletContents';
import { palletModelKey } from './palletModel';
import { currentLoadingStrategy } from './loadingStrategyPreference';
import { useEffect, useMemo, useRef, useState } from 'react';
import { consumeNextPalletCenteredResultOverride } from './engine/palletCentering';
import { packOnPalletsAroundFixed } from './engine/palletFixedArrangement';
import { fixedPalletsFor, readStagingPins, stagingPinKeys } from './stagingPins';
import { validatePlacements } from './engine/constraints';
import { validateOperationalLoading } from './engine/operationalValidator';
import type { OptimizedPalletPackingResult, PalletLoad, PalletSpec } from './engine/palletOptimization';
import { packMixedMode, type MixedModePackingResult } from './engine/mixedModePacking';
import type { CargoItem, ContainerSpec, LoadingResult, Placement } from './engine/types';
import { INERTIA_CERTIFICATION_EVENT, clearLatestInertiaCertification, createPhysicsTargetSignature, readLatestInertiaCertification, type InertiaCertification, type SecuringUsage } from './inertiaCertification';
import { clearPhysicsTarget, publishPhysicsTarget, readPhysicsTarget } from './physicsTarget';
import { palletJobSpec, recordPalletJobSpec } from './palletJobSpecs';
import { resolvePalletType, subscribePalletTypeSelection } from './palletTypeSelection';
import { clearPalletSnapshot, publishPalletSnapshot, readPalletSnapshot } from './palletSnapshotStore';
import { FINAL_PHYSICS_VALIDATION_ERROR_EVENT } from './autoCertification';
import { palletAdvisoryFindings } from './engine/palletPlanValidation';
import { assessStagingRestore, rebuildStagingPalletResult } from './engine/stagingCommands';
import { recordDiagnosticTrace } from './runtimeDiagnostics';
import { readSecuringMaterialSettings } from './securingMaterialSettings';
import { STAGING_PALLET_PLAN_EVENT, STAGING_PALLET_READY_EVENT, sameStagingPalletSpec, stagingPalletSceneData, type StagingPalletPlanDetail } from './stagingPalletBridge';

export type PalletViewerScene = LoadingViewerProps & { inputKey: string };
type Props = { container: ContainerSpec; cargo: CargoItem[]; runToken: number; mode?: 'pallets' | 'mixed'; inputKey: string; onSceneChange: (scene: PalletViewerScene | null) => void; onRunningChange: (running: boolean) => void };

const PALLET_SPEC_FROM_RESULTS_EVENT = 'container-loading:pallet-spec-from-results';
const EMPTY_RESULT: OptimizedPalletPackingResult = { pallets: [], placements: [], remaining: [], palletCount: 0, loadedCargoWeightKg: 0, totalPackagingWeightKg: 0, avoidedPackagingWeightKg: 0, packagedPalletCount: 0, totalPalletizedWeightKg: 0, consolidatedPallets: 0, lateralImbalanceKg: 0, stackedPallets: 0, maxUsedStackLevel: 0, optimization: { selectedStackTarget: 0, candidateCount: 0, floorPositions: 0, redistributedForLowUtilization: false, consolidationPasses: 0 } };

function sanitizeSpec(spec: PalletSpec): PalletSpec {
  return {
    ...spec,
    length: Math.max(0.01, Number(spec.length) || 0.01),
    width: Math.max(0.01, Number(spec.width) || 0.01),
    height: Math.max(0.01, Number(spec.height) || 0.01),
    tareWeightKg: Math.max(0, Number(spec.tareWeightKg) || 0),
    maxLoadKg: Math.max(0, Number(spec.maxLoadKg) || 0),
    maxStackLevels: Math.max(1, Math.min(7, Math.floor(Number(spec.maxStackLevels) || 1))),
  };
}

function packForMode(container: ContainerSpec, cargo: CargoItem[], spec: PalletSpec, mode: 'pallets' | 'mixed', fixed: readonly PalletLoad[] = []) {
  const strategy = currentLoadingStrategy();
  if (mode === 'mixed') return packMixedMode(container, cargo, spec, strategy);
  return packOnPalletsAroundFixed(container, cargo, spec, strategy, fixed);
}

function palletForPlacement(result: OptimizedPalletPackingResult, box: Placement) {
  return result.pallets.find((pallet) => pallet.cargoPlacements.includes(box) || pallet.cargoPlacements.some((candidate) =>
    Math.abs(candidate.x - box.x) < 1e-6 &&
    Math.abs(candidate.y - box.y) < 1e-6 &&
    Math.abs(candidate.z - box.z) < 1e-6 &&
    candidate.cargoId === box.cargoId,
  ));
}

function clearanceValues(container: ContainerSpec, placements: Placement[]) {
  if (!placements.length) return null;
  const mm = (value: number) => `${Math.max(0, Math.round(value * 1000)).toLocaleString()} mm`;
  return { back: mm(Math.min(...placements.map(p => p.x))), door: mm(container.length - Math.max(...placements.map(p => p.x + p.length))), left: mm(Math.min(...placements.map(p => p.y))), right: mm(container.width - Math.max(...placements.map(p => p.y + p.width))), top: mm(container.height - Math.max(...placements.map(p => p.z + p.height))) };
}

export default function PalletModePanel({ container, cargo, runToken, mode = 'pallets', inputKey, onSceneChange, onRunningChange }: Props) {
  useUiLanguage();
  const [spec, setSpec] = useState<PalletSpec>(() => palletJobSpec(resolvePalletType()));
  const [calculated, setCalculated] = useState<{ key: string; result: OptimizedPalletPackingResult | MixedModePackingResult } | null>(null);
  const result = (calculated?.key === inputKey ? calculated.result : EMPTY_RESULT) as OptimizedPalletPackingResult | MixedModePackingResult;
  const currentPallets = useRef<readonly PalletLoad[]>(result.pallets); currentPallets.current = result.pallets;
  const [specRunToken, setSpecRunToken] = useState(0);
  // Counts calculations that delivered a result. It is set together with that result, so
  // the commit that shows the result is also the one that reports the run as finished.
  const [finishedRuns, setFinishedRuns] = useState(0);
  const consumedRun = useRef({ run: 0, spec: 0 });
  const cancelActiveRun = useRef<(() => void) | null>(null);
  const adoptedResult = useRef<{ result: OptimizedPalletPackingResult; certification: InertiaCertification } | null>(null);
  const [opened, setOpened] = useState<PalletLoad | null>(null);
  const modelKey = palletModelKey(spec);
  const [certification, setCertification] = useState<InertiaCertification | null>(() => {
    const latest = readLatestInertiaCertification();
    return latest?.mode === 'pallets' ? latest : null;
  });

  useEffect(() => {
    const previous = consumedRun.current;
    consumedRun.current = { run: runToken, spec: specRunToken };
    const requested = (runToken !== previous.run && runToken > 0) || specRunToken !== previous.spec;
    if (!requested) return;
    adoptedResult.current = null;
    let cancelled = false;
    let publishTimer: number | undefined;
    // The pallet path publishes no loading-result event, so the diagnostic trace would
    // otherwise show no outcome (and a wrong duration) for a pallet calculation.
    const startedAt = performance.now();
    // Pallets the operator put in place by hand stay there; the rest is planned around
    // them. They are read from the plan on screen at the moment automatic loading is
    // asked for. A changed pallet specification plans everything afresh: the pallets on
    // screen were built to the old one.
    const fixed = mode === 'pallets' && specRunToken === previous.spec ? fixedPalletsFor(stagingPinKeys(readStagingPins(), inputKey), currentPallets.current) : [];
    const recordOutcome = (packed?: OptimizedPalletPackingResult | MixedModePackingResult, error?: string) => recordDiagnosticTrace('pallet-loading-result', {
      mode,
      fixedPallets: fixed.length,
      placements: packed?.placements.length ?? 0,
      pallets: packed?.palletCount ?? 0,
      remainingUnits: packed?.remaining.reduce((sum, row) => sum + row.quantity, 0) ?? 0,
      durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
      ...(error ? { error } : {}),
    });
    if (typeof Worker !== 'undefined') {
      const worker = new Worker(new URL('./engine/palletRules.worker.ts', import.meta.url), {type:'module'});
      const cancel = () => { cancelled = true; worker.terminate(); };
      cancelActiveRun.current = cancel;
      worker.onmessage = (event: MessageEvent<{result?:OptimizedPalletPackingResult | MixedModePackingResult;error?:string}>) => {
        worker.terminate();
        if(cancelled)return;
        recordOutcome(event.data.result, event.data.error);
        // With a result, "running" ends in the commit that publishes the scene (below).
        if(event.data.result) { setCalculated({key:inputKey,result:event.data.result}); setFinishedRuns(count => count + 1); }
        else { onRunningChange(false); window.dispatchEvent(new CustomEvent(FINAL_PHYSICS_VALIDATION_ERROR_EVENT,{detail:{mode:'pallets',error:event.data.error}})); }
      };
      worker.onerror = () => { worker.terminate(); if(!cancelled){onRunningChange(false);window.dispatchEvent(new CustomEvent(FINAL_PHYSICS_VALIDATION_ERROR_EVENT,{detail:{mode:'pallets',error:'A 규칙 계산 오류'}}));} };
      worker.postMessage({container,cargo:cargo.filter(item=>item.quantity>0),spec:sanitizeSpec(spec),mode,strategy:currentLoadingStrategy(),fixed});
      return () => { cancel(); if (cancelActiveRun.current === cancel) cancelActiveRun.current = null; };
    }
    const timer = window.setTimeout(() => {
      try {
        const packed = packForMode(container, cargo.filter(item => item.quantity > 0), sanitizeSpec(spec), mode, fixed);
        recordOutcome(packed);
        // Yield before publication so queued edits can cancel the obsolete run.
        publishTimer = window.setTimeout(() => {
          if (!cancelled) { setCalculated({ key: inputKey, result: packed }); setFinishedRuns(count => count + 1); }
        }, 0);
      } catch (error) {
        if (!cancelled) {
          onRunningChange(false);
          window.dispatchEvent(new CustomEvent(FINAL_PHYSICS_VALIDATION_ERROR_EVENT, { detail: { mode: 'pallets', error: String(error) } }));
        }
      }
    }, 0);
    const cancel = () => { cancelled = true; window.clearTimeout(timer); window.clearTimeout(publishTimer); };
    cancelActiveRun.current = cancel;
    return () => { cancel(); if (cancelActiveRun.current === cancel) cancelActiveRun.current = null; };
  }, [runToken, specRunToken, inputKey, spec]);

  useEffect(() => {
    adoptedResult.current = null;
    setOpened(null);
    setCertification(null);
    setCalculated(null);
    clearPalletSnapshot();
    onSceneChange(null);
    return () => { clearPalletSnapshot(); clearPhysicsTarget('pallets'); };
  }, [inputKey, onSceneChange]);

  useEffect(() => {
    const onSpecFromResults = (event: Event) => {
      const requested = (event as CustomEvent<PalletSpec>).detail;
      if (!requested) return;
      const safe = sanitizeSpec(requested);
      recordPalletJobSpec(resolvePalletType().id, safe);
      const snapshot = readPalletSnapshot();
      const target = readPhysicsTarget();
      const certified = readLatestInertiaCertification();
      const applied = consumeNextPalletCenteredResultOverride();
      // Adaptive report optimization already publishes this exact certified target.
      // Its caller may open a result/report synchronously after this event returns.
      if (snapshot && applied === snapshot.result && target?.mode === 'pallets' && certified?.mode === 'pallets'
        && JSON.stringify(snapshot.spec) === JSON.stringify(requested)
        && JSON.stringify(target.container) === JSON.stringify(container)
        && JSON.stringify(target.cargo) === JSON.stringify(cargo)
        && createPhysicsTargetSignature(target) === certified.targetSignature) {
        adoptedResult.current = { result: snapshot.result, certification: certified };
        setSpec(safe); setCalculated({ key: inputKey, result: snapshot.result });
        setCertification(certified); setOpened(null); onRunningChange(false);
        return;
      }
      adoptedResult.current = null;
      setSpec(safe);
      setCalculated(null);
      onSceneChange(null);
      clearPalletSnapshot();
      clearPhysicsTarget('pallets');
      setSpecRunToken(token => token + 1);
      setOpened(null);
      setCertification(null);
    };
    window.addEventListener(PALLET_SPEC_FROM_RESULTS_EVENT, onSpecFromResults);
    return () => window.removeEventListener(PALLET_SPEC_FROM_RESULTS_EVENT, onSpecFromResults);
  }, [container, cargo, mode, inputKey, onRunningChange]);

  // Follow the pallet product chosen (or recommended) in the loading-method step.
  useEffect(() => {
    let currentId = resolvePalletType().id;
    return subscribePalletTypeSelection(() => {
      const type = resolvePalletType();
      if (type.id === currentId) return;
      currentId = type.id;
      const next = sanitizeSpec(palletJobSpec(type));
      setSpec(next);
      setCalculated(null);
      clearPalletSnapshot();
      onSceneChange(null);
      clearPhysicsTarget('pallets');
      setOpened(null);
      setCertification(null);
    });
  }, [container, cargo, mode]);

  useEffect(() => {
    const onCertification = (event: Event) => {
      const next = (event as CustomEvent<InertiaCertification | undefined>).detail;
      setCertification(next?.mode === 'pallets' ? next : null);
    };
    window.addEventListener(INERTIA_CERTIFICATION_EVENT, onCertification);
    return () => window.removeEventListener(INERTIA_CERTIFICATION_EVENT, onCertification);
  }, []);

  useEffect(() => {
    if (result === EMPTY_RESULT) return;
    publishPalletSnapshot({ spec, result }, { preserveCertification: adoptedResult.current?.result === result });
  }, [spec, result]);

  useEffect(() => {
    if (result === EMPTY_RESULT) return;
    if (adoptedResult.current?.result === result) { setCertification(adoptedResult.current.certification); return; }
    setCertification(null);
    const supports = result.pallets.map((pallet) => ({
      modelKey,
      id: `PALLET-${String(pallet.palletIndex).padStart(2, '0')}`,
      x: pallet.x,
      y: pallet.y,
      z: pallet.z,
      length: pallet.length,
      width: pallet.width,
      height: pallet.height,
      weightKg: Math.max(0.01, pallet.totalWeightKg - pallet.cargoWeightKg),
      dynamic: true,
      unitCenterOfGravity: pallet.centerOfGravity,
      unitHeightM: Math.max(pallet.height,...pallet.cargoPlacements.map(p=>p.z+p.height-pallet.z))+pallet.packagingExtraHeightM,
    }));
    const loadingResult: LoadingResult = {
      ruleset:container.rules?.version,
      placements: result.placements,
      remaining: result.remaining,
      loadedWeightKg: 'mixed' in result ? result.mixed.totalLoadedWeightKg : result.totalPalletizedWeightKg,
      usedVolumeM3: result.placements.reduce((sum, placement) => sum + placement.length * placement.width * placement.height, 0),
      validationIssues: validatePlacements(container, result.placements),
      operationalFindings: [...validateOperationalLoading(container, cargo, result.placements, supports), ...palletAdvisoryFindings(container, result, spec)],
      ...('securingBudget' in result ? { securingBudget: result.securingBudget as LoadingResult['securingBudget'] } : {}),
    };
    publishPhysicsTarget({ mode: 'pallets', container, cargo, result: loadingResult, supports });
  }, [container, cargo, result, modelKey]);

  const clearances = useMemo(() => clearanceValues(container, result.placements), [container, result.placements]);
  const actualStacking = useMemo(() => {
    const key = (box: Placement) => JSON.stringify([box.cargoId, Math.round(box.x * 1e6), Math.round(box.y * 1e6), Math.round(box.z * 1e6)]);
    // Centering may clone pallet cartons into result.placements. Match coordinates
    // rather than object identity so upper pallets are not counted again as loose tiers.
    const palletCartons = new Set(result.pallets.flatMap(pallet => pallet.cargoPlacements.map(key)));
    const looseTiers = new Set(result.placements.filter(box => !palletCartons.has(key(box))).map(box => Math.round(box.z * 1e6)));
    return {
      palletLevels: Math.max(0, ...result.pallets.map(pallet => pallet.stackLevel)),
      cartonTiers: Math.max(looseTiers.size, ...result.pallets.map(pallet => new Set(pallet.cargoPlacements
        .map(box => Math.round((box.z - pallet.z - pallet.height) * 1e6))).size)),
      floorPositions: new Set(result.pallets.filter(pallet => pallet.stackLevel === 1 && Math.abs(pallet.z) <= 1e-6)
        .map(pallet => `${Math.round(pallet.x * 1e6)}:${Math.round(pallet.y * 1e6)}`)).size,
    };
  }, [result.pallets, result.placements]);
  const actualStackingText = uiText("팔레트 {0}단 · 상자 최대 {1}단 · 바닥 {2}열",
    [actualStacking.palletLevels, actualStacking.cartonTiers, actualStacking.floorPositions]);
  const securingUsage = certification?.securing ?? null;
  const scene = useMemo(() => stagingPalletSceneData(container, cargo, { spec, result }), [container, cargo, result, spec]);

  useEffect(() => {
    const onStagingPlan = (event: Event) => {
      const detail = (event as CustomEvent<StagingPalletPlanDetail>).detail;
      if (!detail || detail.accepted || detail.inputKey !== inputKey) return;
      const requested = detail.snapshot;
      if (!requested?.spec || !requested.result || !Array.isArray(requested.result.placements)
        || !Array.isArray(requested.result.pallets) || !Array.isArray(requested.result.remaining)) return;
      const currentSpec = palletJobSpec(resolvePalletType());
      if (!sameStagingPalletSpec(requested.spec, currentSpec)) {
        detail.reasons = ['현재 선택한 파렛트 작업 규격과 일치하지 않습니다.']; return;
      }
      if ((mode === 'mixed') !== ('mixed' in requested.result)) {
        detail.reasons = ['현재 적재 모드와 일치하지 않습니다.']; return;
      }
      try {
        const requestedScene = stagingPalletSceneData(container, cargo, requested);
        const checked = assessStagingRestore({ container, cargo, result: scene.result, pallets: result.pallets,
          palletSpec: currentSpec, mode, materials: readSecuringMaterialSettings(), strategy: currentLoadingStrategy() },
        { result: requestedScene.result, pallets: requested.result.pallets });
        if (!checked.valid) { detail.reasons = checked.reasons; return; }
        const next = rebuildStagingPalletResult(requested.result, checked.result, checked.pallets, container);
        // Cancel the owning automatic run synchronously; even a queued callback
        // must not overwrite this explicitly accepted current-input plan.
        cancelActiveRun.current?.(); cancelActiveRun.current = null;
        adoptedResult.current = null;
        recordPalletJobSpec(resolvePalletType().id, requested.spec);
        setSpec(requested.spec); setCalculated({ key: inputKey, result: next });
        setOpened(null); setCertification(null); clearLatestInertiaCertification();
        onRunningChange(false);
        detail.accepted = true;
      } catch {
        detail.reasons = ['현재 조건으로 파렛트 계획을 적용하지 못했습니다.'];
      }
    };
    window.addEventListener(STAGING_PALLET_PLAN_EVENT, onStagingPlan);
    return () => window.removeEventListener(STAGING_PALLET_PLAN_EVENT, onStagingPlan);
  }, [container, cargo, inputKey, mode, result, scene, onRunningChange]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent(STAGING_PALLET_READY_EVENT, { detail: { inputKey } }));
  }, [inputKey]);

  useEffect(() => {
    if (result === EMPTY_RESULT) return;
    onSceneChange({ container, cargo, ...scene, inputKey,
      title: mode === 'mixed' ? '박스 + 팔레트 혼합 적재' : '팔레트 적재',
      onSupportSelect: index => setOpened(result.pallets[index] ?? null),
      onCargoSelect: index => setOpened(palletForPlacement(result, result.placements[index]) ?? null),
    });
  }, [container, cargo, scene, result, mode, inputKey, onSceneChange]);

  // Declared after the scene effect on purpose. The staging yard starts its yard-to-vehicle
  // flight only when "calculating" falls together with a newly accepted plan; a run that
  // reported its end one commit before its scene looked like a cancelled calculation and
  // the pallets simply appeared in the vehicle. Both now reach the owner in one update.
  useEffect(() => {
    if (finishedRuns > 0) onRunningChange(false);
  }, [finishedRuns, onRunningChange]);

  if (result === EMPTY_RESULT) return null;
  return (
    <div className="pallet-inline-workspace pallet-scene-overlays">
      <section className="pallet-mode-panel pallet-mode-panel-inline">
        <div className="pallet-view-stack">
          <div className="pallet-preview">
            <div className="pallet-info-dock" aria-label={uiText("팔레트 적재 정보")}>
              <div className="pallet-dock-summary">
                <b className="dock-label">{uiText("적재 요약")}</b>
                <span>{uiText("팔레트")}{' '}<b>{result.palletCount}</b></span>
                <span>{uiText("화물")}{' '}<b>{result.placements.length} EA</b></span>
                <span>{uiText("중량")}{' '}<b>{result.totalPalletizedWeightKg.toFixed(0)} kg</b></span>
                <span className="pallet-actual-stacking"><b>{actualStackingText}</b></span>
              </div>
              {clearances && (
                <div className="reference-clearance-strip">
                  <b className="dock-label">{uiText("여유 공간")}</b>
                  <span>{uiText("안쪽")}{' '}<b>{clearances.back}</b></span>
                  <span>{uiText("문쪽")}{' '}<b>{clearances.door}</b></span>
                  <span>{uiText("좌측")}{' '}<b>{clearances.left}</b></span>
                  <span>{uiText("우측")}{' '}<b>{clearances.right}</b></span>
                  <span>{uiText("천장")}{' '}<b>{clearances.top}</b></span>
                </div>
              )}
              {securingUsage && securingUsage.level > 0 && <div className="pallet-securing-strip">
                <b className="dock-label">{uiText("관성 보강 적용")}</b>
                <span>{uiText("밴딩 {0}줄", [securingUsage.bandingStraps])}</span>
                <span>{uiText("각대 {0}EA", [securingUsage.cornerGuards])}</span>
                <span>{uiText("랩핑 {0}m", [securingUsage.wrappingLengthM.toFixed(0)])}</span>
                <span>{uiText("미끄럼방지 {0}EA", [securingUsage.antiSlipMats])}</span>
                {securingUsage.loadBars > 0 && <span>{uiText("고정바 {0}EA", [securingUsage.loadBars])}</span>}
              </div>}
            </div>
            {opened && <PalletContents pallet={opened} cargo={cargo} modelKey={modelKey} onClose={() => setOpened(null)} />}
          </div>
        </div>
        <div className="pallet-metrics">
          <div><span>{uiText("사용 팔레트")}</span><strong>{result.palletCount}</strong></div>
          <div><span>{uiText("적재 화물")}</span><strong>{result.placements.length} EA</strong></div>
          {'mixed' in result && <div><span>{uiText("직접 적재 박스")}</span><strong>{result.mixed.directBoxCount} EA</strong></div>}
          {'mixed' in result && <div><span>{uiText("혼합 절감 팔레트")}</span><strong>{result.mixed.demotedPalletCount}</strong></div>}
          <div><span>{uiText("적층 팔레트")}</span><strong>{result.stackedPallets}</strong></div>
          <div><span>{uiText("총 팔레트화 중량")}</span><strong>{result.totalPalletizedWeightKg.toFixed(0)} kg</strong></div>
          <div><span>{uiText("적재 단수")}</span><strong>{actualStackingText}</strong></div>
          <div><span>{uiText("재배치 / 병합")}</span><strong>{uiText("{0} · {1}회", [result.optimization.redistributedForLowUtilization ? uiText('균등분산') : uiText('기본배치'), result.optimization.consolidationPasses])}</strong></div>
          <div><span>{uiText("관성 보강")}</span><strong>{securingUsage ? uiText(securingUsage.levelLabel) : uiText("결과 보기 전 검증")}</strong></div>
          <div><span>{uiText("보조자재 중량")}</span><strong>{securingUsage ? uiText("약 {0} kg", [securingUsage.estimatedNonCargoWeightKg.toFixed(1)]) : '-'}</strong></div>
        </div>
      </section>
    </div>
  );
}
