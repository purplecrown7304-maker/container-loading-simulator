/** UI request ownership, independent of deterministic loading algorithms. */
export function createLatestInputRun() {
  let current: AbortController | null = null;
  return {
    cancel() { current?.abort(); current = null; },
    start() { current?.abort(); current = new AbortController(); return current; },
    owns(run: AbortController) { return current === run && !run.signal.aborted; },
    finish(run: AbortController) { if (current !== run) return false; current = null; return true; },
  };
}
