import type { ProductItem, ProductPackagingAssignment } from './engine/productPackagingOptimizer';

export const OPEN_PACKAGING_CONTENTS_EVENT = 'container-loading:open-packaging-contents';
export type PackagingInspectionRequest = { cargoId?: string; productId?: string };
export type PackagingInspection = { product: ProductItem; assignment: ProductPackagingAssignment; units: number };
export function openPackagingContents(request: PackagingInspectionRequest) {
  window.dispatchEvent(new CustomEvent(OPEN_PACKAGING_CONTENTS_EVENT, { detail: request }));
}

/** Display-only regular grid matching the existing packaging orientation/layer rules. */
export function packagingContentsModel({ product, assignment, units }: PackagingInspection, limit = 600) {
  const inner = [assignment.innerLength, assignment.innerWidth, assignment.innerHeight];
  const outer = [assignment.outerLength, assignment.outerWidth, assignment.outerHeight];
  const dims = [product.length, product.width, product.height];
  const invalid = [...inner, ...outer, ...dims].some(v => !Number.isFinite(v) || v <= 0)
    || inner.some((v, i) => v > outer[i] + 1e-9)
    || !Number.isSafeInteger(assignment.unitsPerBox) || assignment.unitsPerBox < 1
    || !Number.isSafeInteger(product.quantity) || product.quantity < units
    || !Number.isSafeInteger(units) || units < 1 || units > assignment.unitsPerBox
    || !Number.isSafeInteger(limit) || limit < 1
    || !Number.isFinite(product.cushioningM ?? 0) || (product.cushioningM ?? 0) < 0;
  if (invalid) return null;
  const padding = product.cushioningM ?? 0;
  const policy = product.orientationPolicy ?? (product.allowRotation === false ? 'upright' : 'base-rotation');
  if (!['upright', 'base-rotation', 'any'].includes(policy)) return null;
  const permutations = policy === 'upright' ? [[0, 1, 2]] : policy === 'any'
    ? [[0, 1, 2], [1, 0, 2], [0, 2, 1], [2, 0, 1], [1, 2, 0], [2, 1, 0]] : [[0, 1, 2], [1, 0, 2]];
  const maxLayers = product.maxInternalLayers ?? (product.fragile ? 1 : Infinity);
  if (product.maxInternalLayers != null && (!Number.isSafeInteger(maxLayers) || maxLayers < 1)) return null;
  const candidates = permutations.map(order => {
    const size = order.map(i => dims[i]);
    const pitch = size.map(d => d + 2 * padding);
    const grid = pitch.map((d, i) => Math.floor((inner[i] + 1e-9) / d));
    grid[2] = Math.min(grid[2], maxLayers);
    const capacity = grid[0] * grid[1] * grid[2];
    return { size, pitch, grid, capacity };
  }).filter(c => c.capacity >= units && c.grid.every(v => Number.isSafeInteger(v) && v > 0));
  // Choose a permitted fitting orientation; packaging does not persist interior positions.
  candidates.sort((a, b) => b.capacity - a.capacity);
  const best = candidates[0];
  if (!best) return null; // Never shrink a product to make inconsistent data look valid.
  const [nx, ny] = best.grid;
  const occupied = [Math.min(nx, units), Math.min(ny, Math.ceil(units / nx)), Math.ceil(units / (nx * ny))];
  const offset = best.pitch.map((p, i) => i === 2 ? padding : (inner[i] - occupied[i] * p) / 2 + padding);
  const positions = Array.from({ length: Math.min(units, limit) }, (_, index) => {
    const cell = [index % nx, Math.floor(index / nx) % ny, Math.floor(index / (nx * ny))];
    return cell.map((v, i) => offset[i] + v * best.pitch[i] + best.size[i] / 2);
  });
  return { size: best.size, positions, units, shown: positions.length, layers: occupied[2], inner, padding };
}
