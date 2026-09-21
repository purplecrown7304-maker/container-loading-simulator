import { cargoColor } from './cargoColors';
import type { ContainerSpec, LoadingResult } from './engine/types';
export function unityPlan(container: ContainerSpec, result: LoadingResult, revision: number, cargo: Array<{ id: string; displayColor?: string }> = []) {
  const colors = new Map(cargo.map(item => [item.id, item.displayColor]));
  const invalid = new Set(result.validationIssues.flatMap(issue => issue.placementIndexes));
  return { revision, container: { length: container.length, width: container.width, height: container.height }, placements: result.placements.map((p, i) => ({ ...p, color: cargoColor(p.cargoId, colors.get(p.cargoId)), invalid: invalid.has(i) })) };
}
export type UnityCommand = { action: 'cut' | 'shell' | 'step' | 'play' | 'select' | 'view'; value?: number; view?: string };
