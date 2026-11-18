import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSceneRetirement, RETIRED_SCENE_LINGER_MS } from './sceneRetirement';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('scene retirement', () => {
  it('keeps a replaced scene until flushed and disposes it exactly once', () => {
    const retirement = createSceneRetirement(), dispose = vi.fn();
    retirement.retire(dispose);
    expect(dispose).not.toHaveBeenCalled(); expect(retirement.size).toBe(1);
    retirement.flush(); retirement.flush();
    expect(dispose).toHaveBeenCalledOnce(); expect(retirement.size).toBe(0);
    vi.advanceTimersByTime(RETIRED_SCENE_LINGER_MS * 2);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('releases a scene whose replacement never draws after the linger time', () => {
    const retirement = createSceneRetirement(), first = vi.fn(), second = vi.fn();
    retirement.retire(first);
    vi.advanceTimersByTime(RETIRED_SCENE_LINGER_MS - 1);
    retirement.retire(second);
    expect(first).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(first).toHaveBeenCalledOnce(); expect(second).not.toHaveBeenCalled(); expect(retirement.size).toBe(1);
    vi.advanceTimersByTime(RETIRED_SCENE_LINGER_MS);
    expect(second).toHaveBeenCalledOnce(); expect(retirement.size).toBe(0);
  });

  it('lets a disposer retire again without disturbing the batch being flushed', () => {
    const retirement = createSceneRetirement(), late = vi.fn();
    const first = vi.fn(() => retirement.retire(late));
    retirement.retire(first);
    retirement.flush();
    expect(first).toHaveBeenCalledOnce(); expect(late).not.toHaveBeenCalled(); expect(retirement.size).toBe(1);
    retirement.flush();
    expect(late).toHaveBeenCalledOnce();
  });
});
