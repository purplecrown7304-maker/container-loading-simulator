import { expect, test, type Page } from '@playwright/test';

const storedState = {
  container: {
    length: 12.03,
    width: 2.35,
    height: 2.69,
    maxPayloadKg: 26500,
    floorLoadLimitKgPerM2: 1500,
    floorLoadWarningMultiplier: 3,
  },
  cargo: [{
    id: 'WORKER-PARITY',
    name: 'worker parity',
    length: .6,
    width: .4,
    height: .4,
    weightKg: 20,
    quantity: 40,
    maxStackLayers: 10,
    maxTopLoadKg: 100000,
    allowRotation: true,
  }],
};

const securingSettings = {
  bandingKgPerM: .031,
  cornerGuardKgPerM: .14,
  wrappingKgPerM: .021,
  antiSlipKgPerEa: .41,
  dunnageKgPerEa: .82,
  loadBarKgPerEa: 4.9,
  voidAirBagKgPerEa: .71,
  voidAirBagFaceAreaM2: 1.08,
  voidAirBagMinGapM: .10,
  voidAirBagMaxGapM: .45,
  voidHoneycombKgPerM3: 47,
  voidHoneycombModuleVolumeM3: .01,
  voidHoneycombMinGapM: .012,
  voidHoneycombMaxGapM: .10,
  voidDoorBarKgPerEa: 5.7,
  voidDoorBarMinSpanM: 2.261,
  voidDoorBarMaxSpanM: 2.642,
  voidDoorBarCoverageHeightM: 1.20,
};

async function installInput(page: Page, disableWorker: boolean, state = storedState, materials = securingSettings) {
  await page.addInitScript(({ disable }) => {
    if (disable) {
      Object.defineProperty(window, 'Worker', { configurable: true, writable: true, value: undefined });
      (window as any).__loadingWorkerDisabledForParity = true;
      return;
    }
    const NativeWorker = window.Worker;
    (window as any).__loadingWorkerParity = { requests: [], responses: [] };
    window.Worker = class extends NativeWorker {
      private parityStrategy = '';
      private loadingWorker = false;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.loadingWorker = String(url).includes('loading.worker');
        if (this.loadingWorker) this.addEventListener('message', event => {
          if (event.data?.result) {
            (window as any).__loadingWorkerParity.responses.push({
              strategy: this.parityStrategy,
              result: structuredClone(event.data.result),
            });
          }
        });
      }
      postMessage(message: any, transfer?: any) {
        if (this.loadingWorker) {
          this.parityStrategy = message?.strategy ?? '';
          (window as any).__loadingWorkerParity.requests.push({
            strategy: this.parityStrategy,
            securingMaterials: structuredClone(message?.securingOptions?.securingMaterials ?? null),
          });
        }
        super.postMessage(message, transfer);
      }
    };
  }, { disable: disableWorker });

  // Enter a real origin first, then use the same storage-update event App listens to.
  // This avoids depending on render-time hydration order while exercising the real UI state path.
  await page.goto('/');
  await page.evaluate(({ state, materials }) => {
    localStorage.setItem('container-loading-simulator-v1', JSON.stringify(state));
    localStorage.setItem('container-loading-securing-material-settings', JSON.stringify(materials));
    localStorage.setItem('container-loading:guided-loading-strategy', 'capacity');
    localStorage.setItem('container-loading:guided-loading-unit', 'boxes');
    localStorage.setItem('container-loading-strategy', 'capacity');
    window.dispatchEvent(new CustomEvent('container-loading-simulator:storage-updated', { detail: state }));
    window.dispatchEvent(new CustomEvent('container-loading:guided-loading-strategy-updated', { detail: 'capacity' }));
    window.dispatchEvent(new CustomEvent('container-loading:guided-loading-unit-updated', { detail: 'boxes' }));
    window.dispatchEvent(new CustomEvent('container-loading:securing-material-settings', { detail: materials }));
  }, { state, materials });
}
async function runLoading(page: Page, cargoId = 'WORKER-PARITY') {
  await expect.poll(() => page.evaluate(() => (window as any).__containerLoadingLatestResult?.cargo?.[0]?.id)).toBe(cargoId);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('container-loading:app-action', { detail: { action: 'run-loading' } })));
  await expect.poll(
    () => page.evaluate(() => (window as any).__containerLoadingLatestResult?.result?.placements?.length ?? 0),
    { timeout: 90_000 },
  ).toBeGreaterThan(0);
  await expect.poll(
    () => page.evaluate(() => Boolean((window as any).__containerLoadingLatestResult?.result?.securingBudget)),
    { timeout: 30_000 },
  ).toBe(true);
  return page.evaluate(() => structuredClone((window as any).__containerLoadingLatestResult.result));
}

test.only('real loading.worker matches the synchronous loadContainer fallback bit-for-bit', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name === 'chromium-mobile', 'Desktop service verification only.');
  test.setTimeout(180_000);

  const workerContext = await browser.newContext();
  const workerPage = await workerContext.newPage();
  await installInput(workerPage, false);
  const workerFinal = await runLoading(workerPage);
  const workerTrace = await workerPage.evaluate(() => structuredClone((window as any).__loadingWorkerParity));
  expect(workerTrace.requests.length).toBeGreaterThan(0);
  expect(workerTrace.responses.length).toBe(workerTrace.requests.length);
  expect(workerTrace.requests.every((row: any) => row.securingMaterials?.voidDoorBarKgPerEa === securingSettings.voidDoorBarKgPerEa)).toBe(true);
  expect(workerTrace.responses.some((row: any) => JSON.stringify(row.result) === JSON.stringify(workerFinal))).toBe(true);
  await workerContext.close();

  const syncContext = await browser.newContext();
  const syncPage = await syncContext.newPage();
  await installInput(syncPage, true);
  const syncFinal = await runLoading(syncPage);
  expect(await syncPage.evaluate(() => (window as any).__loadingWorkerDisabledForParity)).toBe(true);
  await syncContext.close();

  expect(syncFinal).toEqual(workerFinal);
  expect(syncFinal.voidFillPlan).toEqual(workerFinal.voidFillPlan);
  expect(syncFinal.securingBudget).toEqual(workerFinal.securingBudget);
  expect(syncFinal.operationalFindings).toEqual(workerFinal.operationalFindings);
  expect(syncFinal.validationIssues).toEqual(workerFinal.validationIssues);
  await testInfo.attach('loading-worker-parity', {
    body: JSON.stringify({
      workerRequests: workerTrace.requests.map((row: any) => row.strategy),
      placements: workerFinal.placements.length,
      securingBudget: workerFinal.securingBudget,
      voidFillPlan: workerFinal.voidFillPlan,
    }, null, 2),
    contentType: 'application/json',
  });
});


test.only('custom securing profiles materialize identical worker and sync void-fill plans', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name === 'chromium-mobile', 'Desktop service verification only.');
  test.setTimeout(300_000);

  const scenarios = [
    {
      name: 'airbag-doorbar',
      state: {
        container: { length:12.03,width:2.35,height:2.69,maxPayloadKg:26500,floorLoadLimitKgPerM2:1500 },
        cargo: [{ id:'AIR',name:'AIR',length:.6,width:.41,height:.2,weightKg:20,quantity:5,maxStackLayers:1,maxTopLoadKg:0,allowRotation:false }],
      },
      materials: securingSettings,
      check: (result:any) => {
        expect(result.voidFillPlan?.fills.some((fill:any)=>fill.material==='dunnage-airbag')).toBe(true);
        expect(result.voidFillPlan?.fills.some((fill:any)=>fill.kind==='door-face'&&fill.material==='load-bar')).toBe(true);
      },
    },
    {
      name: 'honeycomb-doorbar',
      state: {
        container: { length:12.03,width:2.35,height:2.69,maxPayloadKg:26500,floorLoadLimitKgPerM2:1500 },
        cargo: [{ id:'HONEY',name:'HONEY',length:.6,width:.45,height:.2,weightKg:20,quantity:5,maxStackLayers:1,maxTopLoadKg:0,allowRotation:false }],
      },
      materials: securingSettings,
      check: (result:any) => {
        expect(result.voidFillPlan?.fills.some((fill:any)=>fill.material==='paper-honeycomb')).toBe(true);
        expect(result.voidFillPlan?.fills.some((fill:any)=>fill.kind==='door-face'&&fill.material==='load-bar')).toBe(true);
      },
    },
    {
      name: 'unresolved-range',
      state: {
        container: { length:12.03,width:2.35,height:2.69,maxPayloadKg:26500,floorLoadLimitKgPerM2:1500 },
        cargo: [{ id:'UNRESOLVED',name:'UNRESOLVED',length:.6,width:.41,height:.2,weightKg:20,quantity:5,maxStackLayers:1,maxTopLoadKg:0,allowRotation:false }],
      },
      materials: { ...securingSettings, voidAirBagMaxGapM:.12, voidHoneycombMaxGapM:.08 },
      check: (result:any) => {
        expect(result.voidFillPlan?.fills.some((fill:any)=>fill.kind==='side-gap'&&fill.material==='unresolved'&&fill.fixedSupportEligible===false)).toBe(true);
        expect(result.voidFillPlan?.unresolvedCount).toBeGreaterThan(0);
      },
    },
  ];

  const report:any[] = [];
  for (const scenario of scenarios) {
    const workerContext = await browser.newContext();
    const workerPage = await workerContext.newPage();
    await installInput(workerPage, false, scenario.state, scenario.materials);
    const workerResult = await runLoading(workerPage, scenario.state.cargo[0].id);
    const trace = await workerPage.evaluate(() => structuredClone((window as any).__loadingWorkerParity));
    expect(trace.requests.length).toBeGreaterThan(0);
    expect(trace.requests.every((row:any)=>JSON.stringify(row.securingMaterials)===JSON.stringify(scenario.materials))).toBe(true);
    await workerContext.close();

    const syncContext = await browser.newContext();
    const syncPage = await syncContext.newPage();
    await installInput(syncPage, true, scenario.state, scenario.materials);
    const syncResult = await runLoading(syncPage, scenario.state.cargo[0].id);
    await syncContext.close();

    expect(workerResult.voidFillPlan).toEqual(syncResult.voidFillPlan);
    expect(workerResult.securingBudget).toEqual(syncResult.securingBudget);
    expect(workerResult.operationalFindings).toEqual(syncResult.operationalFindings);
    scenario.check(workerResult);
    report.push({
      scenario: scenario.name,
      fills: workerResult.voidFillPlan?.fills.map((fill:any)=>({
        kind:fill.kind, material:fill.material, quantity:fill.quantity, weightKg:fill.weightKg,
        fixedSupportEligible:fill.fixedSupportEligible, gapM:fill.gapM,
      })),
      securingBudget: workerResult.securingBudget,
    });
  }

  await testInfo.attach('loading-worker-material-parity', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  });
});
