import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readViewerQuality, saveViewerQuality, VIEWER_QUALITY_EVENT, VIEWER_QUALITY_KEY, VIEWER_QUALITY_PROFILES,
  type ViewerQualityPreference } from './viewerQuality';

beforeEach(() => { sessionStorage.clear(); saveViewerQuality({ quality: 'standard', ambientOcclusion: true }); });
afterEach(() => { vi.unstubAllGlobals(); saveViewerQuality({ quality: 'standard', ambientOcclusion: true }); sessionStorage.clear(); });

describe('session-only viewer quality', () => {
  it('defaults absent or corrupt settings to a stable standard preference object', () => {
    for (const value of [null, '', 'unknown:on', 'high:invalid', '{"quality":"high"}', 'STANDARD:on']) {
      if (value === null) sessionStorage.removeItem(VIEWER_QUALITY_KEY); else sessionStorage.setItem(VIEWER_QUALITY_KEY, value);
      expect(readViewerQuality()).toEqual({ quality: 'standard', ambientOcclusion: true });
      expect(readViewerQuality()).toBe(readViewerQuality()); expect(Object.isFrozen(readViewerQuality())).toBe(true);
    }
  });
  it('round-trips all quality/AO choices with one view-only event and no local-storage writes', () => {
    localStorage.setItem('synthetic-work-input', 'unchanged'); const changed = vi.fn(); window.addEventListener(VIEWER_QUALITY_EVENT, changed);
    try {
      for (const quality of ['high', 'standard', 'performance'] as const) for (const ambientOcclusion of [true, false]) {
        saveViewerQuality({ quality, ambientOcclusion }); expect(readViewerQuality()).toEqual({ quality, ambientOcclusion });
        expect(sessionStorage.getItem(VIEWER_QUALITY_KEY)).toBe(quality + ':' + (ambientOcclusion ? 'on' : 'off'));
      }
      expect(changed).toHaveBeenCalledTimes(6); expect(localStorage.getItem('synthetic-work-input')).toBe('unchanged');
      expect(localStorage.getItem(VIEWER_QUALITY_KEY)).toBeNull();
    } finally { window.removeEventListener(VIEWER_QUALITY_EVENT, changed); localStorage.removeItem('synthetic-work-input'); }
  });
  it('rejects a runtime-invalid quality without persisting arbitrary values', () => {
    saveViewerQuality({ quality: 'unknown', ambientOcclusion: false } as unknown as ViewerQualityPreference);
    expect(sessionStorage.getItem(VIEWER_QUALITY_KEY)).toBe('standard:on');
  });
  it('keeps an in-memory choice if storage is blocked and returns to normal storage when it recovers', () => {
    vi.stubGlobal('sessionStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } });
    expect(() => saveViewerQuality({ quality: 'performance', ambientOcclusion: false })).not.toThrow();
    expect(readViewerQuality()).toEqual({ quality: 'performance', ambientOcclusion: false });
    vi.unstubAllGlobals(); saveViewerQuality({ quality: 'high', ambientOcclusion: true });
    expect(readViewerQuality()).toEqual({ quality: 'high', ambientOcclusion: true }); expect(sessionStorage.getItem(VIEWER_QUALITY_KEY)).toBe('high:on');
  });
  it('keeps profile limits explicit and disables AO for the performance path', () => {
    expect(VIEWER_QUALITY_PROFILES).toEqual({ high: { dpr: [1, 1.5], aoScale: 1, aoSamples: 16, msaaSamples: 4 },
      standard: { dpr: [1, 1.25], aoScale: .5, aoSamples: 8, msaaSamples: 2 }, performance: { dpr: [1, 1], aoScale: 0, aoSamples: 0, msaaSamples: 0 } });
  });
});
