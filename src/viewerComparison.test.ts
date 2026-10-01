import { describe, expect, it } from 'vitest';
import { parseViewerComparison } from './viewerComparison';
describe('renderer opt-in policy', () => {
  it('keeps Unity for normal, invalid and unrelated queries', () => {
    for (const query of ['', '?renderer=unity', '?renderer=typo', '?mode=three']) expect(parseViewerComparison(query)).toEqual({ enabled: false, renderer: 'unity' });
  });
  it('enables a session-only comparison without changing loading inputs', () => {
    expect(parseViewerComparison('?renderer=compare')).toEqual({ enabled: true, renderer: 'unity' });
    expect(parseViewerComparison('?renderer=three')).toEqual({ enabled: true, renderer: 'three' });
  });
});
