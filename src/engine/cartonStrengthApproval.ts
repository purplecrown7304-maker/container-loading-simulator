import type { BoxCatalogItem, ProductItem, ProductPackagingAssignment } from './productPackagingOptimizer';

const EPS = 1e-9;

export type CartonVerificationInput = {
  catalogId: string;
  name?: string;
  /** 제조 완료 박스 1EA 실제 자중. 자동설계 단계의 임시 자중을 재사용하지 않는다. */
  verifiedTareWeightKg: number;
  verifiedMaxTopLoadKg: number;
  verifiedMaxGrossWeightKg: number;
  unitCost?: number;
  manufacturingStepMm?: number;
};

export type CartonApprovalCandidateGroup = {
  key: string;
  assignments: ProductPackagingAssignment[];
  productIds: string[];
  innerLength: number;
  innerWidth: number;
  innerHeight: number;
  outerLength: number;
  outerWidth: number;
  outerHeight: number;
  provisionalRequiredTopLoadKg: number;
};

export type CartonApprovalResult =
  | {
      ok: true;
      box: BoxCatalogItem;
      verifiedFullGrossWeightKg: number;
      requiredTopLoadKg: number;
      recommendedStackLayers: number;
      verifiedStackLayers: number;
      productCount: number;
    }
  | { ok: false; reason: string };

function ceilToStep(valueM: number, stepMm: number) {
  const stepM = Math.max(0.001, stepMm / 1000);
  return Math.ceil((valueM - EPS) / stepM) * stepM;
}

function physicalKey(assignment: ProductPackagingAssignment) {
  return [
    assignment.innerLength, assignment.innerWidth, assignment.innerHeight,
    assignment.outerLength, assignment.outerWidth, assignment.outerHeight,
  ].map((value) => value.toFixed(4)).join(':');
}

export function groupCartonApprovalCandidates(assignments: ProductPackagingAssignment[]): CartonApprovalCandidateGroup[] {
  const grouped = new Map<string, ProductPackagingAssignment[]>();
  for (const assignment of assignments) {
    if (assignment.strengthStatus !== 'design-target') continue;
    const key = physicalKey(assignment);
    const list = grouped.get(key) ?? [];
    list.push(assignment);
    grouped.set(key, list);
  }
  return [...grouped.entries()]
    .map(([key, items]) => {
      const first = items[0];
      return {
        key,
        assignments: [...items].sort((a, b) => a.productId.localeCompare(b.productId)),
        productIds: [...items].map((item) => item.productId).sort((a, b) => a.localeCompare(b)),
        innerLength: first.innerLength,
        innerWidth: first.innerWidth,
        innerHeight: first.innerHeight,
        outerLength: first.outerLength,
        outerWidth: first.outerWidth,
        outerHeight: first.outerHeight,
        provisionalRequiredTopLoadKg: Math.max(...items.map((item) => item.requiredTopLoadKg)),
      };
    })
    .sort((a, b) =>
      a.outerLength * a.outerWidth * a.outerHeight - b.outerLength * b.outerWidth * b.outerHeight
      || a.key.localeCompare(b.key),
    );
}

export function verifiedStackLayers(
  assignment: ProductPackagingAssignment,
  verifiedMaxTopLoadKg: number,
  verifiedFullGrossWeightKg = assignment.grossWeightKg,
) {
  if (!Number.isFinite(verifiedMaxTopLoadKg) || verifiedMaxTopLoadKg < 0) return 1;
  if (!Number.isFinite(verifiedFullGrossWeightKg) || verifiedFullGrossWeightKg <= 0) return 1;
  return Math.max(
    1,
    Math.min(
      assignment.recommendedStackLayers,
      1 + Math.floor((verifiedMaxTopLoadKg + EPS) / Math.max(EPS, verifiedFullGrossWeightKg)),
    ),
  );
}

function validateVerification(verification: CartonVerificationInput) {
  const id = verification.catalogId.trim();
  if (!id) return '승인 박스 코드를 입력하세요.';
  if (!Number.isFinite(verification.verifiedTareWeightKg) || verification.verifiedTareWeightKg < 0) {
    return '제조 완료 박스의 실제 자중은 0 이상의 유한한 값이어야 합니다.';
  }
  if (!Number.isFinite(verification.verifiedMaxTopLoadKg) || verification.verifiedMaxTopLoadKg < 0) {
    return '제조사 검증 상부 허용중량은 0 이상의 유한한 값이어야 합니다.';
  }
  if (!Number.isFinite(verification.verifiedMaxGrossWeightKg) || verification.verifiedMaxGrossWeightKg <= 0) {
    return '제조사 검증 최대 총중량은 0보다 커야 합니다.';
  }
  if (verification.unitCost != null && (!Number.isFinite(verification.unitCost) || verification.unitCost < 0)) {
    return '박스 단가는 비우거나 0 이상의 값이어야 합니다.';
  }
  return null;
}

export function approveGeneratedCartonFamily(
  group: CartonApprovalCandidateGroup,
  products: ProductItem[],
  verification: CartonVerificationInput,
): CartonApprovalResult {
  if (!group.assignments.length) return { ok: false, reason: '승인할 자동설계 규격이 없습니다.' };
  if (group.assignments.some((item) => item.strengthStatus !== 'design-target')) {
    return { ok: false, reason: '이미 보유박스 강도가 적용된 규격이 포함되어 있습니다.' };
  }
  const verificationError = validateVerification(verification);
  if (verificationError) return { ok: false, reason: verificationError };

  const productsById = new Map(products.map((item) => [item.id, item]));
  const perProduct = group.assignments.map((assignment) => {
    const product = productsById.get(assignment.productId);
    if (!product) return null;
    const fullGrossWeightKg = verification.verifiedTareWeightKg + assignment.unitsPerBox * product.weightKg;
    const requiredTopLoadKg = Math.max(0, fullGrossWeightKg * (assignment.recommendedStackLayers - 1));
    return {
      assignment,
      fullGrossWeightKg,
      requiredTopLoadKg,
      stack: verifiedStackLayers(assignment, verification.verifiedMaxTopLoadKg, fullGrossWeightKg),
    };
  });
  if (perProduct.some((item) => item == null)) return { ok: false, reason: '승인 규격에 연결된 제품 정보를 찾지 못했습니다.' };
  const checked = perProduct.filter((item): item is NonNullable<typeof item> => item != null);
  const heaviestFull = Math.max(...checked.map((item) => item.fullGrossWeightKg));
  if (verification.verifiedMaxGrossWeightKg + EPS < heaviestFull) {
    return { ok: false, reason: `검증 최대 총중량이 이 규격을 공유하는 제품 중 가장 무거운 Full 박스 ${heaviestFull.toFixed(2)}kg보다 작습니다.` };
  }

  const stepMm = Math.max(1, Math.floor(verification.manufacturingStepMm ?? 5));
  const outerLength = ceilToStep(group.outerLength, stepMm);
  const outerWidth = ceilToStep(group.outerWidth, stepMm);
  const outerHeight = ceilToStep(group.outerHeight, stepMm);
  const requiredTopLoadKg = Math.max(...checked.map((item) => item.requiredTopLoadKg));
  const recommendedStackLayers = Math.max(...checked.map((item) => item.assignment.recommendedStackLayers));
  // 하나의 검증박스를 여러 제품이 공유하므로 표시용 안전 적층단은 가장 보수적인 제품 기준으로 반환한다.
  const operationalStack = Math.min(...checked.map((item) => item.stack));

  const box: BoxCatalogItem = {
    id: verification.catalogId.trim(),
    name: verification.name?.trim() || `검증 ${Math.round(outerLength * 1000)}×${Math.round(outerWidth * 1000)}×${Math.round(outerHeight * 1000)}mm`,
    innerLength: group.innerLength,
    innerWidth: group.innerWidth,
    innerHeight: group.innerHeight,
    outerLength,
    outerWidth,
    outerHeight,
    tareWeightKg: verification.verifiedTareWeightKg,
    maxGrossWeightKg: verification.verifiedMaxGrossWeightKg,
    maxTopLoadKg: verification.verifiedMaxTopLoadKg,
    unitCost: verification.unitCost,
  };

  return {
    ok: true,
    box,
    verifiedFullGrossWeightKg: heaviestFull,
    requiredTopLoadKg,
    recommendedStackLayers,
    verifiedStackLayers: operationalStack,
    productCount: checked.length,
  };
}

export function approveGeneratedCarton(
  assignment: ProductPackagingAssignment,
  product: ProductItem,
  verification: CartonVerificationInput,
): CartonApprovalResult {
  if (assignment.strengthStatus !== 'design-target') {
    return { ok: false, reason: '이미 보유박스 강도가 적용된 규격입니다.' };
  }
  const group = groupCartonApprovalCandidates([assignment])[0];
  return approveGeneratedCartonFamily(group, [product], verification);
}
