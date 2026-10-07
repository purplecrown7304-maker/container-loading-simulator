import { expect, test, type Page } from '@playwright/test';
import { withWorkerParityPage } from './helpers/workerParityHarness';

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

test('real loading.worker matches the synchronous loadContainer fallback bit-for-bit', async ({ browser }, testInfo) => {
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


test('real worker and synchronous fallback preserve custom material plans and bounds', async ({ browser }, testInfo) => {
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
        expect(result.voidFillPlan?.fills.filter((fill: any) => fill.material === 'dunnage-airbag')).toHaveLength(2);
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
        expect(result.voidFillPlan?.fills.filter((fill: any) => fill.material === 'paper-honeycomb')).toHaveLength(2);
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

  const report: unknown[] = [];
  try {
    // Exact inclusive limits and immediately out-of-range profiles use the same
    // geometry, so settings transport and range application are both exercised.
    const air = scenarios[0];
    const honey = scenarios[1];
    const unresolvedSides = (result: any) => {
      const sides = result.voidFillPlan.fills.filter((fill: any) => fill.kind === 'side-gap');
      expect(sides).toHaveLength(2);
      for (const fill of sides) expect(fill).toMatchObject({ material: 'unresolved', quantity: 0, weightKg: 0, fixedSupportEligible: false });
    };
    const unresolvedDoor = (result: any) => {
      expect(result.voidFillPlan.fills.find((fill: any) => fill.kind === 'door-face')).toMatchObject({ material: 'unresolved', quantity: 0, weightKg: 0, fixedSupportEligible: false });
    };
    scenarios.push(
      { ...air, name: 'airbag-inclusive-limits', materials: { ...securingSettings, voidAirBagMinGapM: .15, voidAirBagMaxGapM: .15 } },
      { ...honey, name: 'honeycomb-inclusive-limits', materials: { ...securingSettings, voidHoneycombMinGapM: .05, voidHoneycombMaxGapM: .05 } },
      { ...air, name: 'airbag-below-minimum', materials: { ...securingSettings, voidAirBagMinGapM: .151 }, check: unresolvedSides },
      { ...honey, name: 'honeycomb-below-minimum', materials: { ...securingSettings, voidHoneycombMinGapM: .051 }, check: unresolvedSides },
      { ...honey, name: 'honeycomb-above-maximum', materials: { ...securingSettings, voidHoneycombMaxGapM: .049 }, check: unresolvedSides },
      { ...air, name: 'doorbar-above-maximum', materials: { ...securingSettings, voidDoorBarMaxSpanM: 2.349 }, check: unresolvedDoor },
      { ...air, name: 'custom-quantity-rounding', materials: { ...securingSettings, voidAirBagFaceAreaM2: .05, voidDoorBarCoverageHeightM: .09 } },
      { ...honey, name: 'custom-honeycomb-modules', materials: { ...securingSettings, voidHoneycombModuleVolumeM3: .004 } },
      { ...air, name: 'doorbar-inclusive-limits', materials: { ...securingSettings, voidDoorBarMinSpanM: 2.35, voidDoorBarMaxSpanM: 2.35 } },
      { ...air, name: 'doorbar-out-of-range', materials: { ...securingSettings, voidDoorBarMinSpanM: 2.351 }, check: result => {
        expect(result.voidFillPlan.fills.find((fill: any) => fill.kind === 'door-face')).toMatchObject({ material: 'unresolved', quantity: 0, weightKg: 0, fixedSupportEligible: false });
      } },
    );

    for (const scenario of scenarios) {
      await withWorkerParityPage(browser, async page => {
        const { workerResult, fallbackResult, syncResult, requests, responses, errors, inputUnchanged } = await page.evaluate(
          input => (window as any).runLoadingWorkerParity(input),
          { ...scenario.state, materials: scenario.materials },
        );
        expect(inputUnchanged, scenario.name).toBe(true);
        expect(errors, scenario.name).toEqual([]);
        expect(requests, scenario.name).toHaveLength(1);
        expect(responses, scenario.name).toHaveLength(1);
        expect(requests[0].securingOptions.securingMaterials, scenario.name).toEqual(scenario.materials);
        expect(responses[0].result, scenario.name).toEqual(workerResult);
        expect(workerResult, scenario.name).toEqual(syncResult);
        expect(fallbackResult, scenario.name).toEqual(syncResult);
        scenario.check(workerResult);
        expect(workerResult.voidFillPlan.fills, scenario.name).toHaveLength(3);
        expect(workerResult.operationalFindings.some((finding: any) => finding.code === 'VOID_FILL_REQUIRED')).toBe(true);
        expect(workerResult.voidFillPlan.weightKg).toBeCloseTo(workerResult.voidFillPlan.fills.reduce((sum: number, fill: any) => sum + fill.weightKg, 0), 10);
        expect(workerResult.securingBudget.totalTransportWeightKg).toBeCloseTo(workerResult.loadedWeightKg + workerResult.securingBudget.requiredWeightKg, 10);
        expect(workerResult.voidFillPlan.unresolvedCount).toBe(workerResult.voidFillPlan.fills.filter((fill: any) => fill.material === 'unresolved').length);
        const pinnedTotals: Record<string, number> = { 'airbag-doorbar': 7.12, 'honeycomb-doorbar': 6.64, 'custom-quantity-rounding': 21.36, 'custom-honeycomb-modules': 6.452 };
        if (scenario.name in pinnedTotals) expect(workerResult.voidFillPlan.weightKg, scenario.name).toBeCloseTo(pinnedTotals[scenario.name], 10);

        for (const fill of workerResult.voidFillPlan.fills) {
          if (fill.material === 'dunnage-airbag') {
            expect(fill.quantity).toBe(Math.ceil(fill.length * fill.height / scenario.materials.voidAirBagFaceAreaM2));
            expect(fill.weightKg).toBeCloseTo(fill.quantity * scenario.materials.voidAirBagKgPerEa, 10);
            expect(fill.gapM + 1e-6).toBeGreaterThanOrEqual(scenario.materials.voidAirBagMinGapM);
            expect(fill.gapM).toBeLessThanOrEqual(scenario.materials.voidAirBagMaxGapM + 1e-6);
          } else if (fill.material === 'paper-honeycomb') {
            expect(fill.quantity).toBe(Math.ceil(fill.voidVolumeM3 / scenario.materials.voidHoneycombModuleVolumeM3));
            expect(fill.weightKg).toBeCloseTo(fill.quantity * scenario.materials.voidHoneycombModuleVolumeM3 * scenario.materials.voidHoneycombKgPerM3, 10);
            expect(fill.gapM + 1e-6).toBeGreaterThanOrEqual(scenario.materials.voidHoneycombMinGapM);
            expect(fill.gapM).toBeLessThanOrEqual(scenario.materials.voidHoneycombMaxGapM + 1e-6);
          } else if (fill.material === 'load-bar') {
            expect(fill.quantity).toBe(Math.ceil(fill.height / scenario.materials.voidDoorBarCoverageHeightM));
            expect(fill.weightKg).toBeCloseTo(fill.quantity * scenario.materials.voidDoorBarKgPerEa, 10);
          }
          expect(fill.fixedSupportEligible).toBe(fill.material !== 'unresolved');
        }
        report.push({ scenario: scenario.name, voidFillPlan: workerResult.voidFillPlan, securingBudget: workerResult.securingBudget });
      });
    }
  } finally {
    await testInfo.attach('loading-worker-material-parity', {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    });
  }
});
