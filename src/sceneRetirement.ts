/**
 * Holds replaced scene resources for a short while instead of disposing them at once.
 *
 * three.js deletes a WebGL program as soon as the last material using it is disposed.
 * A rebuilt scene creates materials of the same kinds, so disposing the old scene first
 * made every plan or yard change link the same shaders again. A retired scene is released
 * when its replacement has drawn (`flush`) or after the linger time, whichever comes first.
 * Only the release moment changes: every resource is still disposed exactly once.
 */
export const RETIRED_SCENE_LINGER_MS = 4000;

export type SceneRetirement = {
  /** Dispose later: on `flush`, or after the linger time. */
  retire: (dispose: () => void) => void;
  /** Dispose everything retired so far, now. */
  flush: () => void;
  readonly size: number;
};

export function createSceneRetirement(lingerMs = RETIRED_SCENE_LINGER_MS): SceneRetirement {
  const pending = new Set<{ dispose: () => void; timer: ReturnType<typeof setTimeout> }>();
  return {
    retire(dispose) {
      const entry = { dispose, timer: setTimeout(() => { pending.delete(entry); dispose(); }, lingerMs) };
      pending.add(entry);
    },
    flush() {
      const entries = [...pending];
      pending.clear();
      for (const entry of entries) { clearTimeout(entry.timer); entry.dispose(); }
    },
    get size() { return pending.size; },
  };
}
