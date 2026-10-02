import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_VIEWER_ENVIRONMENT, normalizeViewerEnvironment, readViewerEnvironment, saveViewerEnvironment, VIEWER_ENVIRONMENT_STORAGE_KEY } from './viewerEnvironment';

afterEach(() => vi.unstubAllGlobals());
describe('viewer background preference', () => {
  it('uses the warehouse for absent or invalid saved values', () => {
    for (const value of [null, undefined, '', 'unknown', {}, 'WAREHOUSE']) expect(normalizeViewerEnvironment(value)).toBe(DEFAULT_VIEWER_ENVIRONMENT);
    for (const value of ['forest', 'warehouse', 'beach', 'space']) expect(normalizeViewerEnvironment(value)).toBe(value);
  });
  it('persists only the display key without publishing loading input events', () => {
    const storage = new Map<string, string>([['container-loading-simulator-v1', 'cargo-unchanged']]);
    vi.stubGlobal('sessionStorage', { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) });
    saveViewerEnvironment('space');
    expect(readViewerEnvironment()).toBe('space');
    expect([...storage.keys()]).toEqual(['container-loading-simulator-v1', VIEWER_ENVIRONMENT_STORAGE_KEY]);
    expect(storage.get('container-loading-simulator-v1')).toBe('cargo-unchanged');
  });
  it('remains usable with unavailable browser storage', () => {
    vi.stubGlobal('sessionStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(() => saveViewerEnvironment('beach')).not.toThrow();
    expect(readViewerEnvironment()).toBe('beach');
  });
  it('keeps a new selection when reads work but writes are blocked', () => {
    vi.stubGlobal('sessionStorage', { getItem: () => 'warehouse', setItem: () => { throw new Error('full'); } });
    saveViewerEnvironment('forest');
    expect(readViewerEnvironment()).toBe('forest');
  });
});
