import { PALLET_CATALOG } from './palletCatalog';
import { evaluatePalletType } from './palletRecommendation';
import type { LoadingStrategy } from './loadingEngine';
import type { CargoItem, ContainerSpec } from './types';
import type { PalletSpec } from './palletOptimization';

self.onmessage = (event: MessageEvent<{ container: ContainerSpec; cargo: CargoItem[]; strategy: LoadingStrategy; mode?: 'pallets' | 'mixed'; specs?:Record<string,PalletSpec> }>) => {
  try {
    const { container, cargo, strategy, mode, specs } = event.data;
    for (const type of PALLET_CATALOG) {
      self.postMessage({ evaluation: evaluatePalletType(container, cargo, type, strategy, undefined, mode, specs?.[type.id]) });
    }
    self.postMessage({ done: true });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : '파렛트 추천 계산에 실패했습니다.' });
  }
};
