import type { AxleModel, Config, Orientation } from './loadSimA/types';
import { DEFAULT_CONFIG } from './loadSimA/presets';
import type { ContainerSpec } from './types';

export type LoadingRuleset = 'legacy' | 'a-v1';
export type RulesContext = {
  version: 'a-v1';
  equipmentId: string;
  kind: 'container' | 'truck';
  access: Array<'rear' | 'left' | 'right' | 'top'>;
  door?: { w: number; h: number };
  tareKg?: number;
  floorLineLoadKgPerM?: number;
  heightLimitMm?: number;
  axles?: AxleModel;
  config?: Partial<Config>;
  source: string;
};
export const isARules = (container: ContainerSpec) => container.rules?.version === 'a-v1';
export const aConfig = (container: ContainerSpec): Config => ({ ...DEFAULT_CONFIG, ...container.rules?.config,
  // Pairs registered on the loading-method step apply to A as well; an explicit A config still wins when none are registered.
  ...(container.incompatiblePairs?.length ? { incompatiblePairs: container.incompatiblePairs } : {}),
  ...(container.unloadingPolicy ? { strictUnloadOrder: container.unloadingPolicy === 'strict' } : {}),
  margins: { ...DEFAULT_CONFIG.margins, ...container.rules?.config?.margins } });
export const placementOrientation = (p: { orientation?: Orientation; rotated?: boolean }): Orientation => p.orientation ?? (p.rotated ? 'WLH' : 'LWH');
export function rotateHorizontal(o: Orientation): Orientation { return (o[1] + o[0] + o[2]) as Orientation; }
