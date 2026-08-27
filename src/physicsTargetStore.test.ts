import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PHYSICS_TARGET_EVENT,
  clearPhysicsTarget,
  publishPhysicsTarget,
  readPhysicsTarget,
  subscribePhysicsTarget,
  type PhysicsTarget,
} from './physicsTarget';

const target: PhysicsTarget = {
  mode: 'boxes',
  container: { length: 2, width: 1, height: 1, maxPayloadKg: 1000 },
  cargo: [{ id: 'A', name: 'A', length: 0.5, width: 0.4, height: 0.3, weightKg: 10, quantity: 1 }],
  result: {
    placements: [{ cargoId: 'A', x: 0, y: 0, z: 0, length: 0.5, width: 0.4, height: 0.3, weightKg: 10, rotated: false }],
    remaining: [],
    loadedWeightKg: 10,
    usedVolumeM3: 0.06,
    validationIssues: [],
  },
};

afterEach(() => clearPhysicsTarget());

describe('physics target domain store', () => {
  it('publishes to the store, legacy window mirror, event bus, and subscribers', () => {
    const subscriber = vi.fn();
    const eventListener = vi.fn();
    const unsubscribe = subscribePhysicsTarget(subscriber);
    window.addEventListener(PHYSICS_TARGET_EVENT, eventListener);

    publishPhysicsTarget(target);

    expect(readPhysicsTarget()).toBe(target);
    expect((window as Window & { __containerLoadingPhysicsTarget?: PhysicsTarget }).__containerLoadingPhysicsTarget).toBe(target);
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(eventListener).toHaveBeenCalledTimes(1);

    unsubscribe();
    window.removeEventListener(PHYSICS_TARGET_EVENT, eventListener);
  });

  it('clears only the requested mode and notifies subscribers', () => {
    const subscriber = vi.fn();
    const unsubscribe = subscribePhysicsTarget(subscriber);
    publishPhysicsTarget(target);
    subscriber.mockClear();

    clearPhysicsTarget('pallets');
    expect(readPhysicsTarget()).toBe(target);
    expect(subscriber).not.toHaveBeenCalled();

    clearPhysicsTarget('boxes');
    expect(readPhysicsTarget()).toBeUndefined();
    expect((window as Window & { __containerLoadingPhysicsTarget?: PhysicsTarget }).__containerLoadingPhysicsTarget).toBeUndefined();
    expect(subscriber).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('can still clear a legacy target seeded directly on window during migration', () => {
    clearPhysicsTarget();
    (window as Window & { __containerLoadingPhysicsTarget?: PhysicsTarget }).__containerLoadingPhysicsTarget = target;
    expect(readPhysicsTarget()).toBe(target);
    clearPhysicsTarget('boxes');
    expect(readPhysicsTarget()).toBeUndefined();
  });
});
