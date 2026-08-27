import type { BoxCatalogItem, ProductItem, ProductPackagingAssignment } from './productPackagingOptimizer';

const EPS = 1e-9;

export type CartonVerificationInput = {
  catalogId: string;
  name?: string;
  verifiedMaxTopLoadKg: number;
  verifiedMaxGrossWeightKg: number;
  unitCost?: number;
  manufacturingStepMm?: number;
};

export type CartonApprovalResult =
  | { ok: true; box: BoxCatalogItem; requiredTopLoadKg: number; recommendedStackLayers: number }
  | { ok: false; reason: string };

function ceilToStep(valueM: number, stepMm: number) {
  const stepM = Math.max(0.001, stepMm / 1000);
  return Math.ceil((valueM - EPS) / stepM) * stepM;
}

function inferredTare(assignment: ProductPackagingAssignment, product: ProductItem) {
  return Math.max(0, assignment.grossWeightKg - assignment.unitsPerBox * product.weightKg);
}

export function approveGeneratedCarton(
  assignment: ProductPackagingAssignment,
  product: ProductItem,
  verification: CartonVerificationInput,
): CartonApprovalResult {
  if (assignment.strengthStatus !== 'design-target') {
    return { ok: false, reason: '이미 보유박스 강도가 적용된 규격입니다.' };
  }
  const id = verification.catalogId.trim();
  if (!id) return { ok: false, reason: '승인 박스 코드를 입력하세요.' };
  if (!Number.isFinite(verification.verifiedMaxTopLoadKg) || verification.verifiedMaxTopLoadKg < 0) {
    return { ok: false, reason: '제조사 검증 상부 허용중량은 0 이상의 유한한 값이어야 합니다.' };
  }
  if (!Number.isFinite(verification.verifiedMaxGrossWeightKg) || verification.verifiedMaxGrossWeightKg <= 0) {
    return { ok: false, reason: '제조사 검증 최대 총중량은 0보다 커야 합니다.' };
  }
  if (verification.verifiedMaxGrossWeightKg + EPS < assignment.grossWeightKg) {
    return { ok: false, reason: `검증 최대 총중량이 현재 Full 박스 중량 ${assignment.grossWeightKg.toFixed(2)}kg보다 작습니다.` };
  }
  if (verification.unitCost != null && (!Number.isFinite(verification.unitCost) || verification.unitCost < 0)) {
    return { ok: false, reason: '박스 단가는 비우거나 0 이상의 값이어야 합니다.' };
  }

  const stepMm = Math.max(1, Math.floor(verification.manufacturingStepMm ?? 5));
  const outerLength = ceilToStep(assignment.outerLength, stepMm);
  const outerWidth = ceilToStep(assignment.outerWidth, stepMm);
  const outerHeight = ceilToStep(assignment.outerHeight, stepMm);

  const box: BoxCatalogItem = {
    id,
    name: verification.name?.trim() || `검증 ${Math.round(outerLength * 1000)}×${Math.round(outerWidth * 1000)}×${Math.round(outerHeight * 1000)}mm`,
    innerLength: assignment.innerLength,
    innerWidth: assignment.innerWidth,
    innerHeight: assignment.innerHeight,
    outerLength,
    outerWidth,
    outerHeight,
    tareWeightKg: inferredTare(assignment, product),
    maxGrossWeightKg: verification.verifiedMaxGrossWeightKg,
    maxTopLoadKg: verification.verifiedMaxTopLoadKg,
    unitCost: verification.unitCost,
  };

  return {
    ok: true,
    box,
    requiredTopLoadKg: assignment.requiredTopLoadKg,
    recommendedStackLayers: assignment.recommendedStackLayers,
  };
}

export function verifiedStackLayers(
  assignment: ProductPackagingAssignment,
  verifiedMaxTopLoadKg: number,
) {
  if (!Number.isFinite(verifiedMaxTopLoadKg) || verifiedMaxTopLoadKg < 0) return 1;
  return Math.max(
    1,
    Math.min(
      assignment.recommendedStackLayers,
      1 + Math.floor((verifiedMaxTopLoadKg + EPS) / Math.max(EPS, assignment.grossWeightKg)),
    ),
  );
}
