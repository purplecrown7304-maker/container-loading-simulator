import { prepareStagingPackaging, type PrepareStagingPackagingInput } from './stagingInventory';

self.onmessage = (event: MessageEvent<{ requestId: number; input: PrepareStagingPackagingInput }>) => {
  try {
    self.postMessage({ requestId: event.data.requestId, plan: prepareStagingPackaging(event.data.input) });
  } catch (error) {
    self.postMessage({ requestId: event.data.requestId, error: error instanceof Error ? error.message : String(error) });
  }
};
