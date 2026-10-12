import { isAdminSession } from './adminAccess';
import { readFinalPhysicsValidation } from './autoCertification';
import { analyzeConstraints, type ConstraintCheck } from './engine/constraintAnalysis';
import { analyzeFloorLoad } from './engine/floorLoad';
import type { PhysicsSupport } from './engine/physicsValidation';
import { assessPlacementSupport, CONTACT_TOLERANCE_M, MIN_SUPPORT_RATIO, supportContactArea } from './engine/support';
import { aConfig, isARules } from './engine/loadingRuleset';
import { toAPlacements } from './engine/loadSimAdapter';
import { DEFAULT_CONFIG as DEFAULT_A_CONFIG } from './engine/loadSimA/presets';
import { checkSupport as checkASupport, itemCg, propagateLoads, supportersOf as aSupportersOf } from './engine/loadSimA/validate';
import type { CargoItem, ContainerSpec, LoadingResult, Placement } from './engine/types';
import { assessWeightBalance } from './engine/weightBalance';
import { readEnterprisePackagingPlannerState } from './enterprisePackagingPlannerStore';
import { createPhysicsTargetSignature, readLatestInertiaCertification } from './inertiaCertification';
import { readLocalOperator } from './localOperator';
import { readProductSelection } from './productWorkflow';
import { readPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { readShipmentInstructionSnapshot } from './shipmentInstruction';
import { readTransportEquipment, type TransportEquipment } from './transportEquipment';
import { readDiagnosticTrace, runtimeSnapshot } from './runtimeDiagnostics';
import { cartonStrengthChecks } from './cargoStackRestrictions';
import { readPalletSnapshot } from './palletSnapshotStore';
import { physicsTargetFromPalletSnapshot } from './certifiedExport';
import { readLoadingStrategyPreference } from './loadingStrategyPreference';

export type DiagnosticSeverity = 'OK' | 'WARNING' | 'CRITICAL';
export type DiagnosticCheck = {
  id: string;
  label: string;
  severity: DiagnosticSeverity;
  detail: string;
  expected?: unknown;
  actual?: unknown;
};

const EPS = 1e-7;

function severityRank(value: DiagnosticSeverity) {
  return value === 'CRITICAL' ? 2 : value === 'WARNING' ? 1 : 0;
}

function maxSeverity(checks: DiagnosticCheck[]): DiagnosticSeverity {
  return checks.reduce<DiagnosticSeverity>((current, item) => severityRank(item.severity) > severityRank(current) ? item.severity : current, 'OK');
}

function overlap1d(a0: number, a1: number, b0: number, b1: number) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

export function equipmentAwareConstraints(
  equipment: TransportEquipment,
  container: ContainerSpec,
  cargo: CargoItem[],
  result: LoadingResult,
): ConstraintCheck[] {
  const floor = analyzeFloorLoad(container, result, 12, 4);
  const checks = analyzeConstraints(container, cargo, result, floor);
  if (equipment.geometry === 'flat-rack' || equipment.geometry === 'platform') {
    return checks.filter(item => item.id !== 'door' && item.id !== 'doorSpace');
  }
  return checks;
}

/** Diagnostic margins are warnings, separate from the selected engine's hard rules. */
const SUPPORT_WARNING_RATIO = 0.95;
const OVERHANG_WARNING_M = 0.02;

export function buildStackAnalysis(
  cargo: CargoItem[],
  result: LoadingResult,
  supports: PhysicsSupport[] = [],
  container?: ContainerSpec,
) {
  const cargoMap = new Map(cargo.map(item => [item.id, item]));
  const placements = result.placements;
  const bodies: Placement[] = [...placements, ...supports.map(support => ({ ...support, cargoId: support.id }))];
  const useARules = container ? isARules(container) : result.ruleset === 'a-v1';
  const config = useARules ? (container ? aConfig(container) : DEFAULT_A_CONFIG) : undefined;
  const contactToleranceM = config ? config.heightTolerance / 1000 : CONTACT_TOLERANCE_M;
  const minimumSupportRatio = config?.minSupportRatio ?? MIN_SUPPORT_RATIO;
  // Use A's oriented geometry, CG offsets and configured tolerances only on its path.
  const aBodies = config ? [
    ...toAPlacements(cargo, placements.map((placement, index) => ({ ...placement, unitId: `diagnostic:${index}` }))),
    ...toAPlacements([], bodies.slice(placements.length).map((placement, index) => ({ ...placement, unitId: `diagnostic-support:${index}` }))),
  ] : undefined;
  const aContacts = aBodies && config ? aSupportersOf(aBodies, config) : undefined;
  const aSupportFailures = new Set(aBodies && config
    ? checkASupport(aBodies, config).flatMap(finding => finding.itemIds)
    : []);
  const aLoads = aBodies && config ? propagateLoads(aBodies, config, aContacts) : undefined;
  const contacts = aContacts
    ? aContacts.map(links => links.map(link => ({ index: link.index, overlapAreaM2: link.area / 1e6 })))
    : bodies.map(placement => bodies.flatMap((candidate, index) => {
      const area = supportContactArea(candidate, placement);
      return area > 0 ? [{ index, overlapAreaM2: area }] : [];
    }));
  const upper = bodies.map(() => [] as number[]);
  contacts.forEach((links, index) => links.forEach(link => {
    // Valid physical contact is acyclic. A's retained audit also requires a lower Z.
    if (bodies[link.index].z < bodies[index].z) upper[link.index].push(index);
  }));
  const descendantLoad = (index: number, cargoOnly = false) => {
    const descendants = new Set<number>();
    const queue = [...upper[index]];
    while (queue.length) {
      const next = queue.pop()!;
      if (descendants.has(next) || (cargoOnly && next >= placements.length)) continue;
      descendants.add(next);
      queue.push(...upper[next]);
    }
    return [...descendants].reduce((sum, next) => sum + bodies[next].weightKg, 0);
  };
  const directCargoSupporters = contacts.slice(0, placements.length).map(links => links
    .filter(link => link.index < placements.length)
    .map(link => ({ ...link, cargoId: placements[link.index].cargoId })));
  const directPalletSupporters = contacts.slice(0, placements.length).map(links => links
    .filter(link => link.index >= placements.length)
    .map(link => ({ index: link.index - placements.length, supportId: bodies[link.index].cargoId, overlapAreaM2: link.overlapAreaM2 })));

  const layerMemo = new Map<number, number>();
  const layerOf = (index: number, visiting = new Set<number>()): number => {
    const cached = layerMemo.get(index);
    if (cached) return cached;
    const cargoSupporters = directCargoSupporters[index] ?? [];
    // A pallet is the base of carton layer 1, not another carton layer.
    if (!cargoSupporters.length || visiting.has(index)) return 1;
    visiting.add(index);
    const layer = 1 + Math.max(...cargoSupporters.map(item => layerOf(item.index, visiting)));
    visiting.delete(index);
    layerMemo.set(index, layer);
    return layer;
  };

  return placements.map((placement, index) => {
    const footprint = Math.max(EPS, placement.length * placement.width);
    const cargoSupporters = directCargoSupporters[index];
    const palletSupporters = directPalletSupporters[index];
    const onFloor = placement.z <= contactToleranceM;
    const supportObjects = contacts[index].map(link => bodies[link.index]);
    const supportBounds = supportObjects.length ? {
      minX: Math.min(...supportObjects.map(item => Math.max(placement.x, item.x))),
      maxX: Math.max(...supportObjects.map(item => Math.min(placement.x + placement.length, item.x + item.length))),
      minY: Math.min(...supportObjects.map(item => Math.max(placement.y, item.y))),
      maxY: Math.max(...supportObjects.map(item => Math.min(placement.y + placement.width, item.y + item.width))),
    } : null;
    const center = aBodies ? itemCg(aBodies[index]) : undefined;
    const centerX = center ? center.x / 1000 : placement.x + placement.length / 2;
    const centerY = center ? center.y / 1000 : placement.y + placement.width / 2;
    const legacyAssessment = config ? undefined : assessPlacementSupport(placement, bodies);
    const supportRatio = legacyAssessment?.supportRatio ?? (onFloor ? 1
      : contacts[index].reduce((sum, link) => sum + link.overlapAreaM2, 0) / footprint);
    const centerSupported = legacyAssessment?.centerInsideSupportEnvelope ?? (onFloor || Boolean(supportBounds
      && centerX >= supportBounds.minX && centerX <= supportBounds.maxX
      && centerY >= supportBounds.minY && centerY <= supportBounds.maxY));
    const centerDirectlySupported = onFloor || supportObjects.some(support =>
      centerX >= support.x - EPS && centerX <= support.x + support.length + EPS
      && centerY >= support.y - EPS && centerY <= support.y + support.width + EPS);
    const overhang = supportBounds ? {
      innerM: Math.max(0, supportBounds.minX - placement.x),
      doorM: Math.max(0, placement.x + placement.length - supportBounds.maxX),
      leftM: Math.max(0, supportBounds.minY - placement.y),
      rightM: Math.max(0, placement.y + placement.width - supportBounds.maxY),
    } : { innerM: 0, doorM: 0, leftM: 0, rightM: 0 };
    const maxOverhangM = Math.max(overhang.innerM, overhang.doorM, overhang.leftM, overhang.rightM);
    // Legacy charges every reachable descendant once to each support, including decks.
    // A retains its distributed model AND its independent conservative cargo audit.
    const topLoadKg = config
      ? Math.max(descendantLoad(index, true), aLoads!.carried[index])
      : descendantLoad(index);
    const spec = cargoMap.get(placement.cargoId);
    const maxTopLoadKg = !config && spec?.strengthUnverified ? 0 : spec?.maxTopLoadKg;
    const topLoadUtilizationPct = maxTopLoadKg != null && maxTopLoadKg > 0 ? topLoadKg / maxTopLoadKg * 100 : null;
    const topLoadExceeded = maxTopLoadKg != null && topLoadKg > maxTopLoadKg + 1e-6;
    const unsupported = !onFloor && supportRatio + 1e-9 < minimumSupportRatio;
    const hardSupportFailure = legacyAssessment ? !legacyAssessment.supported
      : aSupportFailures.has(aBodies![index].item.id);
    const hardConstraintViolation = hardSupportFailure || topLoadExceeded;
    const supportWarnings = [
      ...(!onFloor && supportRatio < SUPPORT_WARNING_RATIO ? ['LOW_SUPPORT_MARGIN'] : []),
      ...(maxOverhangM > OVERHANG_WARNING_M ? ['OVERHANG_MARGIN'] : []),
      ...(!centerDirectlySupported ? ['CENTER_NOT_DIRECTLY_SUPPORTED'] : []),
    ];
    const tippingRisk = hardConstraintViolation || supportWarnings.length > 0;
    const supportType = onFloor ? 'floor' : cargoSupporters.length ? 'cargo' : palletSupporters.length ? 'pallet' : 'unsupported';

    return {
      placementIndex: index,
      cargoId: placement.cargoId,
      productId: spec?.productId ?? null,
      boxId: spec?.boxId ?? spec?.id ?? placement.cargoId,
      stackLevel: layerOf(index),
      zM: placement.z,
      supportType,
      supportRuleset: config ? 'a-v1' : 'legacy',
      minimumSupportRatioPct: minimumSupportRatio * 100,
      contactToleranceM,
      supportRatioPct: supportRatio * 100,
      centerSupported,
      centerDirectlySupported,
      supporters: cargoSupporters,
      palletSupporters,
      overhang,
      maxOverhangM,
      upperLoadKg: topLoadKg,
      upperLoadModel: config ? 'a-distributed-with-retained-cargo-limit' : 'conservative-contact-descendants',
      maxTopLoadKg: maxTopLoadKg ?? null,
      topLoadUtilizationPct,
      topLoadExceeded,
      maxStackLayers: spec?.maxStackLayers ?? null,
      unsupported,
      hardConstraintViolation,
      supportWarnings,
      tippingRisk,
    };
  });
}

function buildFloorLoadContributions(container: ContainerSpec, result: LoadingResult, columns = 12, rows = 4) {
  const cellLength = container.length / columns;
  const cellWidth = container.width / rows;
  const cells = Array.from({ length: rows * columns }, (_, index) => ({
    row: Math.floor(index / columns),
    column: index % columns,
    cargo: new Map<string, number>(),
  }));
  for (const placement of result.placements) {
    const footprint = Math.max(EPS, placement.length * placement.width);
    for (const cell of cells) {
      const x0 = cell.column * cellLength;
      const y0 = cell.row * cellWidth;
      const area = overlap1d(placement.x, placement.x + placement.length, x0, x0 + cellLength)
        * overlap1d(placement.y, placement.y + placement.width, y0, y0 + cellWidth);
      if (area <= EPS) continue;
      cell.cargo.set(placement.cargoId, (cell.cargo.get(placement.cargoId) ?? 0) + placement.weightKg * area / footprint);
    }
  }
  return cells.map(cell => ({
    row: cell.row,
    column: cell.column,
    contributors: [...cell.cargo.entries()]
      .map(([cargoId, loadKg]) => ({ cargoId, loadKg }))
      .sort((a, b) => b.loadKg - a.loadKg),
  }));
}

function equipmentChecks(equipment: TransportEquipment, container: ContainerSpec, cargo: CargoItem[]): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];
  const compare = (field: string, label: string, selected: number, engine: number | undefined, tolerance: number) => {
    const missing = engine == null || !Number.isFinite(engine);
    const mismatch = missing || Math.abs(selected - engine) > tolerance;
    checks.push({
      id: `equipment-${field}`,
      label,
      severity: mismatch ? 'CRITICAL' : 'OK',
      detail: missing ? '엔진 ContainerSpec에 값이 없습니다.' : mismatch ? `선택 적재공간과 엔진 값이 다릅니다: ${selected} / ${engine}` : '선택 적재공간과 엔진 값 일치',
      expected: selected,
      actual: engine ?? null,
    });
  };
  compare('length', '적재공간 길이', equipment.length, container.length, 0.001);
  compare('width', '적재공간 폭', equipment.width, container.width, 0.001);
  compare('height', '적재공간 높이', equipment.height, container.height, 0.001);
  compare('payload', '최대 적재중량', equipment.maxPayloadKg, container.maxPayloadKg, 1);
  compare('floor-load', '바닥 허용하중', equipment.floorLoadLimitKgPerM2, container.floorLoadLimitKgPerM2, 1);
  if (equipment.specializedCargo && cargo.length) {
    checks.push({
      id: 'equipment-specialized-cargo',
      label: '특수장비 적재 적합성',
      severity: equipment.geometry === 'tank' ? 'CRITICAL' : 'WARNING',
      detail: equipment.geometry === 'tank'
        ? '탱크 장비는 박스 자동 적재 대상으로 사용할 수 없습니다.'
        : '특수화물 장비입니다. 박스 적재 결과는 실제 장비 승인조건을 추가 확인해야 합니다.',
    });
  }
  return checks;
}

function packagingChecks(cargo: CargoItem[]): DiagnosticCheck[] {
  const snapshot = readShipmentInstructionSnapshot();
  if (!snapshot) return [{ id: 'packaging-snapshot', label: '포장 확정 스냅샷', severity: 'WARNING', detail: '제품 포장 확정 스냅샷이 없습니다. 일반 화물 작업이면 무시할 수 있습니다.' }];
  const matchingSnapshot = readShipmentInstructionSnapshot(cargo);
  const checks: DiagnosticCheck[] = [{
    id: 'packaging-signature',
    label: '포장 확정↔자동적재 입력 signature',
    severity: matchingSnapshot ? 'OK' : 'CRITICAL',
    detail: matchingSnapshot ? '제품 포장 확정 화물과 자동 적재 입력 signature가 일치합니다.' : '제품 포장 후 화물 규격·수량·중량 중 하나가 변경됐습니다.',
    expected: snapshot.cargoSignature,
  }];

  for (const line of snapshot.lines) {
    const family = cargo.filter(item => item.id === line.cargoId || item.id === `${line.cargoId}-PARTIAL`);
    if (!family.length) {
      checks.push({ id: `packaging-cargo-${line.productId}`, label: `${line.productId} 포장→적재`, severity: 'CRITICAL', detail: '포장 확정 화물이 자동 적재 입력에서 사라졌습니다.' });
      continue;
    }
    const dimensionMismatch = family.some(item => Math.abs(item.length - line.outerLength) > 0.001 || Math.abs(item.width - line.outerWidth) > 0.001 || Math.abs(item.height - line.outerHeight) > 0.001);
    const productMismatch = family.some(item => item.productId != null && item.productId !== line.productId);
    const boxMismatch = line.packagingMode === 'box' && family.some(item => item.boxId != null && item.boxId !== line.boxId);
    const missingBoxIdentity = line.packagingMode === 'box' && family.some(item => !item.boxId || !item.boxName);
    const metadataMissing = family.some(item => !item.productId || !item.productName || !item.unitsPerPackage || item.contentWeightKg == null);
    const familyQuantity = family.reduce((sum, item) => sum + item.quantity, 0);
    const quantityMismatch = familyQuantity !== line.boxesNeeded;
    const weightMismatch = family.some(item => {
      const partial = item.id.endsWith('-PARTIAL') || (line.boxesNeeded === 1 && line.partialUnits != null);
      const expectedContent = partial && line.partialContentWeightKg != null ? line.partialContentWeightKg : line.contentWeightKg;
      const tareWeight = line.packagingMode === 'box' && line.contentWeightKg != null
        ? Math.max(0, line.grossWeightKg - line.contentWeightKg) : 0;
      const expectedWeight = expectedContent != null ? expectedContent + tareWeight : line.grossWeightKg;
      return Math.abs(item.weightKg - expectedWeight) > 0.01
        || (item.contentWeightKg != null && expectedContent != null && Math.abs(item.contentWeightKg - expectedContent) > 0.01);
    });
    const critical = dimensionMismatch || productMismatch || boxMismatch || quantityMismatch || weightMismatch;
    const warning = !critical && (metadataMissing || missingBoxIdentity);
    checks.push({
      id: `packaging-cargo-${line.productId}`,
      label: `${line.productId} 포장→적재`,
      severity: critical ? 'CRITICAL' : warning ? 'WARNING' : 'OK',
      detail: dimensionMismatch ? '포장 확정 박스와 자동 적재 박스 외경이 다릅니다.'
        : productMismatch ? '자동 적재 화물의 원 제품 코드가 포장 확정 정보와 다릅니다.'
          : boxMismatch ? '자동 적재 화물의 박스 코드가 포장 확정 박스와 다릅니다.'
            : quantityMismatch ? `포장 필요 ${line.boxesNeeded}개 / 자동 적재 입력 ${familyQuantity}개로 수량이 다릅니다.`
              : weightMismatch ? '박스 자중 포함 총중량 또는 내용물 중량이 포장 확정 정보와 다릅니다.'
                : metadataMissing || missingBoxIdentity ? '규격은 일치하지만 제품/박스 추적 메타데이터가 일부 누락됐습니다.'
                  : '제품·박스·규격·수량·중량이 포장 확정 정보와 일치합니다.',
      expected: line.packagingMode === 'box' ? { productId: line.productId, boxId: line.boxId, boxesNeeded: line.boxesNeeded } : { productId: line.productId, boxesNeeded: line.boxesNeeded },
      actual: family.map(item => ({ id: item.id, productId: item.productId ?? null, boxId: item.boxId ?? null, quantity: item.quantity, weightKg: item.weightKg })),
    });
  }
  return checks;
}

function quantityChecks(cargo: CargoItem[], result: LoadingResult): DiagnosticCheck[] {
  const loaded = new Map<string, number>();
  result.placements.forEach(item => loaded.set(item.cargoId, (loaded.get(item.cargoId) ?? 0) + 1));
  const remaining = new Map<string, number>();
  result.remaining.forEach(item => remaining.set(item.cargoId, (remaining.get(item.cargoId) ?? 0) + item.quantity));
  return cargo.map(item => {
    const accounted = (loaded.get(item.id) ?? 0) + (remaining.get(item.id) ?? 0);
    return {
      id: `cargo-accounting-${item.id}`,
      label: `${item.id} 수량 보존`,
      severity: accounted === item.quantity ? 'OK' : 'CRITICAL',
      detail: accounted === item.quantity ? `${item.quantity}개 요청 수량이 모두 추적됩니다.` : `요청 ${item.quantity}, 적재+미적재 ${accounted}`,
      expected: item.quantity,
      actual: accounted,
    } satisfies DiagnosticCheck;
  });
}

function identityChecks() {
  const admin = isAdminSession();
  const operator = readLocalOperator();
  const planner = readEnterprisePackagingPlannerState();
  if (admin) return [{ id: 'data-owner', label: '제품 데이터 소유영역', severity: 'OK', detail: `관리자 영역 · 제품 ${planner?.products.length ?? 0}종` } satisfies DiagnosticCheck];
  if (!operator) return [{ id: 'data-owner', label: '제품 데이터 소유영역', severity: planner?.products.length ? 'CRITICAL' : 'OK', detail: planner?.products.length ? '비로그인 상태에서 제품 데이터가 노출됐습니다.' : '게스트 영역에 제품 데이터 없음' } satisfies DiagnosticCheck];
  return [{ id: 'data-owner', label: '제품 데이터 소유영역', severity: 'OK', detail: `회원 ${operator.id} 전용 영역 · 제품 ${planner?.products.length ?? 0}종` } satisfies DiagnosticCheck];
}

function validationChecks(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult): DiagnosticCheck[] {
  const published = readPhysicsTarget();
  if (!published) return [{ id: 'physics-target', label: '물리검증 대상', severity: 'WARNING', detail: '현재 물리검증 대상이 없습니다.' }];
  const expectedTarget: PhysicsTarget = {
    mode: published.mode,
    container,
    cargo,
    result,
    supports: published.supports,
  };
  const expectedSignature = createPhysicsTargetSignature(expectedTarget);
  const publishedSignature = createPhysicsTargetSignature(published);
  const targetMatches = expectedSignature === publishedSignature;
  const finalPhysics = readFinalPhysicsValidation();
  const inertia = readLatestInertiaCertification();
  return [
    {
      id: 'physics-target-signature',
      label: '현재 배치↔물리검증 Target',
      severity: targetMatches ? 'OK' : 'CRITICAL',
      detail: targetMatches ? '현재 적재 결과가 물리검증 대상과 일치합니다.' : '물리검증 Target이 현재 적재 결과와 다릅니다. 이전 작업의 검증 대상일 수 있습니다.',
      expected: expectedSignature,
      actual: publishedSignature,
    },
    {
      id: 'physics-signature',
      label: '배치↔Rapier 검증 결과',
      severity: finalPhysics?.signature === expectedSignature ? 'OK' : 'WARNING',
      detail: finalPhysics?.signature === expectedSignature ? '현재 적재 좌표와 Rapier 검증 signature가 일치합니다.' : '현재 적재 좌표에 대한 최신 Rapier 검증이 없습니다(STALE/미실행).',
      expected: expectedSignature,
      actual: finalPhysics?.signature ?? null,
    },
    {
      id: 'inertia-signature',
      label: '배치↔관성 검증 결과',
      severity: inertia?.targetSignature === expectedSignature ? 'OK' : 'WARNING',
      detail: inertia?.targetSignature === expectedSignature ? '현재 적재 좌표와 관성검증 signature가 일치합니다.' : '현재 적재 좌표에 대한 최신 관성검증이 없습니다(STALE/미실행).',
      expected: expectedSignature,
      actual: inertia?.targetSignature ?? null,
    },
  ];
}

function matchingPhysicsTarget(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult) {
  const published = readPhysicsTarget();
  if (!published) return undefined;
  const expectedTarget: PhysicsTarget = {
    mode: published.mode,
    container,
    cargo,
    result,
    supports: published.supports,
  };
  return createPhysicsTargetSignature(expectedTarget) === createPhysicsTargetSignature(published)
    ? published
    : undefined;
}

export function buildConsistencyReport(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult) {
  const equipment = readTransportEquipment();
  const target = matchingPhysicsTarget(container, cargo, result);
  const supports = target?.mode === 'pallets' ? (target.supports ?? []) : [];
  const cargoWeightKg = result.placements.reduce((sum, item) => sum + item.weightKg, 0);
  const supportWeightKg = supports.reduce((sum, item) => sum + item.weightKg, 0);
  const recalculatedLoadedWeightKg = cargoWeightKg + supportWeightKg;
  const stack = buildStackAnalysis(cargo, result, supports, container);
  const unsafeStack = stack.filter(item => item.hardConstraintViolation);
  const warningStack = stack.filter(item => item.supportWarnings.length > 0);
  const checks: DiagnosticCheck[] = [
    ...equipmentChecks(equipment, container, cargo),
    ...identityChecks(),
    ...packagingChecks(cargo),
    ...quantityChecks(cargo, result),
    ...cartonStrengthChecks(container, cargo, result.placements),
    ...validationChecks(container, cargo, result),
    {
      id: 'loaded-weight-recalculation',
      label: '적재중량 재계산',
      severity: Math.abs(recalculatedLoadedWeightKg - result.loadedWeightKg) <= 0.01 ? 'OK' : 'CRITICAL',
      detail: supports.length
        ? `화물 ${cargoWeightKg.toFixed(3)} kg + 파렛트/지지체 ${supportWeightKg.toFixed(3)} kg = ${recalculatedLoadedWeightKg.toFixed(3)} kg / 엔진 ${result.loadedWeightKg.toFixed(3)} kg`
        : `배치합 ${cargoWeightKg.toFixed(3)} kg / 엔진 ${result.loadedWeightKg.toFixed(3)} kg`,
      expected: recalculatedLoadedWeightKg,
      actual: result.loadedWeightKg,
    },
    {
      id: 'stack-support-integrity',
      label: '적층 지지 안정성',
      severity: unsafeStack.length ? 'CRITICAL' : warningStack.length ? 'WARNING' : 'OK',
      detail: unsafeStack.length
        ? `선택 규칙의 지지·무게중심·누적 상부하중 한도 위반 ${unsafeStack.length}건`
        : warningStack.length
          ? `엔진 지지·상부하중 기준 이내. 보수적 재확인 경고 ${warningStack.length}건 (지지율 95% 미만, 돌출 20 mm 초과 또는 중심 직하 접촉 없음). 동적 안정성은 별도 검증합니다.`
          : '선택 규칙의 지지·상부하중 기준과 진단 여유 기준 이내입니다. 동적 안정성은 별도 검증합니다.',
      actual: (unsafeStack.length ? unsafeStack : warningStack).map(item => item.placementIndex),
    },
  ];
  return {
    schema: 'container-loading-consistency-v2',
    generatedAt: new Date().toISOString(),
    severity: maxSeverity(checks),
    counts: {
      ok: checks.filter(item => item.severity === 'OK').length,
      warning: checks.filter(item => item.severity === 'WARNING').length,
      critical: checks.filter(item => item.severity === 'CRITICAL').length,
    },
    checks,
  };
}

export function buildBlackboxSnapshots(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult) {
  const equipment = readTransportEquipment();
  const planner = readEnterprisePackagingPlannerState();
  const selection = readProductSelection();
  const shipment = readShipmentInstructionSnapshot();
  const operator = readLocalOperator();
  const floorLoad = analyzeFloorLoad(container, result, 12, 4);
  const floorLoadContributions = buildFloorLoadContributions(container, result, 12, 4);
  const balance = assessWeightBalance(container, result);
  const constraints = equipmentAwareConstraints(equipment, container, cargo, result);
  const target = readPhysicsTarget();
  const expectedTarget = target ? ({ mode: target.mode, container, cargo, result, supports: target.supports } satisfies PhysicsTarget) : undefined;
  const expectedTargetSignature = expectedTarget ? createPhysicsTargetSignature(expectedTarget) : null;
  const publishedTargetSignature = target ? createPhysicsTargetSignature(target) : null;
  const finalPhysics = readFinalPhysicsValidation();
  const inertia = readLatestInertiaCertification();
  const targetMatchesCurrentResult = Boolean(expectedTargetSignature && publishedTargetSignature === expectedTargetSignature);
  const stack = buildStackAnalysis(
    cargo,
    result,
    targetMatchesCurrentResult && target?.mode === 'pallets' ? (target.supports ?? []) : [],
    container,
  );
  const consistency = buildConsistencyReport(container, cargo, result);
  const palletSnapshot = targetMatchesCurrentResult && target?.mode === 'pallets' ? readPalletSnapshot() : undefined;
  const palletSnapshotTarget = palletSnapshot ? physicsTargetFromPalletSnapshot(container, cargo, palletSnapshot) : undefined;
  const palletSnapshotMatches = Boolean(palletSnapshotTarget
    && createPhysicsTargetSignature(palletSnapshotTarget) === expectedTargetSignature);

  const selectedProducts = (planner?.products ?? []).flatMap(product => {
    const quantity = selection[product.id] ?? 0;
    return quantity > 0 ? [{ ...product, shipmentQuantity: quantity }] : [];
  });

  return {
    equipment: {
      schema: 'container-loading-equipment-v2',
      selected: equipment,
      engineContainer: container,
      geometry: equipment.geometry,
      applicableChecks: constraints.map(item => item.id),
    },
    products: {
      schema: 'container-loading-products-v2',
      owner: isAdminSession() ? { type: 'admin' } : operator ? { type: 'member', id: operator.id, email: operator.email ?? null } : { type: 'guest' },
      masterCount: planner?.products.length ?? 0,
      selectedProducts,
      selection,
    },
    packaging: {
      schema: 'container-loading-packaging-v2',
      shipmentSnapshot: shipment,
      cargoMatchesShipmentSignature: Boolean(shipment && readShipmentInstructionSnapshot(cargo)),
      registeredBoxes: planner?.boxes ?? [],
    },
    loadingInput: {
      schema: 'container-loading-input-v2',
      container,
      cargo,
      // A preference may change after a run; never label it the effective strategy.
      strategyPreferenceAtExport: readLoadingStrategyPreference(),
      palletPlanningStatus: target?.mode !== 'pallets' ? 'not-applicable'
        : !targetMatchesCurrentResult ? 'stale-target'
          : !palletSnapshot ? 'missing-snapshot' : palletSnapshotMatches ? 'matched-current-target' : 'stale-snapshot',
      palletPlanning: palletSnapshotMatches && palletSnapshot ? {
        spec: palletSnapshot.spec,
        strategy: palletSnapshot.result.optimization.strategy ?? null,
        optimization: palletSnapshot.result.optimization,
      } : null,
    },
    placements: {
      schema: 'container-loading-placements-v2',
      result,
    },
    constraints: {
      schema: 'container-loading-constraints-v2',
      equipmentId: equipment.id,
      geometry: equipment.geometry,
      checks: constraints,
    },
    weightBalance: { schema: 'container-loading-weight-balance-v2', ...balance },
    floorLoad: { schema: 'container-loading-floor-load-v2', ...floorLoad, contributions: floorLoadContributions },
    stackAnalysis: { schema: 'container-loading-stack-analysis-v2', placements: stack },
    physics: {
      schema: 'container-loading-physics-v2',
      expectedTargetSignature,
      publishedTargetSignature,
      targetMatchesCurrentResult,
      finalValidationSignature: finalPhysics?.signature ?? null,
      stale: Boolean(expectedTargetSignature && finalPhysics?.signature !== expectedTargetSignature),
      result: finalPhysics?.result ?? null,
    },
    inertia: {
      schema: 'container-loading-inertia-v2',
      expectedTargetSignature,
      certification: inertia ?? null,
      stale: Boolean(expectedTargetSignature && inertia?.targetSignature !== expectedTargetSignature),
    },
    workflowTrace: {
      schema: 'container-loading-workflow-trace-v2',
      entries: readDiagnosticTrace(),
    },
    consistency,
    runtime: { schema: 'container-loading-runtime-v2', ...runtimeSnapshot() },
  };
}
