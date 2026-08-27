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
  /** 최종 선택된 결정적 휴리스틱. 디버깅/회귀 확인용이다. */
  heuristic?: PackingHeuristic;
};

type Point = { x: number; y: number; z: number };
type Orientation = { length: number; width: number; height: number; rotated: boolean };
export type PackingHeuristic = 'volume' | 'footprint' | 'longest-edge' | 'weight';

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

function unitVolume(unit: MixedCartonUnit) {
  return unit.length * unit.width * unit.height;
}

function longestEdge(unit: MixedCartonUnit) {
  return Math.max(unit.length, unit.width, unit.height);
}

function orderedUnits(units: MixedCartonUnit[], heuristic: PackingHeuristic) {
  return [...units].sort((a, b) => {
    if (heuristic === 'footprint') {
      const diff = b.length * b.width - a.length * a.width;
      if (Math.abs(diff) > EPS) return diff;
    } else if (heuristic === 'longest-edge') {
      const diff = longestEdge(b) - longestEdge(a);
      if (Math.abs(diff) > EPS) return diff;
    } else if (heuristic === 'weight') {
      const diff = b.weightKg - a.weightKg;
      if (Math.abs(diff) > EPS) return diff;
    } else {
      const diff = unitVolume(b) - unitVolume(a);
      if (Math.abs(diff) > EPS) return diff;
    }
    const volumeDiff = unitVolume(b) - unitVolume(a);
    if (Math.abs(volumeDiff) > EPS) return volumeDiff;
    const weightDiff = b.weightKg - a.weightKg;
    if (Math.abs(weightDiff) > EPS) return weightDiff;
    return a.productId.localeCompare(b.productId) || a.key.localeCompare(b.key);
  });
}

function contactArea(candidate: MixedCartonPlacement, placed: MixedCartonPlacement[], box: BoxCatalogItem) {
  let area = 0;
  if (candidate.x <= EPS || candidate.x + candidate.length >= box.innerLength - EPS) area += candidate.width * candidate.height;
  if (candidate.y <= EPS || candidate.y + candidate.width >= box.innerWidth - EPS) area += candidate.length * candidate.height;
  if (candidate.z <= EPS || candidate.z + candidate.height >= box.innerHeight - EPS) area += candidate.length * candidate.width;
  for (const item of placed) {
    const overlapY = Math.max(0, Math.min(candidate.y + candidate.width, item.y + item.width) - Math.max(candidate.y, item.y));
    const overlapZ = Math.max(0, Math.min(candidate.z + candidate.height, item.z + item.height) - Math.max(candidate.z, item.z));
    if (overlapY > EPS && overlapZ > EPS && (Math.abs(candidate.x - (item.x + item.length)) <= EPS || Math.abs((candidate.x + candidate.length) - item.x) <= EPS)) area += overlapY * overlapZ;
    const overlapX = Math.max(0, Math.min(candidate.x + candidate.length, item.x + item.length) - Math.max(candidate.x, item.x));
    if (overlapX > EPS && overlapZ > EPS && (Math.abs(candidate.y - (item.y + item.width)) <= EPS || Math.abs((candidate.y + candidate.width) - item.y) <= EPS)) area += overlapX * overlapZ;
    if (overlapX > EPS && overlapY > EPS && (Math.abs(candidate.z - (item.z + item.height)) <= EPS || Math.abs((candidate.z + candidate.height) - item.z) <= EPS)) area += overlapX * overlapY;
  }
  return area;
}

function candidateBoundingVolume(candidate: MixedCartonPlacement, placed: MixedCartonPlacement[]) {
  let maxX = candidate.x + candidate.length;
  let maxY = candidate.y + candidate.width;
  let maxZ = candidate.z + candidate.height;
  for (const item of placed) {
    maxX = Math.max(maxX, item.x + item.length);
    maxY = Math.max(maxY, item.y + item.width);
    maxZ = Math.max(maxZ, item.z + item.height);
  }
  return maxX * maxY * maxZ;
}

function bestPlacementForUnit(box: BoxCatalogItem, unit: MixedCartonUnit, placed: MixedCartonPlacement[], points: Point[]) {
  const candidates: Array<{ placement: MixedCartonPlacement; point: Point; boundingVolume: number; contact: number }> = [];
  const currentPoints = normalizedPoints(points, box, placed);
  for (const point of currentPoints) {
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
      candidates.push({
        placement: candidate,
        point,
        boundingVolume: candidateBoundingVolume(candidate, placed),
        contact: contactArea(candidate, placed, box),
      });
    }
  }
  return candidates.sort((a, b) =>
    a.placement.z - b.placement.z
    || a.boundingVolume - b.boundingVolume
    || b.contact - a.contact
    || a.placement.x - b.placement.x
    || a.placement.y - b.placement.y
    || a.placement.height - b.placement.height
    || a.placement.length - b.placement.length
    || a.placement.width - b.placement.width,
  )[0];
}

function addExtremePoints(points: Point[], chosen: MixedCartonPlacement, placed: MixedCartonPlacement[]) {
  points.push(
    { x: chosen.x + chosen.length, y: chosen.y, z: chosen.z },
    { x: chosen.x, y: chosen.y + chosen.width, z: chosen.z },
    { x: chosen.x, y: chosen.y, z: chosen.z + chosen.height },
  );
  // 기존 면과 새 박스 면의 교차점도 후보로 추가한다. 이는 단순 3축 피벗보다
  // 계단형 빈 공간을 다시 찾는 데 유리하며 모든 후보는 후속 경계/충돌/지지 검사를 거친다.
  for (const item of placed) {
    points.push(
      { x: item.x + item.length, y: chosen.y, z: chosen.z },
      { x: chosen.x, y: item.y + item.width, z: chosen.z },
      { x: chosen.x, y: chosen.y, z: item.z + item.height },
    );
  }
}

function buildPacking(box: BoxCatalogItem, allUnits: MixedCartonUnit[], consideredUnits: MixedCartonUnit[], heuristic: PackingHeuristic): MixedCartonPacking {
  const ordered = orderedUnits(consideredUnits, heuristic);
  const placed: MixedCartonPlacement[] = [];
  const consideredKeys = new Set(consideredUnits.map((unit) => unit.key));
  const unplaced = new Set(allUnits.map((unit) => unit.key));
  let points: Point[] = [{ x: 0, y: 0, z: 0 }];
  let payloadWeight = 0;

  for (const unit of ordered) {
    if (box.tareWeightKg + payloadWeight + unit.weightKg > box.maxGrossWeightKg + EPS) continue;
    const best = bestPlacementForUnit(box, unit, placed, points);
    if (!best) continue;
    const chosen = best.placement;
    placed.push(chosen);
    payloadWeight += unit.weightKg;
    unplaced.delete(unit.key);
    points = normalizedPoints(points.filter((point) => pointKey(point) !== pointKey(best.point)), box, placed);
    addExtremePoints(points, chosen, placed.filter((item) => item.unitKey !== chosen.unitKey));
  }

  // maxUnits로 탐색에서 제외한 단위도 반드시 미배치로 남겨 수량 유실을 막는다.
  for (const unit of allUnits) if (!consideredKeys.has(unit.key)) unplaced.add(unit.key);

  const productByKey = new Map(allUnits.map((unit) => [unit.key, unit]));
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
    heuristic,
  };
}

function packingOccupiedBounds(packing: MixedCartonPacking) {
  let maxX = 0;
  let maxY = 0;
  let maxZ = 0;
  for (const item of packing.placements) {
    maxX = Math.max(maxX, item.x + item.length);
    maxY = Math.max(maxY, item.y + item.width);
    maxZ = Math.max(maxZ, item.z + item.height);
  }
  return maxX * maxY * maxZ;
}

export function packMixedUnitsIntoCarton(
  box: BoxCatalogItem,
  units: MixedCartonUnit[],
  maxUnits = 500,
): MixedCartonPacking {
  const limit = Math.max(0, Math.floor(maxUnits));
  const considered = units.slice(0, limit);
  const heuristics: PackingHeuristic[] = ['volume', 'footprint', 'longest-edge', 'weight'];
  const candidates = heuristics.map((heuristic) => buildPacking(box, units, considered, heuristic));
  return candidates.sort((a, b) =>
    b.placements.length - a.placements.length
    || b.fillRate - a.fillRate
    || packingOccupiedBounds(a) - packingOccupiedBounds(b)
    || a.unplacedUnitKeys.join('|').localeCompare(b.unplacedUnitKeys.join('|'))
    || (a.heuristic ?? '').localeCompare(b.heuristic ?? ''),
  )[0] ?? buildPacking(box, units, considered, 'volume');
}
