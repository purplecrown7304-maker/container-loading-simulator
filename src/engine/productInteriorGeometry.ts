import type { ProductItem } from './productPackagingOptimizer';

export const DEFAULT_PRODUCT_GAP_M = 0.001;
export const productGapM = (product: Pick<ProductItem, 'productGapM'>) => product.productGapM ?? DEFAULT_PRODUCT_GAP_M;
export function productPackingOrientations(product: ProductItem): number[][] {
  const [l, w, h] = [product.length, product.width, product.height];
  const policy = product.orientationPolicy ?? (product.allowRotation === false ? 'upright' : 'base-rotation');
  if (!['upright', 'base-rotation', 'any'].includes(policy)) return [];
  const raw = policy === 'upright' ? [[l, w, h]] : policy === 'any'
    ? [[l, w, h], [w, l, h], [l, h, w], [h, l, w], [w, h, l], [h, w, l]] : [[l, w, h], [w, l, h]];
  const seen = new Set<string>();
  return raw.filter(size => { const key = size.join(':'); if (seen.has(key)) return false; seen.add(key); return true; });
}
/** n products use n*size + (n-1)*gap, with cushioning at both carton walls. */
export function productInteriorGrid(product: ProductItem, inner: number[], size: number[]) {
  const padding = product.cushioningM ?? 0, gap = productGapM(product);
  const layers = product.maxInternalLayers ?? (product.fragile ? 1 : Infinity);
  if (![...size, ...inner].every(v => Number.isFinite(v) && v > 0)
    || !Number.isFinite(padding) || padding < 0 || !Number.isFinite(gap) || gap < 0
    || (product.maxInternalLayers != null && (!Number.isSafeInteger(layers) || layers < 1))) return [0, 0, 0];
  const grid = size.map((v, i) => Math.max(0, Math.floor((inner[i] - 2 * padding + gap + 1e-9) / (v + gap))));
  grid[2] = Math.min(grid[2], layers);
  return grid;
}
export function productInteriorRequiredExtent(product: ProductItem, size: number, count: number) {
  return count * size + Math.max(0, count - 1) * productGapM(product) + 2 * (product.cushioningM ?? 0);
}
