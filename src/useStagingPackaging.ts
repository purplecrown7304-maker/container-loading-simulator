import { useEffect, useMemo, useRef, useState } from 'react';
import { prepareStagingPackaging, stagingInputSignature, type PrepareStagingPackagingInput, type StagingPackagingPlan } from './stagingInventory';

/** Packaging only: no vehicle optimization or transport physics runs here. */
export function useStagingPackaging(input: PrepareStagingPackagingInput, enabled: boolean) {
  const signature = useMemo(() => stagingInputSignature(input), [input]);
  const allocation = useMemo(() => JSON.stringify([signature, input.selectedPlan, input.otherVehicles, input.preservedPallets]), [signature, input]);
  const request = useRef(0);
  const [state, setState] = useState<{ allocation?: string; plan?: StagingPackagingPlan; busy: boolean; error: string }>({ busy: false, error: '' });
  useEffect(() => {
    const requestId = ++request.current;
    if (!enabled) { setState({ busy: false, error: '' }); return; }
    let alive = true;
    let finished = false;
    setState({ allocation, busy: true, error: '' });
    const accept = (message: { requestId: number; plan?: StagingPackagingPlan; error?: string }) => {
      if (!message || !alive || finished || request.current !== requestId || message.requestId !== requestId
        || (message.plan && message.plan.inputSignature !== signature) || (!message.plan && !message.error)) return false;
      finished = true;
      setState({ allocation, plan: message.plan, busy: false, error: message.error ?? '' });
      return true;
    };
    if (typeof Worker !== 'undefined') {
      let worker: Worker | undefined;
      try {
        worker = new Worker(new URL('./stagingPackaging.worker.ts', import.meta.url), { type: 'module' });
        const activeWorker = worker;
        activeWorker.onmessage = event => { if (accept(event.data)) activeWorker.terminate(); };
        activeWorker.onerror = () => { accept({ requestId, error: '포장 계획을 계산하지 못했습니다. 입력과 포장 설정을 확인하세요.' }); activeWorker.terminate(); };
        activeWorker.postMessage({ requestId, input });
        return () => { alive = false; activeWorker.terminate(); };
      } catch {
        worker?.terminate();
      }
    }
    const timer = setTimeout(() => {
      if (!alive || finished) return;
      try { accept({ requestId, plan: prepareStagingPackaging(input) }); }
      catch (error) { accept({ requestId, error: error instanceof Error ? error.message : String(error) }); }
    }, 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [input, enabled, signature, allocation]);
  return { busy: enabled && (state.allocation !== allocation || state.busy), error: enabled && state.allocation === allocation ? state.error : '',
    plan: enabled && state.allocation === allocation && state.plan?.inputSignature === signature ? state.plan : undefined };
}
