import { loadContainer, type LoadingStrategy } from './loadingEngine';
import type { CargoItem, ContainerSpec } from './types';

self.onmessage = (event: MessageEvent<{ container: ContainerSpec; cargo: CargoItem[]; strategy: LoadingStrategy }>) => {
  try {
    const { container, cargo, strategy } = event.data;
    self.postMessage({ result: loadContainer(container, cargo, { strategy, publish: false }) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : '적재 계산에 실패했습니다.' });
  }
};
