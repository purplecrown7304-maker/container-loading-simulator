import type { BoxCatalogItem, ProductPackagingAssignment } from './productPackagingOptimizer';

export type GeneratedCartonApproval = {
  catalogId: string;
  catalogName?: string;
  tareWeightKg: number;
  /** 승인 대상 박스 1EA에 실제 들어가는 제품 payload 중량. */
  packedProductWeightKg: number;
  maxGrossWeightKg: number;
  verifiedTopLoadKg: number;
  unitCost?: number;
};

export type GeneratedCartonApprovalResult = {
  box?: BoxCatalogItem;
  error?: string;
  meetsDesignTarget: boolean;
  verifiedGrossWeightKg?: number;
  recalculatedRequiredTopLoadKg?: number;
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
  if (!Number.isFinite(approval.packedProductWeightKg) || approval.packedProductWeightKg <= 0) return { error: '박스 내용물 중량은 0보다 커야 합니다.', meetsDesignTarget: false };
  if (!Number.isFinite(approval.maxGrossWeightKg) || approval.maxGrossWeightKg <= 0) return { error: '검증 최대 총중량은 0보다 커야 합니다.', meetsDesignTarget: false };
  if (!Number.isFinite(approval.verifiedTopLoadKg) || approval.verifiedTopLoadKg < 0) return { error: '검증 상부 허용중량은 0 이상이어야 합니다.', meetsDesignTarget: false };
  if (approval.unitCost != null && (!Number.isFinite(approval.unitCost) || approval.unitCost < 0)) return { error: '박스 단가는 비우거나 0 이상이어야 합니다.', meetsDesignTarget: false };

  const verifiedGrossWeightKg = approval.tareWeightKg + approval.packedProductWeightKg;
  if (approval.maxGrossWeightKg + 1e-9 < verifiedGrossWeightKg) {
    return {
      error: `검증 최대 총중량은 실제 자중+내용물 ${verifiedGrossWeightKg.toFixed(2)}kg 이상이어야 합니다.`,
      meetsDesignTarget: false,
      verifiedGrossWeightKg,
    };
  }

  const recommendedLayers = Math.max(1, Math.floor(assignment.recommendedStackLayers));
  const recalculatedRequiredTopLoadKg = Math.max(0, verifiedGrossWeightKg * (recommendedLayers - 1));
  const meetsDesignTarget = approval.verifiedTopLoadKg + 1e-9 >= recalculatedRequiredTopLoadKg;
  return {
    meetsDesignTarget,
    verifiedGrossWeightKg,
    recalculatedRequiredTopLoadKg,
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
