import { calculateLoadingForecast, type ForecastInput } from './loadingForecast';
import type { LoadingStrategy } from './loadingEngine';

self.onmessage = (event: MessageEvent<{ input: ForecastInput; first: LoadingStrategy }>) => {
  try {
    const { input, first } = event.data;
    for (const strategy of [first, first === 'stability' ? 'capacity' : 'stability'] as const) {
      self.postMessage({ forecast: calculateLoadingForecast(input,strategy) });
    }
    self.postMessage({ done:true });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : String(error) }); }
};
