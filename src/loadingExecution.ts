import type { LoadingMode } from './loadingWorkflow';

export type LoadingExecutionEngine = 'hybrid-direct-box' | 'pallet-optimizer';

export function loadingExecutionEngine(mode: LoadingMode): LoadingExecutionEngine {
  return mode === 'pallets' ? 'pallet-optimizer' : 'hybrid-direct-box';
}
