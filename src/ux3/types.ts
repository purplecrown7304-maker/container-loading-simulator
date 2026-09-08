import type { OptimizedPalletPackingResult } from '../engine/palletOptimization';
import type { LoadingStrategy } from '../engine/loadingEngine';

export type WorkflowStep = 1 | 2 | 3 | 4;
export type LoadingMode = 'boxes' | 'pallets';
export type ResultTab = 'result' | 'remaining' | 'weight' | 'safety';
export type StatusTone = 'info' | 'success' | 'warning' | 'error';
export type StatusMessage = { tone: StatusTone; text: string };

export type PhysicsSummary = {
  score: number;
  strategy: LoadingStrategy;
  settled: boolean;
  unstableCount: number;
  supportUnstableCount: number;
} | null;

export type PalletResult = OptimizedPalletPackingResult | null;

export const WORKFLOW_STEPS: ReadonlyArray<{ id: WorkflowStep; label: string; hint: string }> = [
  { id: 1, label: '장비 선택', hint: '컨테이너 또는 트럭' },
  { id: 2, label: '화물 선택', hint: '박스 마스터에서 수량 지정' },
  { id: 3, label: '자동 적재', hint: '3D 적재 계산' },
  { id: 4, label: '결과 확인', hint: '잔량·무게·안전' },
];
