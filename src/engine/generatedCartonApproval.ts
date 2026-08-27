import type { BoxCatalogItem, ProductPackagingAssignment } from './productPackagingOptimizer';

export type GeneratedCartonApproval = {
  catalogId: string;
  catalogName?: string;
  tareWeightKg: number;
  maxGrossWeightKg: number;
  verifiedTopLoadKg: number;
  unitCost?: number;
};

export type GeneratedCartonApprovalResult = {
  box?: BoxCatalogItem;
  error?: string;
  meetsDesignTarget: boolean;
};

export function approveGeneratedCarton(
  assignment: ProductPackagingAssignment,
  approval: GeneratedCartonApproval,
): GeneratedCartonApprovalResult {
  if (assignment.strengthStatus !== 'design-target' || assignment.source !== 'generated') {
    return { error: '자동설계 강도 미검증 박스만 승인 등록할 수 있습니다.', meetsDesignTarget: false };
  }
  const catalogId = approval.catalogId.trim();
  if (!catalogId) return { error: '승인 박스 코드를 입력하세요.', meetsDesignTarget: false };
  if (!Number.isFinite(approval.tareWeightKg) || approval.tareWeightKg < 0) return { error: '검증 박스 자중은 0 이상이어야 합니다.', meetsDesignTarget: false };
  if (!Number.isFinite(approval.maxGrossWeightKg) || approval.maxGrossWeightKg <= 0) return { error: '검증 최대 총중량은 0보다 커야 합니다.', meetsDesignTarget: false };
  if (!Number.isFinite(approval.verifiedTopLoadKg) || approval.verifiedTopLoadKg < 0) return { error: '검증 상부 허용중량은 0 이상이어야 합니다.', meetsDesignTarget: false };
  if (approval.unitCost != null && (!Number.isFinite(approval.unitCost) || approval.unitCost < 0)) return { error: '박스 단가는 비우거나 0 이상이어야 합니다.', meetsDesignTarget: false };
  // 승인 규격이 현재 자동설계의 계획 총중량조차 못 버티면 카탈로그 승격을 막는다.
  // 자중 변경으로 실제 payload 여유가 달라질 수 있으므로 승인 후 기업 최적화를 다시 실행한다.
  if (approval.maxGrossWeightKg + 1e-9 < assignment.grossWeightKg) {
    return { error: `검증 최대 총중량은 현재 설계 총중량 ${assignment.grossWeightKg.toFixed(2)}kg 이상으로 입력하세요.`, meetsDesignTarget: false };
  }

  const meetsDesignTarget = approval.verifiedTopLoadKg + 1e-9 >= assignment.requiredTopLoadKg;
  return {
    meetsDesignTarget,
    box: {
      id: catalogId,
      name: approval.catalogName?.trim() || `검증 ${assignment.boxName}`,
      innerLength: assignment.innerLength,
      innerWidth: assignment.innerWidth,
      innerHeight: assignment.innerHeight,
      outerLength: assignment.outerLength,
      outerWidth: assignment.outerWidth,
      outerHeight: assignment.outerHeight,
      tareWeightKg: approval.tareWeightKg,
      maxGrossWeightKg: approval.maxGrossWeightKg,
      maxTopLoadKg: approval.verifiedTopLoadKg,
      unitCost: approval.unitCost,
    },
  };
}
