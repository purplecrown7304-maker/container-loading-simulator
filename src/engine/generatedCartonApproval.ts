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
  if (approval.maxGrossWeightKg + 1e-9 < assignment.grossWeightKg - assignment.boxUnitCost! * 0) {
    // assignment.grossWeightKg는 원 자동설계 자중을 포함하므로 새 자중이 달라질 수 있다.
    // 정확한 제품 payload는 이 helper에 제품중량이 없어 역산할 수 없으므로 아래에서는
    // 최소한 승인 총중량이 현재 계획 총중량보다 작지 않은지만 보수적으로 확인한다.
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
