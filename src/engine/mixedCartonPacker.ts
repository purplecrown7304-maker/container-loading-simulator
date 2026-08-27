import type { BoxCatalogItem, ProductItem, ProductOrientationPolicy } from './productPackagingOptimizer';

const EPS = 1e-9;

export type MixedCartonUnit = {
  key: string;
  productId: string;
  productName: string;
  length: number;
  width: number;
  height: number;
  weightKg: number;
  orientationPolicy: ProductOrientationPolicy;
  cushioningM: number;
};

export type MixedCartonPlacement = {
  unitKey: string;
  productId: string;
  x: number;
  y: number;
  z: number;
  length: number;
  width: number;
  height: number;
  rotated: boolean;
};

export type MixedCartonPacking = {
  boxId: string;
  boxName: string;
  placements: MixedCartonPlacement[];
  unplacedUnitKeys: string[];
  contents: Array<{ productId: string; productName: string; quantity: number }>;
  grossWeightKg: number;
  fillRate: number;
};

type Point = { x: number; y: number; z: number };
type Orientation = { length: number; width: number; height: number; rotated: boolean };

function productPolicy(product: ProductItem): ProductOrientationPolicy {
  if (product.orientationPolicy === 'upright' || product.orientationPolicy === 'base-rotation' || product.orientationPolicy === 'any') return product.orientationPolicy;
  return product.allowRotation === false ? 'upright' : 'base-rotation';
}

export function residualUnitsForProducts(
  products: ProductItem[],
  unitsPerBox: Map<string, number>,
): { mixable: MixedCartonUnit[]; dedicated: MixedCartonUnit[] } {
  const mixable: MixedCartonUnit[] = [];
  const dedicated: MixedCartonUnit[] = [];
  for (const product of products) {
    const perBox = Math.max(1, Math.floor(unitsPerBox.get(product.id) ?? 1));
    const remainder = product.quantity % perBox;
    if (!remainder) continue;
    for (let index = 0; index < remainder; index += 1) {
      const unit: MixedCartonUnit = {
        key: `${product.id}#${index + 1}`,
        productId: product.id,
        productName: product.name,
        length: product.length,
        width: product.width,
        height: product.height,
        weightKg: product.weightKg,
        orientationPolicy: productPolicy(product),
        cushioningM: Math.max(0, product.cushioningM ?? 0),
      };
      // 파손주의 제품은 명시적으로 허용해도 다른 SKU와 섞지 않는 보수적 기본값을 사용한다.
      if (product.allowMixedCarton === false || product.fragile) dedicated.push(unit);
      else mixable.push(unit);
    }
  }
  return { mixable, dedicated };
}

function orientations(unit: MixedCartonUnit): Orientation[] {
  const pad = unit.cushioningM * 2;
  const l = unit.length + pad;
  const w = unit.width + pad;
  const h = unit.height + pad;
  const raw: Array<[number, number, number, boolean]> = unit.orientationPolicy === 'upright'
    ? [[l, w, h, false]]
    : unit.orientationPolicy === 'base-rotation'
      ? [[l, w, h, false], [w, l, h, true]]
      : [
          [l, w, h, false], [w, l, h, true], [l, h, w, true],
          [h, l, w, true], [w, h, l, true], [h, w, l, true],
        ];
  const seen = new Set<string>();
  return raw
    .filter(([a, b, c]) => {
      const key = `${a.toFixed(6)}:${b.toFixed(6)}:${c.toFixed(6)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(([length, width, height, rotated]) => ({ length, width, height, rotated }))
    .sort((a, b) => (b.length * b.width) - (a.length * a.width) || a.height - b.height || a.length - b.length || a.width - b.width);
}

function collides(candidate: MixedCartonPlacement, placed: MixedCartonPlacement[]) {
  return placed.some((item) =>
    candidate.x < item.x + item.length - EPS && candidate.x + candidate.length > item.x + EPS
    && candidate.y < item.y + item.width - EPS && candidate.y + candidate.width > item.y + EPS
    && candidate.z < item.z + item.height - EPS && candidate.z + candidate.height > item.z + EPS,
  );
}

function isSupported(candidate: MixedCartonPlacement, placed: MixedCartonPlacement[]) {
  if (candidate.z <= EPS) return true;
  return placed.some((below) =>
    Math.abs((below.z + below.height) - candidate.z) <= EPS
    && candidate.x >= below.x - EPS
    && candidate.y >= below.y - EPS
    && candidate.x + candidate.length <= below.x + below.length + EPS
    && candidate.y + candidate.width <= below.y + below.width + EPS,
  );
}

function pointKey(point: Point) {
  return `${point.x.toFixed(6)}:${point.y.toFixed(6)}:${point.z.toFixed(6)}`;
}

function normalizedPoints(points: Point[], box: BoxCatalogItem, placed: MixedCartonPlacement[]) {
  const unique = new Map<string, Point>();
  for (const point of points) {
    if (point.x < -EPS || point.y < -EPS || point.z < -EPS) continue;
    if (point.x > box.innerLength - EPS || point.y > box.innerWidth - EPS || point.z > box.innerHeight - EPS) continue;
    const insideExisting = placed.some((item) =>
      point.x > item.x + EPS && point.x < item.x + item.length - EPS
      && point.y > item.y + EPS && point.y < item.y + item.width - EPS
      && point.z > item.z + EPS && point.z < item.z + item.height - EPS,
    );
    if (!insideExisting) unique.set(pointKey(point), point);
  }
  return [...unique.values()].sort((a, b) => a.z - b.z || a.x - b.x || a.y - b.y);
}

export function packMixedUnitsIntoCarton(
  box: BoxCatalogItem,
  units: MixedCartonUnit[],
  maxUnits = 500,
): MixedCartonPacking {
  const ordered = [...units]
    .slice(0, Math.max(0, Math.floor(maxUnits)))
    .sort((a, b) =>
      (b.length * b.width * b.height) - (a.length * a.width * a.height)
      || b.weightKg - a.weightKg
      || a.productId.localeCompare(b.productId)
      || a.key.localeCompare(b.key),
    );
  const placed: MixedCartonPlacement[] = [];
  const unplaced = new Set(ordered.map((unit) => unit.key));
  let points: Point[] = [{ x: 0, y: 0, z: 0 }];
  let payloadWeight = 0;

  for (const unit of ordered) {
    if (box.tareWeightKg + payloadWeight + unit.weightKg > box.maxGrossWeightKg + EPS) continue;
    let chosen: MixedCartonPlacement | undefined;
    let chosenPointIndex = -1;
    const currentPoints = normalizedPoints(points, box, placed);
    for (let pointIndex = 0; pointIndex < currentPoints.length && !chosen; pointIndex += 1) {
      const point = currentPoints[pointIndex];
      for (const orientation of orientations(unit)) {
        const candidate: MixedCartonPlacement = {
          unitKey: unit.key,
          productId: unit.productId,
          x: point.x,
          y: point.y,
          z: point.z,
          length: orientation.length,
          width: orientation.width,
          height: orientation.height,
          rotated: orientation.rotated,
        };
        if (candidate.x + candidate.length > box.innerLength + EPS
          || candidate.y + candidate.width > box.innerWidth + EPS
          || candidate.z + candidate.height > box.innerHeight + EPS) continue;
        if (collides(candidate, placed) || !isSupported(candidate, placed)) continue;
        chosen = candidate;
        chosenPointIndex = pointIndex;
        break;
      }
    }
    if (!chosen) continue;
    placed.push(chosen);
    payloadWeight += unit.weightKg;
    unplaced.delete(unit.key);
    const usedPoint = currentPoints[chosenPointIndex];
    points = currentPoints.filter((_, index) => index !== chosenPointIndex);
    points.push(
      { x: chosen.x + chosen.length, y: chosen.y, z: chosen.z },
      { x: chosen.x, y: chosen.y + chosen.width, z: chosen.z },
      { x: chosen.x, y: chosen.y, z: chosen.z + chosen.height },
    );
    // 원점 계열 후보를 보존하면 서로 다른 높이/폭 조합에서 빈 공간을 다시 찾기 쉽다.
    if (usedPoint.x > EPS) points.push({ x: 0, y: usedPoint.y, z: usedPoint.z });
    if (usedPoint.y > EPS) points.push({ x: usedPoint.x, y: 0, z: usedPoint.z });
  }

  const productByKey = new Map(ordered.map((unit) => [unit.key, unit]));
  const contentMap = new Map<string, { productId: string; productName: string; quantity: number }>();
  let physicalVolume = 0;
  for (const placement of placed) {
    const unit = productByKey.get(placement.unitKey);
    if (!unit) continue;
    physicalVolume += unit.length * unit.width * unit.height;
    const current = contentMap.get(unit.productId) ?? { productId: unit.productId, productName: unit.productName, quantity: 0 };
    current.quantity += 1;
    contentMap.set(unit.productId, current);
  }
  const boxVolume = box.innerLength * box.innerWidth * box.innerHeight;
  return {
    boxId: box.id,
    boxName: box.name,
    placements: placed,
    unplacedUnitKeys: [...unplaced].sort(),
    contents: [...contentMap.values()].sort((a, b) => a.productId.localeCompare(b.productId)),
    grossWeightKg: box.tareWeightKg + payloadWeight,
    fillRate: boxVolume > 0 ? Math.min(1, physicalVolume / boxVolume) : 0,
  };
}
