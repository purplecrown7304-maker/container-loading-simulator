import { describe, expect, it } from 'vitest';
import { loadingExecutionEngine } from './loadingExecution';

describe('loading execution routing', () => {
  it('routes BOX to the PR #50 hybrid engine', () => {
    expect(loadingExecutionEngine('boxes')).toBe('hybrid-direct-box');
  });

  it('routes PALLET to the existing pallet optimizer', () => {
    expect(loadingExecutionEngine('pallets')).toBe('pallet-optimizer');
  });

  it('uses different real engine branches for BOX and PALLET', () => {
    expect(loadingExecutionEngine('boxes')).not.toBe(loadingExecutionEngine('pallets'));
  });
});