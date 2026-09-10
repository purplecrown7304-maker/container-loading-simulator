export const OPEN_PRODUCT_TOOL_EVENT = 'container-loading:open-product-tool';
export type ProductToolView = 'products' | 'cartons';

export function openProductTool(view: ProductToolView) {
  window.dispatchEvent(new CustomEvent<ProductToolView>(OPEN_PRODUCT_TOOL_EVENT, { detail: view }));
}
