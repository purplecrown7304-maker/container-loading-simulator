import { containerInputError, preflightCargoInput } from './engine/inputPreflight';
import type { CargoItem, ContainerSpec, LoadingResult, Placement } from './engine/types';
import { createExternalStore } from './store/externalStore';

export const WORKFLOW_PREVIEW_EVENT = 'container-loading:workflow-preview';
export const WORKFLOW_INPUT_INVALIDATED_EVENT = 'container-loading:workflow-input-invalidated';
export type WorkflowPreview = { cargo: CargoItem[]; kind: 'products' | 'packaging' };
export type WorkflowPreviewSnapshot = WorkflowPreview & { key: string };
const store = createExternalStore<WorkflowPreviewSnapshot | null>(null);

/** View-only data. Never publish it as a loading result or a physics target. */
export function publishWorkflowPreview(next: WorkflowPreview | null) {
  const key = next ? JSON.stringify(next) : null;
  if ((store.getSnapshot()?.key ?? null) === key) return;
  const snapshot = next ? { kind: next.kind, cargo: next.cargo.map(item => ({ ...item })), key: key! } : null;
  store.setSnapshot(snapshot);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(WORKFLOW_PREVIEW_EVENT, { detail: snapshot }));
}

export const readWorkflowPreview = store.getSnapshot;
export const useWorkflowPreview = store.useSnapshot;

/**
 * A bounded, single-layer staging preview, not an optimization candidate.
 * Real dimensions are retained; oversized/invalid items are omitted, never shrunk.
 * Floor-only placements avoid unsupported stacks and maintain bounds/payload limits.
 */
export function createWorkflowFloorPreview(container: ContainerSpec, input: CargoItem[]) {
  const result: LoadingResult = { placements: [], remaining: [], validationIssues: [], usedVolumeM3: 0, loadedWeightKg: 0 };
  const { cargo } = preflightCargoInput(input);
  const requested = cargo.reduce((sum, item) => sum + item.quantity, 0);
  if (containerInputError(container)) return { result, requested, shown: 0 };
  const gap = 0.025;
  let x = 0, y = 0, rowLength = 0;
  for (const item of cargo) {
    const orientations = [{ length: item.length, width: item.width, rotated: false }];
    if (item.allowRotation !== false) orientations.push({ length: item.width, width: item.length, rotated: true });
    const fits = (positionX: number, positionY: number) => orientations.find(size =>
      positionX + size.length <= container.length && positionY + size.width <= container.width && item.height <= container.height);
    let count = 0;
    // Cap rendering cost independently of untrusted input quantities.
    for (; count < Math.min(item.quantity, 240) && result.placements.length < 240; count += 1) {
      if (result.loadedWeightKg + item.weightKg > container.maxPayloadKg) break;
      if (container.floorLoadLimitKgPerM2 != null && item.weightKg / (item.length * item.width) > container.floorLoadLimitKgPerM2) break;
      let size = fits(x, y);
      if (!size) {
        // Do not consume floor space when this item cannot fit even on a new row.
        const nextX = x + rowLength + (rowLength ? gap : 0);
        size = fits(nextX, 0);
        if (!size) break;
        x = nextX; y = 0; rowLength = 0;
      }
      const placement: Placement = { cargoId: item.id, x, y, z: 0, ...size, height: item.height, weightKg: item.weightKg };
      result.placements.push(placement);
      result.loadedWeightKg += item.weightKg;
      result.usedVolumeM3 += item.length * item.width * item.height;
      y += size.width + gap;
      rowLength = Math.max(rowLength, size.length);
    }
    if (count < item.quantity) result.remaining.push({ cargoId: item.id, quantity: item.quantity - count, reason: '미리보기 표시 한도 · 최종 적재 전' });
  }
  return { result, requested, shown: result.placements.length };
}
