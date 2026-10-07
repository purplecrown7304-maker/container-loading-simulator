import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type { LifecycleScenario, runLoadingWorkerLifecycle } from './fixtures/loading-worker-parity/lifecycle';
import { withWorkerParityPage } from './helpers/workerParityHarness';

type LifecycleReport = Awaited<ReturnType<typeof runLoadingWorkerLifecycle>>;
const input = {
  container: { length: 4, width: 2.35, height: 2, maxPayloadKg: 2000, floorLoadLimitKgPerM2: 1500 },
  cargo: [{ id: 'WORKER-LIFECYCLE', name: 'worker lifecycle', length: 1, width: 2.05, height: .2, weightKg: 20, quantity: 4, maxStackLayers: 2, maxTopLoadKg: 1000, allowRotation: false }],
  materials: {
    bandingKgPerM: .031, cornerGuardKgPerM: .14, wrappingKgPerM: .021,
    antiSlipKgPerEa: .41, dunnageKgPerEa: .82, loadBarKgPerEa: 4.9,
    voidAirBagKgPerEa: .71, voidAirBagFaceAreaM2: 1.08, voidAirBagMinGapM: .10, voidAirBagMaxGapM: .45,
    voidHoneycombKgPerM3: 47, voidHoneycombModuleVolumeM3: .01, voidHoneycombMinGapM: .012, voidHoneycombMaxGapM: .10,
    voidDoorBarKgPerEa: 5.7, voidDoorBarMinSpanM: 2.261, voidDoorBarMaxSpanM: 2.642, voidDoorBarCoverageHeightM: 1.20,
  },
};

async function runScenario(page: Page, scenario: LifecycleScenario, testInfo: TestInfo): Promise<LifecycleReport> {
  const browserErrors: string[] = [];
  const expectedAbortedRequests: string[] = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('requestfailed', request => {
    const failure = `${request.url()}: ${request.failure()?.errorText}`;
    if ((scenario === 'cancellation' || scenario === 'messageerror') && /loading\.worker/.test(request.url()) && request.failure()?.errorText === 'net::ERR_ABORTED') {
      expectedAbortedRequests.push(failure);
    } else browserErrors.push(failure);
  });
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
  let report: LifecycleReport | undefined;
  try {
    await page.waitForFunction(() => typeof (window as unknown as { runLoadingWorkerLifecycle?: unknown }).runLoadingWorkerLifecycle === 'function', undefined, { timeout: 15_000 });
    report = await page.evaluate(
      args => (window as unknown as { runLoadingWorkerLifecycle: typeof runLoadingWorkerLifecycle }).runLoadingWorkerLifecycle(args),
      { ...input, scenario },
    );
    expect(report.globalErrors, `${scenario}: browser error events`).toEqual([]);
    expect(browserErrors, `${scenario}: page, console, or network errors`).toEqual([]);
    for (const worker of report.workers) {
      expect(worker.url).toMatch(/loading\.worker[^/]*\.js/);
      expect(worker.requests).toHaveLength(1);
      expect(worker.terminateCalls, `${scenario}: production cleanup`).toBeGreaterThanOrEqual(1);
      expect(worker.errors).toEqual([]);
    }
    return report;
  } finally {
    await testInfo.attach(`loading-worker-${scenario}`, {
      body: JSON.stringify({ report, browserErrors, expectedAbortedRequests }, null, 2),
      contentType: 'application/json',
    });
  }
}

test.describe('real production loading Worker lifecycle', () => {
  // Both Chromium projects run these engine-service tests; no desktop-only skip.
  test.setTimeout(150_000);

  test('repeated identical requests preserve the complete deterministic result', async ({ browser }, testInfo) => {
    await withWorkerParityPage(browser, async page => {
      const report = await runScenario(page, 'determinism', testInfo);
      if (report.scenario !== 'determinism') throw new Error('Wrong lifecycle scenario');
      expect(report.workers).toHaveLength(3);
      expect(report.results).toHaveLength(3);
      expect(report.synchronous.placements.length).toBeGreaterThan(0);
      for (const [index, result] of report.results.entries()) {
        expect(result).toEqual(report.synchronous);
        expect(JSON.stringify(result)).toBe(JSON.stringify(report.results[0]));
        expect(report.workers[index].messages).toEqual([{ trusted: true, data: { result } }]);
        expect(report.workers[index].terminateCalls).toBe(1);
        expect(report.workers[index].messageErrors).toEqual([]);
        expect(report.signals[index]).toEqual({ added: 1, removed: 1, active: 0 });
      }
      expect(report.publications).toEqual([]);
      expect(report.publicationChanged).toBe(false);
    });
  });

  test('pre-abort, active abort, and a late real-result replay never resolve or publish partial success', async ({ browser }, testInfo) => {
    await withWorkerParityPage(browser, async page => {
      const report = await runScenario(page, 'cancellation', testInfo);
      if (report.scenario !== 'cancellation') throw new Error('Wrong lifecycle scenario');
      expect(report.preAbortedOutcome).toMatchObject({ status: 'rejected', name: 'AbortError' });
      expect(report.preAbortedWorkers).toBe(0);
      expect(report.preAbortedSignal).toEqual({ added: 0, removed: 0, active: 0 });
      expect(report.activeOutcome).toMatchObject({ status: 'rejected', name: 'AbortError' });
      expect(report.queuedOutcome).toMatchObject({ status: 'rejected', name: 'AbortError' });
      expect(report.activeOutcome).not.toHaveProperty('result');
      expect(report.queuedOutcome).not.toHaveProperty('result');
      expect(report.activeFulfilled).toBe(0);
      expect(report.queuedFulfilled).toBe(0);
      expect(report.workers).toHaveLength(2);
      expect(report.workers[0].messages).toEqual([]);
      expect(report.workers[0].terminateCalls).toBe(1);
      expect(report.activeSignal).toEqual({ added: 1, removed: 1, active: 0 });
      expect(report.queuedSignal.active).toBe(0);
      expect(report.queuedSignal.added).toBe(1);
      expect(report.queuedSignal.removed).toBeGreaterThanOrEqual(1);
      expect(report.replayedRealResult).toBe(true);
      expect(report.workers[1].messages.map(message => message.trusted)).toEqual([true, false]);
      expect(report.workers[1].messages[1].data).toEqual(report.workers[1].messages[0].data);
      expect(report.publications).toEqual([]);
      expect(report.publicationChanged).toBe(false);
    });
  });

  test('the production ownership guard rejects stale completion and cannot finish the newer run', async ({ browser }, testInfo) => {
    await withWorkerParityPage(browser, async page => {
      const report = await runScenario(page, 'stale-result', testInfo);
      if (report.scenario !== 'stale-result') throw new Error('Wrong lifecycle scenario');
      expect(report.workers).toHaveLength(2);
      expect(report.oldResult.placements.length).toBeGreaterThan(0);
      expect(report.newResult.placements.length).toBeGreaterThan(0);
      expect(report.newResult).not.toEqual(report.oldResult);
      expect(report.oldAborted).toBe(true);
      expect(report.acceptedOldResult).toBe(false);
      expect(report.oldFinish).toBe(false);
      expect(report.newStillOwned).toBe(true);
      expect(report.acceptedNewResult).toBe(true);
      expect(report.newFinish).toBe(true);
      expect(report.newOwnedAfterFinish).toBe(false);
      expect(report.oldSignal).toEqual({ added: 1, removed: 1, active: 0 });
      expect(report.newSignal).toEqual({ added: 1, removed: 1, active: 0 });
      expect(report.publications).toEqual([{ container: input.container, cargo: report.newCargo, result: report.newResult }]);
      expect(report.latestPublication).toEqual(report.publications[0]);
      expect(report.publicationChanged).toBe(true);
      expect(report.workers[0].messages).toEqual([{ trusted: true, data: { result: report.oldResult } }]);
      expect(report.workers[1].messages).toEqual([{ trusted: true, data: { result: report.newResult } }]);
    });
  });

  test('a real production Worker engine exception returns an error and cleans up without a result', async ({ browser }, testInfo) => {
    await withWorkerParityPage(browser, async page => {
      const report = await runScenario(page, 'returned-error', testInfo);
      if (report.scenario !== 'returned-error') throw new Error('Wrong lifecycle scenario');
      expect(report.workers).toHaveLength(1);
      const worker = report.workers[0];
      expect(worker.requests[0]).toMatchObject({ cargo: null });
      expect(worker.messages).toHaveLength(1);
      expect(worker.messages[0].trusted).toBe(true);
      expect(worker.messages[0].data.error).toEqual(expect.any(String));
      expect(worker.messages[0].data.error?.length).toBeGreaterThan(0);
      expect(worker.messages[0].data).not.toHaveProperty('result');
      expect(report.failure).toEqual({ status: 'rejected', name: 'Error', message: worker.messages[0].data.error });
      expect(report.failure).not.toHaveProperty('result');
      expect(worker.terminateCalls).toBe(1);
      expect(worker.messageErrors).toEqual([]);
      expect(report.signalTrace).toEqual({ added: 1, removed: 1, active: 0 });
      expect(report.publications).toEqual([]);
      expect(report.publicationChanged).toBe(false);
    });
  });

  test('an explicitly injected messageerror exercises protocol cleanup, not a claimed engine failure', async ({ browser }, testInfo) => {
    await withWorkerParityPage(browser, async page => {
      const report = await runScenario(page, 'messageerror', testInfo);
      if (report.scenario !== 'messageerror') throw new Error('Wrong lifecycle scenario');
      expect(report.workers).toHaveLength(1);
      expect(report.workers[0].messageErrors).toEqual([{ trusted: false }]);
      expect(report.workers[0].messages).toEqual([]);
      expect(report.workers[0].terminateCalls).toBe(1);
      expect(report.failure).toMatchObject({ status: 'rejected', name: 'Error', message: '적재 계산 결과를 읽지 못했습니다.' });
      expect(report.failure).not.toHaveProperty('result');
      expect(report.signalTrace).toEqual({ added: 1, removed: 1, active: 0 });
      expect(report.publications).toEqual([]);
      expect(report.publicationChanged).toBe(false);
    });
  });
});
