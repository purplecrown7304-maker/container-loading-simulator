import { loadContainer, type LoadingStrategy } from './loadingEngine';
import type { CargoItem, ContainerSpec } from './types';
import type { RuleEngineMode } from '../rule-engine/mode';

self.onmessage = (event: MessageEvent<{ container: ContainerSpec; cargo: CargoItem[]; strategy: LoadingStrategy; ruleEngineMode?: RuleEngineMode }>) => {
  try {
    const { container, cargo, strategy, ruleEngineMode } = event.data;
    self.postMessage({ result: loadContainer(container, cargo, { strategy, publish: false, ruleEngineMode }) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : '적재 계산에 실패했습니다.' });
  }
};
