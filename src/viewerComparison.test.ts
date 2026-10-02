import { describe, expect, it } from 'vitest';
import { parseViewerComparison } from './viewerComparison';
describe('renderer default and fallback policy', () => {
  it('uses Three.js for normal, invalid and unrelated queries', () => {
    for (const query of ['', '?renderer=typo', '?mode=three']) expect(parseViewerComparison(query)).toEqual({ enabled: true, renderer: 'three' });
  });
  it('enables a session-only comparison without changing loading inputs', () => {
    expect(parseViewerComparison('?renderer=compare')).toEqual({ enabled: true, renderer: 'unity' });
    expect(parseViewerComparison('?renderer=unity')).toEqual({ enabled: true, renderer: 'unity' });
    expect(parseViewerComparison('?renderer=three')).toEqual({ enabled: true, renderer: 'three' });
  });
});
