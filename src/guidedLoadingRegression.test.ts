// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LOADING_STRATEGY_SELECTION_EVENT,
  readUserLoadingStrategy,
  writeUserLoadingStrategy,
  type UserLoadingStrategy,
} from './engine/loadingStrategy';
import {
  GUIDED_LOADING_UNIT_EVENT,
  readGuidedLoadingUnit,
  writeGuidedLoadingUnit,
  type GuidedLoadingUnit,
} from './guidedLoadingUnit';
import {
  readStoredState,
  STORAGE_UPDATED_EVENT,
  writeStoredState,
  type StoredState,
} from './storage';

const baseState: StoredState = {
  container: {
    length: 5.9,
    width: 2.352,
    height: 2.395,
    maxPayloadKg: 28130,
    floorLoadLimitKgPerM2: 1500,
    floorLoadWarningMultiplier: 3,
  },
  cargo: [{
    id: 'PKG-A',
    name: 'A',
    length: 0.5,
    width: 0.4,
    height: 0.3,
    weightKg: 12,
    quantity: 27,
    allowRotation: true,
  }],
};

type RuntimeWindow = Window & {
  __containerLoadingLatestResult?: unknown;
  __containerLoadingPalletSnapshot?: unknown;
  __containerLoadingLatestPhysics?: unknown;
  __containerLoadingStrategyDecision?: unknown;
};

beforeEach(() => {
  localStorage.clear();
  const runtime = window as RuntimeWindow;
  runtime.__containerLoadingLatestResult = undefined;
  runtime.__containerLoadingPalletSnapshot = undefined;
  runtime.__containerLoadingLatestPhysics = undefined;
  runtime.__containerLoadingStrategyDecision = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('guided loading regression guards', () => {
  it('does not emit a storage update when the same canonical input is written twice', () => {
    const listener = vi.fn();
    window.addEventListener(STORAGE_UPDATED_EVENT, listener);
    writeStoredState(baseState, true);
    listener.mockClear();

    writeStoredState({
      cargo: baseState.cargo.map(item => ({ ...item })),
      container: { ...baseState.container },
    }, true);

    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener(STORAGE_UPDATED_EVENT, listener);
  });

  it('preserves the completed runtime result when an equivalent state is written again', () => {
    writeStoredState(baseState, true);
    const runtime = window as RuntimeWindow;
    const completed = { placements: [{ cargoId: 'PKG-A' }] };
    runtime.__containerLoadingLatestResult = completed;

    writeStoredState({
      container: {
        maxPayloadKg: 28130,
        height: 2.395,
        width: 2.352,
        length: 5.9,
        floorLoadWarningMultiplier: 3,
        floorLoadLimitKgPerM2: 1500,
      },
      cargo: baseState.cargo.map(item => ({
        quantity: item.quantity,
        weightKg: item.weightKg,
        height: item.height,
        width: item.width,
        length: item.length,
        name: item.name,
        id: item.id,
        allowRotation: true,
      })),
    }, true);

    expect(runtime.__containerLoadingLatestResult).toBe(completed);
  });

  it('invalidates runtime results when cargo quantity really changes', () => {
    writeStoredState(baseState, true);
    const runtime = window as RuntimeWindow;
    runtime.__containerLoadingLatestResult = { placements: [{ cargoId: 'PKG-A' }] };
    const listener = vi.fn();
    window.addEventListener(STORAGE_UPDATED_EVENT, listener);

    writeStoredState({
      ...baseState,
      cargo: baseState.cargo.map(item => ({ ...item, quantity: item.quantity + 1 })),
    }, true);

    expect(runtime.__containerLoadingLatestResult).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(readStoredState()?.cargo[0]?.quantity).toBe(28);
    window.removeEventListener(STORAGE_UPDATED_EVENT, listener);
  });

  it('invalidates runtime results when the selected loading space really changes', () => {
    writeStoredState(baseState, true);
    const runtime = window as RuntimeWindow;
    runtime.__containerLoadingLatestResult = { placements: [{ cargoId: 'PKG-A' }] };

    writeStoredState({
      ...baseState,
      container: { ...baseState.container, length: 12.032, maxPayloadKg: 28750 },
    }, true);

    expect(runtime.__containerLoadingLatestResult).toBeUndefined();
    expect(readStoredState()?.container.length).toBe(12.032);
  });

  it('keeps each user loading strategy distinct in storage and selection events', () => {
    const modes: UserLoadingStrategy[] = ['balance', 'capacity', 'safety', 'unloading', 'auto'];
    const observed: UserLoadingStrategy[] = [];
    const listener = (event: Event) => observed.push((event as CustomEvent<UserLoadingStrategy>).detail);
    window.addEventListener(LOADING_STRATEGY_SELECTION_EVENT, listener);

    for (const mode of modes) {
      writeUserLoadingStrategy(mode);
      expect(readUserLoadingStrategy()).toBe(mode);
    }

    expect(observed).toEqual(modes);
    window.removeEventListener(LOADING_STRATEGY_SELECTION_EVENT, listener);
  });

  it('keeps box and pallet guided loading units distinct in storage and events', () => {
    const observed: GuidedLoadingUnit[] = [];
    const listener = (event: Event) => observed.push((event as CustomEvent<GuidedLoadingUnit>).detail);
    window.addEventListener(GUIDED_LOADING_UNIT_EVENT, listener);

    writeGuidedLoadingUnit('pallets');
    expect(readGuidedLoadingUnit()).toBe('pallets');
    writeGuidedLoadingUnit('boxes');
    expect(readGuidedLoadingUnit()).toBe('boxes');

    expect(observed).toEqual(['pallets', 'boxes']);
    window.removeEventListener(GUIDED_LOADING_UNIT_EVENT, listener);
  });
});
