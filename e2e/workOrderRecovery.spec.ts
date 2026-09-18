import { expect, test } from '@playwright/test';

test('stalled optional re-layout completes and a blocked warning report opens without recalculation', async ({ page, context, baseURL }) => {
  test.setTimeout(120_000);
  const origin = new URL(baseURL!).origin;
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  // Fault injection is isolated to this test: real inertia runs, but optional packing workers never reply.
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const state = { started: 0, terminated: 0, popupCalls: 0, events: [] as any[] };
    (window as any).__workOrderRecovery = state;
    window.addEventListener('container-loading:request-direct-work-order', (event: Event) => state.events.push({ type: 'request', report: (event as CustomEvent).detail.openReport ?? true }));
    window.addEventListener('container-loading:inertia-certification-result', (event: Event) => {
      const cert = (event as CustomEvent).detail;
      if (cert) state.events.push({ type: 'certification', status: cert.status, tested: cert.testedScenarios, matchesPhysics: cert.targetSignature === (window as any).__containerLoadingFinalPhysicsSignature });
    });
    window.Worker = class extends NativeWorker {
      private stalled: boolean;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.stalled = /loading\.worker-/.test(String(url));
        if (this.stalled) state.started++;
      }
      postMessage(message: any, transfer?: any) { if (!this.stalled) super.postMessage(message, transfer); }
      terminate() { if (this.stalled) state.terminated++; super.terminate(); }
    };
    const nativeOpen = window.open.bind(window);
    window.open = (...args: Parameters<typeof window.open>) => {
      state.popupCalls++;
      return state.popupCalls === 1 ? null : nativeOpen(...args);
    };
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '적재공간 선택' })).toBeVisible();
  // Wait for the application's event-driven controls to finish mounting.
  await page.getByRole('button', { name: /메뉴$/ }).click();
  await expect(page.getByRole('navigation', { name: '적재 작업 전체 메뉴' })).toBeVisible();
  await page.getByRole('button', { name: /메뉴$/ }).click();
  await page.getByRole('button', { name: /적재공간 다시 선택$/ }).click();
  await page.getByRole('dialog', { name: '컨테이너 및 트럭 유형' }).locator('[data-equipment-id="20-standard"]').click();
  await page.evaluate(() => {
    sessionStorage.setItem('container-loading-local-operator-v1', JSON.stringify({ id: 'work-order-regression', name: '작업지시서 테스트' }));
    const container = (window as any).__containerLoadingLatestResult.container;
    const cargo = [{ id: 'SLENDER', name: '검증용 고적층 박스', length: 0.08, width: 0.08, height: 0.2, weightKg: 1, quantity: 20, maxStackLayers: 10, maxTopLoadKg: 100, allowRotation: false }];
    const placements = Array.from({ length: 20 }, (_, index) => ({ cargoId: 'SLENDER', x: 1 + Math.floor(index / 10) * 2, y: 1, z: index % 10 * 0.2, length: 0.08, width: 0.08, height: 0.2, weightKg: 1 }));
    const result = { placements, remaining: [], loadedWeightKg: 20, usedVolumeM3: 0.0256, validationIssues: [] };
    (window as any).__workOrderFixture = { container, cargo, result };
    window.dispatchEvent(new CustomEvent('container-loading:request-direct-work-order', { detail: { container, cargo, result } }));
  });
  // The application's repair bridge first runs the real final physics suite for a new fixture.
  // Begin the manual report request only after that prerequisite is recorded, as on the results screen.
  await expect.poll(() => page.evaluate(() => Boolean((window as any).__containerLoadingFinalPhysicsSignature && (window as any).__containerLoadingFinalPhysicsResult && !(window as any).__containerLoadingFinalPhysicsRunning)), { timeout: 60_000 }).toBe(true);
  await page.evaluate(() => {
    (window as any).__workOrderRecovery.popupCalls = 0;
    window.dispatchEvent(new CustomEvent('container-loading:request-direct-work-order', { detail: (window as any).__workOrderFixture }));
  });
  const modal = page.getByRole('dialog', { name: '작업지시서 전 상자 안전 후보 비교' });
  await expect(modal).toBeVisible();
  await expect(modal.getByText('동일 수량을 유지하는 안전 재배치 후보를 계산 중입니다.')).toBeVisible({ timeout: 60_000 });
  await expect(modal.getByText(/추가 배치 계산 \d\/7회/)).toBeVisible();
  expect(await modal.locator('progress').evaluate((element: HTMLProgressElement) => element.value)).toBeLessThan(100);
  await expect(modal.getByRole('button', { name: '계산 취소' })).toBeVisible();
  await expect(modal.getByRole('button', { name: '작업지시서 열기', exact: true })).toBeVisible({ timeout: 30_000 }).catch(async error => {
    console.log('recovery diagnostic', await page.evaluate(() => ({ state: (window as any).__workOrderRecovery, current: (window as any).__containerLoadingPhysicsTarget?.container, finalPhysics: Boolean((window as any).__containerLoadingFinalPhysicsSignature) })));
    throw error;
  });
  await expect(modal).toContainText('시간 제한');
  await expect(modal).toContainText('팝업이 차단');
  const before = await page.evaluate(() => ({ ...(window as any).__workOrderRecovery, certification: (window as any).__containerLoadingLatestCertification }));
  expect(before.started).toBeGreaterThan(0);
  expect(before.started).toBe(before.terminated);
  expect(before.certification.status).toBe('failed');
  expect(before.certification.testedScenarios).toBe(3);
  const popupPromise = page.waitForEvent('popup');
  await modal.getByRole('button', { name: '작업지시서 열기', exact: true }).click();
  const popup = await popupPromise;
  await expect(popup.getByRole('heading', { name: /통합 출하·적재 작업지시서/ })).toBeVisible();
  await expect(popup.locator('.recommendations')).toContainText('모든 후보를 탐색한 결과는 아닙니다');
  await expect(popup.locator('.recommendations')).toContainText('위험 기준을 초과');
  await expect(popup.locator('.summary')).toContainText('20 EA');
  await expect(modal).toHaveCount(0);
  const after = await page.evaluate(() => (window as any).__workOrderRecovery);
  expect(after.started).toBe(before.started);
  expect(after.popupCalls).toBe(2);
  console.log('warning work order opened: 20 boxes, 3 real inertia scenarios, stalled workers terminated, no recalculation');
});
