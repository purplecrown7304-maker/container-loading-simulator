import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadContainerAsync } from './asyncLoading';
import { loadContainer, restoreLoadingResult } from './loadingEngine';
import { clearManualOverride, writeManualOverride } from './manualOverride';

const container = { length: 1, width: 1, height: 1, maxPayloadKg: 100 };
const cargo = [{ id: 'ASYNC', name: '박스', length: 0.5, width: 0.5, height: 0.2, quantity: 12, weightKg: 1, maxStackLayers: 3, maxTopLoadKg: 2 }];

afterEach(() => { vi.unstubAllGlobals(); clearManualOverride(); });

describe('asynchronous loading lifecycle', () => {
  it('keeps an explicitly applied final layout on a storage notification and clears it when inputs change', () => {
    const final = loadContainer(container, cargo, { strategy: 'capacity', publish: false });
    writeManualOverride(container, cargo, final);
    expect(restoreLoadingResult(container, cargo)).toEqual(final);
    const pending = restoreLoadingResult(container, [{ ...cargo[0], maxStackLayers: 1 }]);
    expect(pending.placements).toEqual([]);
    expect(pending.remaining).toEqual([]);
  });

  it('preserves deterministic packing and safety in the non-browser fallback', async () => {
    vi.stubGlobal('Worker', undefined);
    expect(await loadContainerAsync(container, cargo, 'capacity')).toEqual(loadContainer(container, cargo, { strategy: 'capacity', publish: false }));
  });

  it('keeps the previous same-input layout when a stored move fails final acceptance', () => {
    const final = loadContainer(container,cargo,{strategy:'capacity',publish:false});
    const rejected = {...final,placements:final.placements.map((p,i) => i === 0 ? {...p,x:container.length+1} : p)};
    writeManualOverride(container,cargo,rejected);
    const restored = restoreLoadingResult(container,cargo,final);
    expect(restored).toEqual(final);
    expect(restored.placements.length).toBeGreaterThan(0);
    expect((window as Window & {__containerLoadingLatestResult?:{result:unknown}}).__containerLoadingLatestResult?.result).toEqual(final);
  });

  it('does not restore a stale previous layout that fails the current input audit', () => {
    const final = loadContainer(container,cargo,{strategy:'capacity',publish:false});
    const changedCargo = [{...cargo[0],quantity:1}];
    writeManualOverride(container,changedCargo,final);
    expect(restoreLoadingResult(container,changedCargo,final).placements).toEqual([]);
  });

  it('matches the synchronous solver through the worker message contract including custom securing materials', async () => {
    const materials = {
      bandingKgPerM:.03, cornerGuardKgPerM:.13, wrappingKgPerM:.02,
      antiSlipKgPerEa:.4, dunnageKgPerEa:.8, loadBarKgPerEa:4.8,
      voidAirBagKgPerEa:.7, voidAirBagFaceAreaM2:1.08, voidAirBagMinGapM:.1, voidAirBagMaxGapM:.45,
      voidHoneycombKgPerM3:46, voidHoneycombModuleVolumeM3:.01, voidHoneycombMinGapM:.012, voidHoneycombMaxGapM:.1,
      voidDoorBarKgPerEa:5.6, voidDoorBarMinSpanM:2.261, voidDoorBarMaxSpanM:2.642, voidDoorBarCoverageHeightM:1.2,
    };
    let posted: any;
    vi.stubGlobal('Worker', class extends EventTarget {
      onmessage?: (event: MessageEvent<any>) => void;
      onerror?: () => void;
      onmessageerror?: () => void;
      terminate = vi.fn();
      postMessage(message: any) {
        posted = structuredClone(message);
        queueMicrotask(() => {
          try {
            const request = structuredClone(message);
            const result = loadContainer(request.container, request.cargo, {
              strategy: request.strategy,
              publish: false,
              ...request.securingOptions,
            });
            this.onmessage?.({ data: { result: structuredClone(result) } } as MessageEvent<any>);
          } catch {
            this.onerror?.();
          }
        });
      }
    });
    const asyncResult = await loadContainerAsync(container, cargo, 'capacity', undefined, { securingLevel: 2, securingMaterials: materials });
    const syncResult = loadContainer(container, cargo, { strategy:'capacity', publish:false, securingLevel:2, securingMaterials:materials });
    expect(posted.securingOptions).toEqual({ securingLevel:2, securingMaterials:materials });
    expect(asyncResult).toEqual(syncResult);
  });

  it.each([
    {
      name: 'airbag plus door bar',
      container: { length:4,width:2.35,height:2,maxPayloadKg:2000,floorLoadLimitKgPerM2:1500 },
      cargo: [{ id:'AIR',name:'AIR',length:.6,width:2.05,height:.8,weightKg:120,quantity:1,maxStackLayers:1,maxTopLoadKg:0,allowRotation:false }],
      assertPlan: (result:any) => {
        expect(result.voidFillPlan?.fills.some((fill:any)=>fill.material==='dunnage-airbag')).toBe(true);
        expect(result.voidFillPlan?.fills.some((fill:any)=>fill.kind==='door-face'&&fill.material==='load-bar')).toBe(true);
      },
    },
    {
      name: 'honeycomb plus door bar',
      container: { length:4,width:2.35,height:2,maxPayloadKg:2000,floorLoadLimitKgPerM2:1500 },
      cargo: [{ id:'HONEY',name:'HONEY',length:.6,width:2.25,height:.8,weightKg:120,quantity:1,maxStackLayers:1,maxTopLoadKg:0,allowRotation:false }],
      assertPlan: (result:any) => {
        expect(result.voidFillPlan?.fills.some((fill:any)=>fill.material==='paper-honeycomb')).toBe(true);
        expect(result.voidFillPlan?.fills.some((fill:any)=>fill.kind==='door-face'&&fill.material==='load-bar')).toBe(true);
      },
    },
    {
      name: 'unresolved side gap',
      container: { length:4,width:2.35,height:2,maxPayloadKg:2000,floorLoadLimitKgPerM2:1500 },
      cargo: [{ id:'UNRESOLVED',name:'UNRESOLVED',length:.6,width:2.05,height:.8,weightKg:120,quantity:1,maxStackLayers:1,maxTopLoadKg:0,allowRotation:false }],
      override: { voidAirBagMaxGapM:.12, voidHoneycombMaxGapM:.08 },
      assertPlan: (result:any) => {
        expect(result.voidFillPlan?.fills.some((fill:any)=>fill.kind==='side-gap'&&fill.material==='unresolved'&&!fill.fixedSupportEligible)).toBe(true);
      },
    },
  ])('matches worker and sync void-fill materialization for $name', async ({ container: spec, cargo: items, override, assertPlan }) => {
    const baseMaterials = {
      bandingKgPerM:.03, cornerGuardKgPerM:.13, wrappingKgPerM:.02,
      antiSlipKgPerEa:.4, dunnageKgPerEa:.8, loadBarKgPerEa:4.8,
      voidAirBagKgPerEa:.7, voidAirBagFaceAreaM2:1.08, voidAirBagMinGapM:.1, voidAirBagMaxGapM:.45,
      voidHoneycombKgPerM3:46, voidHoneycombModuleVolumeM3:.01, voidHoneycombMinGapM:.012, voidHoneycombMaxGapM:.1,
      voidDoorBarKgPerEa:5.6, voidDoorBarMinSpanM:2.261, voidDoorBarMaxSpanM:2.642, voidDoorBarCoverageHeightM:1.2,
    };
    const materials = { ...baseMaterials, ...(override ?? {}) };
    let posted:any;
    vi.stubGlobal('Worker', class extends EventTarget {
      onmessage?: (event:MessageEvent<any>)=>void;
      onerror?: ()=>void;
      terminate=vi.fn();
      postMessage(message:any){
        posted=structuredClone(message);
        queueMicrotask(()=>{
          try{
            const req=structuredClone(message);
            const result=loadContainer(req.container,req.cargo,{strategy:req.strategy,publish:false,...req.securingOptions});
            this.onmessage?.({data:{result:structuredClone(result)}} as MessageEvent<any>);
          }catch{this.onerror?.();}
        });
      }
    });
    const workerResult=await loadContainerAsync(spec,items,'capacity',undefined,{securingMaterials:materials});
    const syncResult=loadContainer(spec,items,{strategy:'capacity',publish:false,securingMaterials:materials});
    expect(posted.securingOptions.securingMaterials).toEqual(materials);
    expect(workerResult.voidFillPlan).toEqual(syncResult.voidFillPlan);
    expect(workerResult.securingBudget).toEqual(syncResult.securingBudget);
    expect(workerResult.operationalFindings).toEqual(syncResult.operationalFindings);
    assertPlan(workerResult);
  });

  it('terminates a cancelled worker instead of accepting a stale layout', async () => {
    let worker: { terminate: ReturnType<typeof vi.fn> };
    vi.stubGlobal('Worker', class extends EventTarget {
      terminate = vi.fn();
      postMessage = vi.fn();
      constructor() { super(); worker = this; }
    });
    const controller = new AbortController();
    const result = loadContainerAsync(container, cargo, 'capacity', controller.signal);
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    expect(worker!.terminate).toHaveBeenCalledOnce();
  });

  it('rejects an EventTarget-dispatched messageerror without a result and cleans up', async () => {
    let worker!: MessageErrorWorker;
    class MessageErrorWorker extends EventTarget {
      onmessage?: (event: MessageEvent<any>) => void;
      terminate = vi.fn();
      constructor() {
        super();
        worker = this;
        // Happy DOM invokes arbitrary on* properties. Chromium Worker has no
        // onmessageerror setter, so do not let that emulation hide the bug.
        Object.defineProperty(this, 'onmessageerror', { get: () => undefined, set: () => {} });
      }
      postMessage() {
        queueMicrotask(() => {
          this.dispatchEvent(new MessageEvent('messageerror'));
          // If messageerror was registered as an inert ordinary property, the
          // underlying job can still finish. Make that regression fail promptly.
          if (!this.terminate.mock.calls.length) {
            this.onmessage?.({ data: { result: { placements: [], remaining: [], loadedWeightKg: 0, usedVolumeM3: 0, validationIssues: [] } } } as MessageEvent<any>);
          }
        });
      }
    }
    vi.stubGlobal('Worker', MessageErrorWorker);
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener');
    const fulfilled = vi.fn();
    const pending = loadContainerAsync(container, cargo, 'capacity', controller.signal).then(result => {
      fulfilled(result);
      return result;
    });
    await expect(pending).rejects.toThrow('적재 계산 결과를 읽지 못했습니다.');
    expect(fulfilled).not.toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
    controller.abort();
    worker.dispatchEvent(new MessageEvent('messageerror'));
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('reports a worker failure instead of returning an empty success', async () => {
    vi.stubGlobal('Worker', class extends EventTarget {
      onerror?: () => void;
      terminate = vi.fn();
      postMessage() { queueMicrotask(() => this.onerror?.()); }
    });
    await expect(loadContainerAsync(container, cargo, 'capacity')).rejects.toThrow('적재 계산 모듈');
  });
});
