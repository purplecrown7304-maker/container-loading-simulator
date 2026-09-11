export type DiagnosticTraceEntry = {
  at: string;
  event: string;
  detail?: Record<string, unknown>;
};

export type DiagnosticErrorEntry = {
  at: string;
  type: 'error' | 'unhandledrejection';
  message: string;
  source?: string;
  line?: number;
  column?: number;
  stack?: string;
};

const TRACE_LIMIT = 160;
const ERROR_LIMIT = 80;
const traces: DiagnosticTraceEntry[] = [];
const errors: DiagnosticErrorEntry[] = [];

function boundedPush<T>(list: T[], value: T, limit: number) {
  list.push(value);
  if (list.length > limit) list.splice(0, list.length - limit);
}

export function recordDiagnosticTrace(event: string, detail?: Record<string, unknown>) {
  boundedPush(traces, { at: new Date().toISOString(), event, detail }, TRACE_LIMIT);
}

export function recordDiagnosticError(entry: Omit<DiagnosticErrorEntry, 'at'>) {
  boundedPush(errors, { at: new Date().toISOString(), ...entry }, ERROR_LIMIT);
}

export function readDiagnosticTrace() {
  return traces.map(item => ({ ...item, detail: item.detail ? { ...item.detail } : undefined }));
}

export function readDiagnosticErrors() {
  return errors.map(item => ({ ...item }));
}

export function runtimeSnapshot() {
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  const measures = performance.getEntriesByType('measure').slice(-80).map(entry => ({
    name: entry.name,
    startTimeMs: Math.round(entry.startTime * 100) / 100,
    durationMs: Math.round(entry.duration * 100) / 100,
  }));
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  return {
    capturedAt: new Date().toISOString(),
    navigation: navigation ? {
      type: navigation.type,
      domInteractiveMs: Math.round(navigation.domInteractive),
      domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd),
      loadEventMs: Math.round(navigation.loadEventEnd),
    } : null,
    memory: memory ? {
      usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
    } : null,
    measures,
    recentErrors: readDiagnosticErrors(),
  };
}
