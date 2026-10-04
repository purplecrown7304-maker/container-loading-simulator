import { preflightCargoInput } from '../engine/inputPreflight';
import type { CargoItem, ContainerSpec } from '../engine/types';

/** Property order is not input identity; array order remains significant. */
export function exactInputSignature(value: unknown): string {
  const stable = (input: unknown): unknown => {
    if (typeof input === 'number' && !Number.isFinite(input)) return { nonFiniteNumber: String(input) };
    if (Array.isArray(input)) return input.map(stable);
    if (input && typeof input === 'object') return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, stable(value)]));
    return input;
  };
  return JSON.stringify(stable(value));
}

export function normalizedCargoIdentity(cargo: CargoItem[]) {
  const checked = preflightCargoInput(cargo);
  return { cargo: checked.cargo.sort((a, b) => a.id.localeCompare(b.id)), rejected: checked.rejected };
}

export function createLoadingSourceSignature(container: ContainerSpec, cargo: CargoItem[]): string {
  return exactInputSignature({ container, ...normalizedCargoIdentity(cargo) });
}

type SourceWindow = Window & {
  __containerLoadingLatestResult?: { container: ContainerSpec; cargo: CargoItem[]; sourceSignature?: string };
};

/** The published input survives clearing the optional viewer/physics target. */
export function isCurrentLoadingSource(container: ContainerSpec, cargo: CargoItem[]): boolean {
  if (typeof window === 'undefined') return true;
  const current = (window as SourceWindow).__containerLoadingLatestResult;
  if (!current) return true;
  const actual = createLoadingSourceSignature(current.container, current.cargo);
  const published = current.sourceSignature ?? actual;
  return actual === published && createLoadingSourceSignature(container, cargo) === published;
}
