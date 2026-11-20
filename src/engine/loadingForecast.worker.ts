import { calculateLoadingForecast, type ForecastInput } from './loadingForecast';
import type { LoadingStrategy } from './loadingEngine';

// One estimate for the goal asked for. The product has a single goal to estimate
// (AGENTS.md 2K), so there is nothing to compare it with.
self.onmessage = (event: MessageEvent<{ input: ForecastInput; strategy: LoadingStrategy }>) => {
  try {
    const { input, strategy } = event.data;
    self.postMessage({ forecast: calculateLoadingForecast(input,strategy) });
    self.postMessage({ done:true });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : String(error) }); }
};
