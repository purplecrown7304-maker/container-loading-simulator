import LoadingViewer, { type LoadingViewerProps } from './LoadingViewer';
import { palletModelKey } from './palletModel';
import { readLoadingStrategyPreference } from './loadingStrategyPreference';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cargoColor } from './cargoColors';
import { centerPalletCargo, consumeNextPalletCenteredResultOverride } from './engine/palletCentering';
import { validatePlacements } from './engine/constraints';
import { defaultPalletSpec, packOnPallets, type OptimizedPalletPackingResult, type PalletLoad, type PalletSpec } from './engine/palletOptimization';
import { packMixedMode, type MixedModePackingResult } from './engine/mixedModePacking';
import type { CargoItem, ContainerSpec, LoadingResult, Placement } from './engine/types';
import { INERTIA_CERTIFICATION_EVENT, createPhysicsTargetSignature, readLatestInertiaCertification, type InertiaCertification, type SecuringUsage } from './inertiaCertification';
import { clearPhysicsTarget, publishPhysicsTarget, readPhysicsTarget } from './physicsTarget';
import { palletSpecForType } from './engine/palletCatalog';
import { resolvePalletType, subscribePalletTypeSelection } from './palletTypeSelection';
import { clearPalletSnapshot, publishPalletSnapshot, readPalletSnapshot } from './palletSnapshotStore';
import { FINAL_PHYSICS_VALIDATION_ERROR_EVENT } from './autoCertification';

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

function packForMode(container: ContainerSpec, cargo: CargoItem[], spec: PalletSpec, mode: 'pallets' | 'mixed') {
  const strategy = readLoadingStrategyPreference() ?? 'capacity';
  if (mode === 'mixed') return packMixedMode(container, cargo, spec, strategy);
  return centerPalletCargo(packOnPallets(container, cargo, spec, strategy), container);
}

function palletForPlacement(result: OptimizedPalletPackingResult, box: Placement) {
  return result.pallets.find((pallet) => pallet.cargoPlacements.includes(box) || pallet.cargoPlacements.some((candidate) =>
    Math.abs(candidate.x - box.x) < 1e-6 &&
    Math.abs(candidate.y - box.y) < 1e-6 &&
    Math.abs(candidate.z - box.z) < 1e-6 &&
    candidate.cargoId === box.cargoId,
  ));
}

function PalletMiniPreview({ pallet, modelKey }: { pallet: PalletLoad; modelKey: ReturnType<typeof palletModelKey> }) {
  const scene = useMemo(() => {
    const placements = pallet.cargoPlacements.map(box => ({ ...box, x: box.x - pallet.x, y: box.y - pallet.y, z: box.z - pallet.z }));
    return {
      container: { length: pallet.length, width: pallet.width, height: Math.max(pallet.height, ...placements.map(box => box.z + box.height)), maxPayloadKg: pallet.totalWeightKg },
      result: { placements, remaining: [], validationIssues: [], usedVolumeM3: 0, loadedWeightKg: pallet.cargoWeightKg },
      supports: [{ modelKey, id: `PALLET-${pallet.palletIndex}`, x: 0, y: 0, z: 0, length: pallet.length, width: pallet.width, height: pallet.height, weightKg: pallet.totalWeightKg - pallet.cargoWeightKg }],
    };
  }, [pallet, modelKey]);
  return <div className="pallet-mini-canvas"><LoadingViewer {...scene} geometry="platform" preview compact showCg={false} title={`팔레트 ${pallet.palletIndex} 상세`} /></div>;
}

function clearanceValues(container: ContainerSpec, placements: Placement[]) {
  if (!placements.length) return null;
  const mm = (value: number) => `${Math.max(0, Math.round(value * 1000)).toLocaleString()} mm`;
  return { back: mm(Math.min(...placements.map(p => p.x))), door: mm(container.length - Math.max(...placements.map(p => p.x + p.length))), left: mm(Math.min(...placements.map(p => p.y))), right: mm(container.width - Math.max(...placements.map(p => p.y + p.width))), top: mm(container.height - Math.max(...placements.map(p => p.z + p.height))) };
}

function PalletContents({ pallet, cargo, onClose, modelKey }: { pallet: PalletLoad; cargo: CargoItem[]; onClose: () => void; modelKey: ReturnType<typeof palletModelKey> }) {
  const groups = useMemo(() => {
    const map = new Map<string, number>();
    pallet.cargoPlacements.forEach((box) => map.set(box.cargoId, (map.get(box.cargoId) ?? 0) + 1));
    return [...map.entries()];
  }, [pallet]);
  const maxTop = Math.max(pallet.z, ...pallet.cargoPlacements.map((box) => box.z + box.height));

  return (
    <div className="pallet-content-popover" onContextMenu={(event) => event.preventDefault()}>
      <header>
        <div>
          <b>AUTO-PALLET-{String(pallet.palletIndex).padStart(2, '0')} 적재 정보</b>
          <small>{pallet.stackColumn}열 · {pallet.stackLevel}단</small>
        </div>
        <button onClick={onClose}>×</button>
      </header>
      <div className="pallet-content-metrics">
        <div><span>총 적재수량</span><strong>{pallet.cargoPlacements.length} EA</strong></div>
        <div><span>총중량</span><strong>{pallet.totalWeightKg.toFixed(0)} kg</strong></div>
        <div><span>팔레트 규격</span><strong>{Math.round(pallet.length * 1000)}×{Math.round(pallet.width * 1000)}</strong></div>
        <div><span>적재 높이</span><strong>{Math.round((maxTop - pallet.z) * 1000)} mm</strong></div>
      </div>
      <PalletMiniPreview pallet={pallet} modelKey={modelKey} />
      <h4>팔레트 속 내용</h4>
      <div className="pallet-content-list">
        {groups.map(([id, count]) => {
          const item = cargo.find((candidate) => candidate.id === id);
          return (
            <article key={id}>
              <i style={{ background: cargoColor(id) }} />
              <div>
                <b>{id} {item?.name ?? ''}</b>
                <small>{item ? `${Math.round(item.length * 1000)}×${Math.round(item.width * 1000)}×${Math.round(item.height * 1000)} mm · ${item.weightKg}kg` : ''}</small>
              </div>
              <strong>{count} EA</strong>
            </article>
          );
        })}
      </div>
      <div className="pallet-content-foot">
        <span>화물중량 {pallet.cargoWeightKg.toFixed(0)}kg</span>
        <span>팔레트/포장 {Math.max(0, pallet.totalWeightKg - pallet.cargoWeightKg).toFixed(1)}kg</span>
      </div>
    </div>
  );
}

export default function PalletModePanel({ container, cargo, runToken, mode = 'pallets', inputKey, onSceneChange, onRunningChange }: Props) {
  const [spec, setSpec] = useState<PalletSpec>(() => palletSpecForType(resolvePalletType(), defaultPalletSpec));
  const [calculated, setCalculated] = useState<{ key: string; result: OptimizedPalletPackingResult | MixedModePackingResult } | null>(null);
  const result = (calculated?.key === inputKey ? calculated.result : EMPTY_RESULT) as OptimizedPalletPackingResult | MixedModePackingResult;
  const [specRunToken, setSpecRunToken] = useState(0);
  const consumedRun = useRef({ run: 0, spec: 0 });
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
    const timer = window.setTimeout(() => {
      try {
        const packed = packForMode(container, cargo.filter(item => item.quantity > 0), sanitizeSpec(spec), mode);
        // Yield before publication so queued edits can cancel the obsolete run.
        publishTimer = window.setTimeout(() => {
          if (!cancelled) { setCalculated({ key: inputKey, result: packed }); onRunningChange(false); }
        }, 0);
      } catch (error) {
        if (!cancelled) {
          onRunningChange(false);
          window.dispatchEvent(new CustomEvent(FINAL_PHYSICS_VALIDATION_ERROR_EVENT, { detail: { mode: 'pallets', error: String(error) } }));
        }
      }
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); window.clearTimeout(publishTimer); };
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

  const specRef = useRef(spec);
  specRef.current = spec;

  // Follow the pallet product chosen (or recommended) in the loading-method step.
  useEffect(() => {
    let currentId = resolvePalletType().id;
    return subscribePalletTypeSelection(() => {
      const type = resolvePalletType();
      if (type.id === currentId) return;
      currentId = type.id;
      const next = sanitizeSpec(palletSpecForType(type, specRef.current));
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
    const loadingResult: LoadingResult = {
      placements: result.placements,
      remaining: result.remaining,
      loadedWeightKg: 'mixed' in result ? result.mixed.totalLoadedWeightKg : result.totalPalletizedWeightKg,
      usedVolumeM3: result.placements.reduce((sum, placement) => sum + placement.length * placement.width * placement.height, 0),
      validationIssues: validatePlacements(container, result.placements),
    };
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
    }));
    publishPhysicsTarget({ mode: 'pallets', container, cargo, result: loadingResult, supports });
  }, [container, cargo, result, modelKey]);

  const clearances = useMemo(() => clearanceValues(container, result.placements), [container, result.placements]);
  const securingUsage = certification?.securing ?? null;
  const scene = useMemo(() => ({
    result: { placements: result.placements, remaining: result.remaining, loadedWeightKg: 'mixed' in result ? result.mixed.totalLoadedWeightKg : result.totalPalletizedWeightKg, usedVolumeM3: result.placements.reduce((sum, p) => sum + p.length * p.width * p.height, 0), validationIssues: validatePlacements(container, result.placements) },
    supports: result.pallets.map(p => ({ modelKey, id: `PALLET-${p.palletIndex}`, x: p.x, y: p.y, z: p.z, length: p.length, width: p.width, height: p.height, weightKg: Math.max(.01, p.totalWeightKg - p.cargoWeightKg) })),
  }), [container, result, modelKey]);

  useEffect(() => {
    if (result === EMPTY_RESULT) return;
    onSceneChange({ container, cargo, ...scene, inputKey,
      title: mode === 'mixed' ? '박스 + 팔레트 혼합 적재' : '팔레트 적재',
      onSupportSelect: index => setOpened(result.pallets[index] ?? null),
      onCargoSelect: index => setOpened(palletForPlacement(result, result.placements[index]) ?? null),
    });
  }, [container, cargo, scene, result, mode, inputKey, onSceneChange]);

  if (result === EMPTY_RESULT) return null;
  return (
    <div className="pallet-inline-workspace pallet-scene-overlays">
      <section className="pallet-mode-panel pallet-mode-panel-inline">
        <div className="pallet-view-stack">
          <div className="pallet-preview">
            {securingUsage && securingUsage.level > 0 && <div className="pallet-securing-strip">
              <b>관성 보강 적용</b>
              <span>밴딩 {securingUsage.bandingStraps}줄</span>
              <span>각대 {securingUsage.cornerGuards}EA</span>
              <span>랩핑 {securingUsage.wrappingLengthM.toFixed(0)}m</span>
              <span>미끄럼방지 {securingUsage.antiSlipMats}EA</span>
              {securingUsage.loadBars > 0 && <span>고정바 {securingUsage.loadBars}EA</span>}
            </div>}
            {clearances && (
              <div className="reference-clearance-strip">
                <span>안쪽 <b>{clearances.back}</b></span>
                <span>문쪽 <b>{clearances.door}</b></span>
                <span>좌측 <b>{clearances.left}</b></span>
                <span>우측 <b>{clearances.right}</b></span>
                <span>천장 <b>{clearances.top}</b></span>
              </div>
            )}
            {opened && <PalletContents pallet={opened} cargo={cargo} modelKey={modelKey} onClose={() => setOpened(null)} />}
          </div>
        </div>
        <div className="pallet-metrics">
          <div><span>사용 팔레트</span><strong>{result.palletCount}</strong></div>
          <div><span>적재 화물</span><strong>{result.placements.length} EA</strong></div>
          {'mixed' in result && <div><span>직접 적재 박스</span><strong>{result.mixed.directBoxCount} EA</strong></div>}
          {'mixed' in result && <div><span>혼합 절감 팔레트</span><strong>{result.mixed.demotedPalletCount}</strong></div>}
          <div><span>적층 팔레트</span><strong>{result.stackedPallets}</strong></div>
          <div><span>총 팔레트화 중량</span><strong>{result.totalPalletizedWeightKg.toFixed(0)} kg</strong></div>
          <div><span>전역 최적화</span><strong>{result.optimization.selectedStackTarget}단 후보 · 바닥 {result.optimization.floorPositions}열</strong></div>
          <div><span>재배치 / 병합</span><strong>{result.optimization.redistributedForLowUtilization ? '균등분산' : '기본배치'} · {result.optimization.consolidationPasses}회</strong></div>
          <div><span>관성 보강</span><strong>{securingUsage?.levelLabel ?? '결과 보기 전 검증'}</strong></div>
          <div><span>보조자재 중량</span><strong>{securingUsage ? `약 ${securingUsage.estimatedNonCargoWeightKg.toFixed(1)} kg` : '-'}</strong></div>
        </div>
      </section>
    </div>
  );
}
