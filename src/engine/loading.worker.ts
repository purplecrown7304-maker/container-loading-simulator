import { loadContainer, type LoadingOptions, type LoadingStrategy } from './loadingEngine';
import type { CargoItem, ContainerSpec } from './types';

self.onmessage = (event: MessageEvent<{ container: ContainerSpec; cargo: CargoItem[]; strategy: LoadingStrategy; securingOptions?: Pick<LoadingOptions, 'securingLevel' | 'securingMaterials'> }>) => {
  try {
    const { container, cargo, strategy, securingOptions } = event.data;
    self.postMessage({ result: loadContainer(container, cargo, { strategy, publish: false, ...securingOptions }) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : '적재 계산에 실패했습니다.' });
  }
};
