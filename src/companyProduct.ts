import type { ProductItem } from './engine/productPackagingOptimizer';

export type CompanyProductItem = ProductItem & {
  /** false면 별도 박스 포장 없이 제품 자체를 적재 단위로 사용한다. 기존 데이터는 true로 본다. */
  requiresBoxPackaging?: boolean;
};

export function requiresBoxPackaging(product: ProductItem | CompanyProductItem) {
  return (product as CompanyProductItem).requiresBoxPackaging !== false;
}

type LegacyVirtualProductSpec = {
  id: string;
  name: string;
  length: number;
  width: number;
  height: number;
  weightKg: number;
};

/**
 * 2026-08 기업 포장 플래너의 "샘플 불러오기"가 생성했던 가상 제품들이다.
 * 운영 제품과 충돌하지 않도록 ID만으로 지우지 않고 이름/치수/중량까지 모두 일치할 때만 제거한다.
 */
const LEGACY_VIRTUAL_PRODUCTS: LegacyVirtualProductSpec[] = [
  { id: 'PRD-A', name: '제품 A', length: 0.22, width: 0.12, height: 0.08, weightKg: 0.6 },
  { id: 'PRD-B', name: '제품 B', length: 0.31, width: 0.18, height: 0.11, weightKg: 1.2 },
  { id: 'PRD-C', name: '파손주의 C', length: 0.16, width: 0.1, height: 0.07, weightKg: 0.35 },
];

const closeEnough = (a: number, b: number, tolerance = 0.0001) => Math.abs(a - b) <= tolerance;

export function isLegacyVirtualCompanyProduct(product: Pick<ProductItem, 'id' | 'name' | 'length' | 'width' | 'height' | 'weightKg'>) {
  const spec = LEGACY_VIRTUAL_PRODUCTS.find(item => item.id === product.id);
  if (!spec) return false;
  return product.name === spec.name
    && closeEnough(product.length, spec.length)
    && closeEnough(product.width, spec.width)
    && closeEnough(product.height, spec.height)
    && closeEnough(product.weightKg, spec.weightKg, 0.001);
}
