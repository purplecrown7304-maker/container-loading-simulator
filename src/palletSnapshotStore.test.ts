import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PALLET_SNAPSHOT_UPDATED_EVENT,
  clearPalletSnapshot,
  publishPalletSnapshot,
  readPalletSnapshot,
  subscribePalletSnapshot,
  type PalletSnapshot,
} from './palletSnapshotStore';

const snapshot = {
  spec: {
    length: 1.1,
    width: 1.1,
    height: 0.15,
    tareWeightKg: 20,
    maxLoadKg: 1000,
    maxStackLevels: 3,
  },
  result: {
    palletCount: 1,
    placements: [],
    remaining: [],
    pallets: [],
    totalPalletizedWeightKg: 20,
    stackedPallets: 0,
    optimization: { selectedStackTarget: 1, floorPositions: 1 },
  },
} as unknown as PalletSnapshot;

afterEach(() => clearPalletSnapshot({ preserveCertification: true }));

describe('pallet snapshot domain store', () => {
  it('publishes to store, legacy window mirror, event bus, and subscribers', () => {
    const subscriber = vi.fn();
    const eventListener = vi.fn();
    const unsubscribe = subscribePalletSnapshot(subscriber);
    window.addEventListener(PALLET_SNAPSHOT_UPDATED_EVENT, eventListener);

    publishPalletSnapshot(snapshot, { preserveCertification: true });

    expect(readPalletSnapshot()).toBe(snapshot);
    expect((window as Window & { __containerLoadingPalletSnapshot?: PalletSnapshot }).__containerLoadingPalletSnapshot).toBe(snapshot);
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(eventListener).toHaveBeenCalledTimes(1);

    unsubscribe();
    window.removeEventListener(PALLET_SNAPSHOT_UPDATED_EVENT, eventListener);
  });

  it('adapts legacy snapshot events into the domain store', () => {
    clearPalletSnapshot({ preserveCertification: true });
    (window as Window & { __containerLoadingPalletSnapshot?: PalletSnapshot }).__containerLoadingPalletSnapshot = snapshot;
    window.dispatchEvent(new CustomEvent<PalletSnapshot>(PALLET_SNAPSHOT_UPDATED_EVENT, { detail: snapshot }));
    expect(readPalletSnapshot()).toBe(snapshot);
  });

  it('clears both store and compatibility mirror', () => {
    publishPalletSnapshot(snapshot, { preserveCertification: true });
    clearPalletSnapshot({ preserveCertification: true });
    expect(readPalletSnapshot()).toBeUndefined();
    expect((window as Window & { __containerLoadingPalletSnapshot?: PalletSnapshot }).__containerLoadingPalletSnapshot).toBeUndefined();
  });
});
