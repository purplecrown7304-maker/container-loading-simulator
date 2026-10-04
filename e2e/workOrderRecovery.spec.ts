import { openWorkspace } from './helpers/workspace';
import { expect, test, type Page } from '@playwright/test';

async function loadDirectFixture(page: Page, dimensions: [number, number, number]) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await openWorkspace(page, 1);
  await page.getByRole('button', { name: '선택한 장비 변경', exact: true }).click();
  await page.getByRole('dialog', { name: '컨테이너 및 트럭 유형' }).locator('[data-equipment-id="20-standard"]').click();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('container-loading:open-product-tool', { detail: 'products' })));
  const products = page.getByRole('dialog', { name: '회사 제품 관리' });
  await products.getByLabel('제품코드').fill('REPORT-CHECK');
  await products.getByLabel('제품명').fill('작업지시서 확인 제품');
  for (const [index, label] of ['길이 mm', '폭 mm', '높이 mm'].entries()) await products.getByLabel(label).fill(String(dimensions[index]));
  await products.getByLabel('중량 kg').fill('1');
  await products.getByLabel('박스 적재').selectOption('no');
  await products.getByRole('button', { name: '제품 등록' }).click();
  await products.locator('header button').click();
  await page.getByRole('button', { name: /다음: 제품 선택/ }).click();
  await page.getByPlaceholder('제품명 또는 제품코드 검색').fill('REPORT-CHECK');
  await page.locator('.guided-product-table article').filter({ hasText: 'REPORT-CHECK' }).locator('input[type="number"]').fill('2');
  await page.getByRole('button', { name: /다음: 제품 포장/ }).click();
  await expect(page.getByText('포장안 준비 완료')).toBeVisible();
  await page.getByRole('button', { name: /포장 확정 · 다음: 적재 방식 선택/ }).click();
  await page.getByRole('radio', { name: /1번 파일 적재 방식/ }).click();
  await page.getByRole('button', { name: /선택 완료 · 다음: 자동 적재/ }).click();
  await page.getByRole('button', { name: /최종 적재 진행/ }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__containerLoadingLatestResult?.result.placements.length ?? 0)).toBe(2);
}

async function requestCurrentWorkOrder(page: Page) {
  await page.evaluate(() => {
    const { container, cargo, result } = (window as any).__containerLoadingLatestResult;
    window.dispatchEvent(new CustomEvent('container-loading:request-direct-work-order', { detail: { container, cargo, result } }));
  });
}

test('A-accepted work order recovers from a blocked popup without inertia or repacking', async ({ page, context, baseURL }) => {
  test.setTimeout(120_000);
  const origin = new URL(baseURL!).origin;
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  // Count real workers and optional inspection events; a report must not start either.
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const state = { workers: 0, popupCalls: 0, certifications: 0 };
    (window as any).__workOrderRecovery = state;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) { super(url, options); state.workers++; }
    };
    window.addEventListener('container-loading:inertia-certification-result', (event: Event) => {
      if ((event as CustomEvent).detail) state.certifications++;
    });
    const nativeOpen = window.open.bind(window);
    window.open = (...args: Parameters<typeof window.open>) => ++state.popupCalls === 1 ? null : nativeOpen(...args);
  });
  await loadDirectFixture(page, [400, 300, 200]);
  await expect(page.locator('.guided-bottom-bar').getByRole('button', { name: /^결과 확인/ })).toBeEnabled();
  const before = await page.evaluate(() => ({
    workers: (window as any).__workOrderRecovery.workers,
    result: JSON.stringify((window as any).__containerLoadingLatestResult.result),
    certification: (window as any).__containerLoadingLatestCertification,
    physics: (window as any).__containerLoadingFinalPhysicsResult,
  }));
  expect(before.certification).toBeUndefined();
  expect(before.physics).toBeUndefined();
  await requestCurrentWorkOrder(page);
  const modal = page.getByRole('dialog', { name: 'A 적재 작업지시서' });
  await expect(modal).toContainText('팝업을 허용한 뒤 작업지시서를 다시 여세요.');
  await expect(modal.locator('progress')).toHaveCount(0);
  await modal.getByRole('button', { name: '닫기', exact: true }).click();
  const popupPromise = page.waitForEvent('popup');
  await requestCurrentWorkOrder(page);
  const popup = await popupPromise;
  await expect(popup.getByRole('heading', { name: /통합 출하·적재 작업지시서/ })).toBeVisible();
  await expect(popup.locator('.report-status')).toContainText('A 정적 규칙 검증 통과');
  await expect(popup.locator('aside.technical-note')).toContainText('실제 운송 안전 인증을 의미하지 않습니다');
  await expect(popup.locator('.footer')).toContainText('관성검사(선택): 미실시');
  await expect(popup.locator('.summary')).toContainText('2 EA');
  await expect(modal).toHaveCount(0);
  const after = await page.evaluate(() => ({ state: (window as any).__workOrderRecovery, result: JSON.stringify((window as any).__containerLoadingLatestResult.result) }));
  expect(after.state).toEqual({ workers: before.workers, popupCalls: 2, certifications: 0 });
  expect(after.result).toBe(before.result);
});

test('A hard errors retain the packed candidate and block result approval and work orders', async ({ page, context, baseURL }) => {
  test.setTimeout(120_000);
  const origin = new URL(baseURL!).origin;
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await loadDirectFixture(page, [80, 80, 2000]);
  await expect(page.locator('.guided-step-list button').nth(5)).toBeDisabled();
  const before = await page.evaluate(() => (window as any).__containerLoadingLatestResult.result);
  expect(before.placements).toHaveLength(2);
  expect(before.remaining).toEqual([]);
  expect(before.validationIssues).toEqual(expect.arrayContaining([expect.objectContaining({ message: expect.stringContaining('CG_LATERAL') })]));
  expect(before.operationalFindings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'REAR_GAP', severity: 'warning' })]));
  let popups = 0;
  page.on('popup', () => popups++);
  await requestCurrentWorkOrder(page);
  await expect(page.getByRole('dialog', { name: 'A 적재 작업지시서' })).toContainText('CG_LATERAL');
  expect(popups).toBe(0);
  expect(await page.evaluate(() => (window as any).__containerLoadingLatestResult.result)).toEqual(before);
  expect(await page.evaluate(() => (window as any).__containerLoadingLatestCertification)).toBeUndefined();
});
