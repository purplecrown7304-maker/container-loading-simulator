import { PALLET_CATALOG } from './palletCatalog';
import { evaluatePalletType, pickRecommendation, type PalletRecommendation, type PalletTypeEvaluation } from './palletRecommendation';
import type { LoadingStrategy } from './loadingEngine';
import type { CargoItem, ContainerSpec } from './types';
import type { PalletSpec } from './palletOptimization';

/** Evaluate every catalog pallet off the UI thread, reporting each type as it finishes. */
export function recommendPalletsAsync(
  container: ContainerSpec,
  cargo: CargoItem[],
  strategy: LoadingStrategy,
  onEvaluation?: (evaluation: PalletTypeEvaluation) => void,
  signal?: AbortSignal,
  mode: 'pallets' | 'mixed' = 'pallets',
  specs: Record<string,PalletSpec> = {},
): Promise<PalletRecommendation> {
  if (signal?.aborted) return Promise.reject(new DOMException('취소됨', 'AbortError'));
  if (typeof Worker === 'undefined') {
    const evaluations = PALLET_CATALOG.map(type => {
      const evaluation = evaluatePalletType(container, cargo, type, strategy, undefined, mode, specs[type.id]);
      onEvaluation?.(evaluation);
      return evaluation;
    });
    return Promise.resolve({ evaluations, recommendedId: pickRecommendation(evaluations) });
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./palletRecommendation.worker.ts', import.meta.url), { type: 'module' });
    const evaluations: PalletTypeEvaluation[] = [];
    const clean = () => { worker.terminate(); signal?.removeEventListener('abort', abort); };
    const abort = () => { clean(); reject(new DOMException('취소됨', 'AbortError')); };
    worker.onmessage = (event: MessageEvent<{ evaluation?: PalletTypeEvaluation; done?: boolean; error?: string }>) => {
      if (event.data.evaluation) {
        evaluations.push(event.data.evaluation);
        onEvaluation?.(event.data.evaluation);
        return;
      }
      clean();
      if (event.data.done) resolve({ evaluations, recommendedId: pickRecommendation(evaluations) });
      else reject(new Error(event.data.error ?? '파렛트 추천 결과를 읽지 못했습니다.'));
    };
    worker.onerror = () => { clean(); reject(new Error('파렛트 추천 계산 모듈을 실행하지 못했습니다.')); };
    signal?.addEventListener('abort', abort, { once: true });
    try { worker.postMessage({ container, cargo, strategy, mode, specs }); }
    catch (error) { clean(); reject(error); }
  });
}
