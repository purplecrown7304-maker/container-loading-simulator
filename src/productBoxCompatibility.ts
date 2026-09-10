import type { BoxCatalogItem, ProductItem } from './engine/productPackagingOptimizer';

const EPS = 1e-9;

type Orientation = [number, number, number];

export type ProductBoxCompatibility = {
  status: 'fit' | 'unfit' | 'no-box';
  compatibleBoxCount: number;
  exampleBox?: BoxCatalogItem;
};

function effectiveDimensions(product: ProductItem): Orientation {
  const padding = Math.max(0, product.cushioningM ?? 0);
  return [
    product.length + padding * 2,
    product.width + padding * 2,
    product.height + padding * 2,
  ];
}

function orientations(product: ProductItem): Orientation[] {
  const [l, w, h] = effectiveDimensions(product);
  const policy = product.orientationPolicy ?? (product.allowRotation === false ? 'upright' : 'base-rotation');
  if (policy === 'upright') return [[l, w, h]];
  if (policy === 'any') return [[l, w, h], [w, l, h], [l, h, w], [h, l, w], [w, h, l], [h, w, l]];
  return [[l, w, h], [w, l, h]];
}

function fitsBox(product: ProductItem, box: BoxCatalogItem) {
  const payloadCapacity = box.maxGrossWeightKg - box.tareWeightKg;
  if (payloadCapacity + EPS < product.weightKg) return false;
  return orientations(product).some(([l, w, h]) =>
    l <= box.innerLength + EPS
    && w <= box.innerWidth + EPS
    && h <= box.innerHeight + EPS,
  );
}

export function getProductBoxCompatibility(product: ProductItem, boxes: BoxCatalogItem[]): ProductBoxCompatibility {
  if (!boxes.length) return { status: 'no-box', compatibleBoxCount: 0 };
  const compatible = boxes.filter(box => fitsBox(product, box));
  if (!compatible.length) return { status: 'unfit', compatibleBoxCount: 0 };
  return { status: 'fit', compatibleBoxCount: compatible.length, exampleBox: compatible[0] };
}
