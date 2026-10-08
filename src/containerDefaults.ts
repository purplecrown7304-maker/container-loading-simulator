import { DEFAULT_CEILING_CLEARANCE_M } from './engine/constraints';
import type { ContainerSpec } from './engine/types';

/**
 * LOADING_RULES R-5 (대표 결정 2026-10-08): the app plans with the recommended 5 cm ceiling
 * clearance. A spec that already states a value, including 0, is left as it is.
 */
export function withRecommendedCeilingClearance<T extends ContainerSpec>(container: T): T {
  return container.ceilingClearanceM === undefined ? { ...container, ceilingClearanceM: DEFAULT_CEILING_CLEARANCE_M } : container;
}
