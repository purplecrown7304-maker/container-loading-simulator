import type { ProductItem } from './engine/productPackagingOptimizer';

export type CompanyProductItem = ProductItem & {
  /** false면 별도 박스 포장 없이 제품 자체를 적재 단위로 사용한다. 기존 데이터는 true로 본다. */
  requiresBoxPackaging?: boolean;
};

export function requiresBoxPackaging(product: ProductItem | CompanyProductItem) {
  return (product as CompanyProductItem).requiresBoxPackaging !== false;
}
