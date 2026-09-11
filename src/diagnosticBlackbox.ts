import { isAdminSession } from './adminAccess';
import { readFinalPhysicsValidation } from './autoCertification';
import { analyzeConstraints, type ConstraintCheck } from './engine/constraintAnalysis';
import { analyzeFloorLoad } from './engine/floorLoad';
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

function overlapArea(a: Placement, b: Placement) {
  const x = Math.max(0, Math.min(a.x + a.length, b.x + b.length) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.width, b.y + b.width) - Math.max(a.y, b.y));
  return x * y;
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

export function buildStackAnalysis(cargo: CargoItem[], result: LoadingResult) {
  const cargoMap = new Map(cargo.map(item => [item.id, item]));
  return result.placements.map((placement, index) => {
    const footprint = Math.max(EPS, placement.length * placement.width);
    const supporters = result.placements.flatMap((candidate, supporterIndex) => {
      if (supporterIndex === index) return [];
      if (Math.abs(candidate.z + candidate.height - placement.z) > 1e-5) return [];
      const area = overlapArea(placement, candidate);
      if (area <= EPS) return [];
      return [{ index: supporterIndex, cargoId: candidate.cargoId, overlapAreaM2: area }];
    });
    const supportArea = Math.min(footprint, supporters.reduce((sum, item) => sum + item.overlapAreaM2, 0));
    const upper = result.placements.flatMap((candidate, upperIndex) => {
      if (upperIndex === index || candidate.z + EPS < placement.z + placement.height) return [];
      const area = overlapArea(placement, candidate);
      if (area <= EPS) return [];
      const ratio = Math.min(1, area / Math.max(EPS, candidate.length * candidate.width));
      return [{ index: upperIndex, cargoId: candidate.cargoId, transferredWeightKg: candidate.weightKg * ratio }];
    });
    const topLoadKg = upper.reduce((sum, item) => sum + item.transferredWeightKg, 0);
    const spec = cargoMap.get(placement.cargoId);
    return {
      placementIndex: index,
      cargoId: placement.cargoId,
      productId: spec?.productId ?? null,
      boxId: spec?.id ?? placement.cargoId,
      zM: placement.z,
      supportType: placement.z <= EPS ? 'floor' : supporters.length ? 'cargo' : 'unsupported',
      supportRatioPct: placement.z <= EPS ? 100 : supportArea / footprint * 100,
      supporters,
      upperLoadKg: topLoadKg,
      maxTopLoadKg: spec?.maxTopLoadKg ?? null,
      topLoadUtilizationPct: spec?.maxTopLoadKg && spec.maxTopLoadKg > 0 ? topLoadKg / spec.maxTopLoadKg * 100 : null,
      maxStackLayers: spec?.maxStackLayers ?? null,
      unsupported: placement.z > EPS && supportArea / footprint < 0.95,
    };
  });
}

function equipmentChecks(equipment: TransportEquipment, container: ContainerSpec): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];
  const compare = (field: string, label: string, selected: number, engine: number, tolerance: number) => {
    checks.push({
      id: `equipment-${field}`,
      label,
      severity: Math.abs(selected - engine) > tolerance ? 'CRITICAL' : 'OK',
      detail: Math.abs(selected - engine) > tolerance ? `선택 적재공간과 엔진 값이 다릅니다: ${selected} / ${engine}` : '선택 적재공간과 엔진 값 일치',
      expected: selected,
      actual: engine,
    });
  };
  compare('length', '적재공간 길이', equipment.length, container.length, 0.001);
  compare('width', '적재공간 폭', equipment.width, container.width, 0.001);
  compare('height', '적재공간 높이', equipment.height, container.height, 0.001);
  compare('payload', '최대 적재중량', equipment.maxPayloadKg, container.maxPayloadKg, 1);
  compare('floor-load', '바닥 허용하중', equipment.floorLoadLimitKgPerM2, container.floorLoadLimitKgPerM2 ?? equipment.floorLoadLimitKgPerM2, 1);
  return checks;
}

function packagingChecks(cargo: CargoItem[]): DiagnosticCheck[] {
  const snapshot = readShipmentInstructionSnapshot();
  if (!snapshot) return [{ id: 'packaging-snapshot', label: '포장 확정 스냅샷', severity: 'WARNING', detail: '제품 포장 확정 스냅샷이 없습니다. 일반 화물 작업이면 무시할 수 있습니다.' }];
  const checks: DiagnosticCheck[] = [{ id: 'packaging-snapshot', label: '포장 확정 스냅샷', severity: 'OK', detail: `${snapshot.lines.length}개 제품 포장 정보 확인` }];
  for (const line of snapshot.lines) {
    const family = cargo.filter(item => item.id === line.cargoId || item.id === `${line.cargoId}-PARTIAL`);
    if (!family.length) {
      checks.push({ id: `packaging-cargo-${line.productId}`, label: `${line.productId} 포장→적재`, severity: 'CRITICAL', detail: '포장 확정 화물이 자동 적재 입력에서 사라졌습니다.' });
      continue;
    }
    const dimensionMismatch = family.some(item => Math.abs(item.length - line.outerLength) > 0.001 || Math.abs(item.width - line.outerWidth) > 0.001 || Math.abs(item.height - line.outerHeight) > 0.001);
    const metadataMissing = family.some(item => !item.productId || !item.productName || !item.unitsPerPackage || item.contentWeightKg == null);
    checks.push({
      id: `packaging-cargo-${line.productId}`,
      label: `${line.productId} 포장→적재`,
      severity: dimensionMismatch ? 'CRITICAL' : metadataMissing ? 'WARNING' : 'OK',
      detail: dimensionMismatch ? '포장 확정 박스와 자동 적재 박스 외경이 다릅니다.' : metadataMissing ? '박스 규격은 일치하지만 제품 메타데이터가 누락됐습니다.' : '포장 확정 박스와 자동 적재 입력이 일치합니다.',
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

function validationChecks(target: PhysicsTarget | undefined): DiagnosticCheck[] {
  if (!target) return [{ id: 'physics-target', label: '물리검증 대상', severity: 'WARNING', detail: '현재 물리검증 대상이 없습니다.' }];
  const signature = createPhysicsTargetSignature(target);
  const finalPhysics = readFinalPhysicsValidation();
  const inertia = readLatestInertiaCertification();
  return [
    {
      id: 'physics-signature',
      label: '배치↔Rapier 검증 대상',
      severity: finalPhysics?.signature === signature ? 'OK' : 'WARNING',
      detail: finalPhysics?.signature === signature ? '현재 적재 좌표와 Rapier 검증 signature가 일치합니다.' : '현재 적재 좌표에 대한 최신 Rapier 검증이 없습니다(STALE/미실행).',
      expected: signature,
      actual: finalPhysics?.signature ?? null,
    },
    {
      id: 'inertia-signature',
      label: '배치↔관성 검증 대상',
      severity: inertia?.targetSignature === signature ? 'OK' : 'WARNING',
      detail: inertia?.targetSignature === signature ? '현재 적재 좌표와 관성검증 signature가 일치합니다.' : '현재 적재 좌표에 대한 최신 관성검증이 없습니다(STALE/미실행).',
      expected: signature,
      actual: inertia?.targetSignature ?? null,
    },
  ];
}

export function buildConsistencyReport(container: ContainerSpec, cargo: CargoItem[], result: LoadingResult) {
  const equipment = readTransportEquipment();
  const target = readPhysicsTarget();
  const weightFromPlacements = result.placements.reduce((sum, item) => sum + item.weightKg, 0);
  const checks: DiagnosticCheck[] = [
    ...equipmentChecks(equipment, container),
    ...identityChecks(),
    ...packagingChecks(cargo),
    ...quantityChecks(cargo, result),
    ...validationChecks(target),
    {
      id: 'loaded-weight-recalculation',
      label: '적재중량 재계산',
      severity: Math.abs(weightFromPlacements - result.loadedWeightKg) <= 0.01 ? 'OK' : 'CRITICAL',
      detail: `배치합 ${weightFromPlacements.toFixed(3)} kg / 엔진 ${result.loadedWeightKg.toFixed(3)} kg`,
      expected: weightFromPlacements,
      actual: result.loadedWeightKg,
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
  const balance = assessWeightBalance(container, result);
  const constraints = equipmentAwareConstraints(equipment, container, cargo, result);
  const target = readPhysicsTarget();
  const finalPhysics = readFinalPhysicsValidation();
  const inertia = readLatestInertiaCertification();
  const stack = buildStackAnalysis(cargo, result);
  const consistency = buildConsistencyReport(container, cargo, result);

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
      registeredBoxes: planner?.boxes ?? [],
    },
    loadingInput: {
      schema: 'container-loading-input-v2',
      container,
      cargo,
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
    floorLoad: { schema: 'container-loading-floor-load-v2', ...floorLoad },
    stackAnalysis: { schema: 'container-loading-stack-analysis-v2', placements: stack },
    physics: {
      schema: 'container-loading-physics-v2',
      targetSignature: target ? createPhysicsTargetSignature(target) : null,
      finalValidationSignature: finalPhysics?.signature ?? null,
      stale: Boolean(target && finalPhysics?.signature !== createPhysicsTargetSignature(target)),
      result: finalPhysics?.result ?? null,
    },
    inertia: {
      schema: 'container-loading-inertia-v2',
      targetSignature: target ? createPhysicsTargetSignature(target) : null,
      certification: inertia ?? null,
      stale: Boolean(target && inertia?.targetSignature !== createPhysicsTargetSignature(target)),
    },
    workflowTrace: {
      schema: 'container-loading-workflow-trace-v2',
      entries: readDiagnosticTrace(),
    },
    consistency,
    runtime: { schema: 'container-loading-runtime-v2', ...runtimeSnapshot() },
  };
}
