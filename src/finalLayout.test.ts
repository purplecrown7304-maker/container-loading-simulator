import { afterEach, describe, expect, it } from 'vitest';
import type { InertiaCertification } from './inertiaCertification';
import { clearFinalLayout, publishFinalLayout, readFinalLayout } from './finalLayout';

const certification = { status: 'passed' } as InertiaCertification;

afterEach(() => clearFinalLayout());

describe('final layout gate', () => {
  it('has no final layout before verified publication', () => {
    clearFinalLayout();
    expect(readFinalLayout()).toBeNull();
  });

  it('stores only an explicitly verified layout publication', () => {
    publishFinalLayout({
      mode: 'boxes',
      strategy: 'balanced',
      container: { length: 1, width: 1, height: 1, maxPayloadKg: 100 },
      cargo: [],
      result: { placements: [], remaining: [], loadedWeightKg: 0, usedVolumeM3: 0, validationIssues: [] },
      certification,
      verifiedAt: '2026-09-15T00:00:00.000Z',
      source: 'baseline',
    });
    expect(readFinalLayout()?.certification.status).toBe('passed');
    expect(readFinalLayout()?.source).toBe('baseline');
  });
});