import { expect, test, type Page } from '@playwright/test';
import { expectVerifiedLoading } from './helpers/certification';
import { directLoadingFixtures, type DirectLoadingFixture } from './helpers/loadingFixtures';

const PRODUCT = 'E2E-SPLIT';

async function prepareOverflowingJob(page: Page, fixture: DirectLoadingFixture) {
  await page.goto('/');
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('container-loading:open-product-tool', { detail: 'products' }));
  });
  const dialog = page.getByRole('dialog', { name: '회사 제품 관리' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('제품코드', { exact: true }).fill(PRODUCT);
  await dialog.getByLabel('제품명', { exact: true }).fill('차량 나누기 제품');
  await dialog.getByLabel('길이 mm').fill(String(fixture.length * 1000));
  await dialog.getByLabel('폭 mm').fill(String(fixture.width * 1000));
  await dialog.getByLabel('높이 mm').fill(String(fixture.height * 1000));
  await dialog.getByLabel('중량 kg').fill(String(fixture.weightKg));
  await dialog.getByLabel('박스 적재').selectOption('no');
  await dialog.getByRole('button', { name: '제품 등록' }).click();
  await dialog.locator('header button').click();
  await page.getByRole('button', { name: /다음: 제품 선택/ }).click();
  await page.getByPlaceholder('제품명 또는 제품코드 검색').fill(PRODUCT);
  await page.locator('.guided-product-table article').filter({ hasText: PRODUCT }).locator('input[type="number"]').fill(String(fixture.quantity));
  await page.getByRole('button', { name: /다음: 제품 포장/ }).click();
  await expect(page.getByText('포장안 준비 완료')).toBeVisible();
  await page.getByRole('button', { name: /포장 확정 · 다음: 적재 방식 선택/ }).click();
  await expect(page.getByRole('radio', { name: /안정성 우선/ })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: /다음 단계/ }).click();
}

const jobState = (page: Page) => page.evaluate(() => {
  const state = window as any;
  const latest = state.__containerLoadingLatestResult;
  const stored = JSON.parse(localStorage.getItem('container-loading-simulator-v1') ?? 'null');
  return {
    stored: stored?.cargo.reduce((sum: number, item: any) => sum + item.quantity, 0) ?? 0,
    requested: latest?.cargo.reduce((sum: number, item: any) => sum + item.quantity, 0) ?? 0,
    loaded: latest?.result.placements.length ?? 0,
    waiting: latest?.result.remaining.reduce((sum: number, item: any) => sum + item.quantity, 0) ?? 0,
  };
});

async function runFinalLoading(page: Page) {
  await page.getByRole('button', { name: /최종 적재 진행/ }).click();
  await expectVerifiedLoading(page);
}

/**
 * Opens the work order of the plan that is loaded, the way the other specs do: the request
 * re-checks the selected plan and opens the report without leaving STEP 05, so the vehicle
 * switch stays in reach. `verified-status-stable.spec.ts` covers the footer button.
 */
async function openWorkOrder(page: Page) {
  const popup = page.waitForEvent('popup', { timeout: 120_000 });
  await expect.poll(() => page.evaluate(() => {
    const target = (window as any).__containerLoadingPhysicsTarget;
    if (!target?.result?.placements?.length) return false;
    window.dispatchEvent(new CustomEvent('container-loading:request-direct-work-order', { detail: { ...target, preserveSelectedPlan: true } }));
    return true;
  })).toBe(true);
  return popup;
}

test('cargo that does not fit one vehicle is divided evenly over two, each verified and printed on its own', async ({ page }) => {
  test.setTimeout(300_000);
  await prepareOverflowingJob(page, directLoadingFixtures.overflowTwentyOneBox40ft);
  const panel = page.locator('.vehicle-split-panel');
  const status = page.locator('.guided-status-row');
  await expect(panel).toHaveCount(0);

  // One vehicle: twelve slabs cover the floor, nine wait.
  await runFinalLoading(page);
  expect(await jobState(page)).toEqual({ stored: 21, requested: 21, loaded: 12, waiting: 9 });
  await expect(panel).toHaveAttribute('data-vehicle-split', 'offer');
  await expect(panel).toContainText('한 대에 다 싣지 못했습니다');
  await expect(panel).toContainText('미적재 9 EA');
  const start = panel.getByRole('button', { name: '차량 2대로 나누기', exact: true });
  // The summary column floats over the 3D scene: the button has to receive the click itself.
  await expect(start).toBeInViewport({ ratio: 1 });
  expect(await start.evaluate(element => { const box = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)); })).toBe(true);
  await start.click();

  // Vehicle 1 holds its share and has to be planned and verified again.
  await expect(panel).toHaveAttribute('data-vehicle-split', 'active');
  await expect(panel).toHaveAttribute('data-vehicle-active', '1');
  await expect(panel).toHaveAttribute('data-vehicle-count', '2');
  await expect(status).toHaveAttribute('data-verification-status', 'unrun');
  await expect(page.locator('.guided-step-list button').nth(5)).toBeDisabled();
  await expect(page.locator('.status-message')).toContainText('차량 나누기를 적용했습니다');
  const tabs = panel.getByRole('tab');
  await expect(tabs).toHaveCount(2);
  await expect(tabs.nth(0)).toContainText('11 EA');
  await expect(tabs.nth(1)).toContainText('10 EA');
  await expect(tabs.nth(1)).toContainText('계산 전');
  expect(await jobState(page)).toEqual({ stored: 11, requested: 11, loaded: 0, waiting: 0 });

  await runFinalLoading(page);
  expect(await jobState(page)).toEqual({ stored: 11, requested: 11, loaded: 11, waiting: 0 });
  await expect(tabs.nth(0)).toHaveAttribute('data-vehicle-status', 'passed');
  // Everything fits and passes: nothing more is offered.
  await expect(panel.locator('[data-vehicle-split-action="more"]')).toHaveCount(0);

  const firstOrder = await openWorkOrder(page);
  await expect(firstOrder.getByRole('heading', { name: /통합 출하·적재 작업지시서 · 차량 1\/2/ })).toBeVisible();
  const firstNote = firstOrder.locator('.vehicle-split-note');
  await expect(firstNote).toHaveAttribute('data-vehicle-split', '1/2');
  await expect(firstNote).toContainText('전체 21 EA를 차량 2대에 고르게 나눈 화물입니다');
  await expect(firstNote).toContainText('차량 1 · 11 EA');
  await expect(firstNote).toContainText('차량 2 · 10 EA');
  await expect(firstOrder.locator('.summary')).toContainText('11 EA');
  await expect(firstOrder.locator('.shipment-block')).toContainText('차량별로 나눈 화물입니다');
  await expect(firstOrder.locator('.watermark')).toHaveCount(0);
  await expect(firstOrder.locator('.footer')).toContainText('완료 · PASS');
  await firstOrder.close();
  await expect(status).toHaveAttribute('data-verification-status', 'passed');
  await expect(tabs.nth(0)).toHaveAttribute('data-vehicle-status', 'passed');

  // Vehicle 2 carries another share: its plan and its verification are its own.
  await tabs.nth(1).click();
  await expect(panel).toHaveAttribute('data-vehicle-active', '2');
  await expect(status).toHaveAttribute('data-verification-status', 'unrun');
  await expect(tabs.nth(0)).toContainText('검증 통과 기록');
  await expect(tabs.nth(1)).toHaveAttribute('data-vehicle-status', 'unrun');
  expect(await jobState(page)).toEqual({ stored: 10, requested: 10, loaded: 0, waiting: 0 });
  await runFinalLoading(page);
  expect(await jobState(page)).toEqual({ stored: 10, requested: 10, loaded: 10, waiting: 0 });
  const secondOrder = await openWorkOrder(page);
  await expect(secondOrder.getByRole('heading', { name: /통합 출하·적재 작업지시서 · 차량 2\/2/ })).toBeVisible();
  await expect(secondOrder.locator('.vehicle-split-note')).toHaveAttribute('data-vehicle-split', '2/2');
  await expect(secondOrder.locator('.summary')).toContainText('10 EA');
  await secondOrder.close();
  await expect(status).toHaveAttribute('data-verification-status', 'passed');
  await expect(tabs.nth(1)).toHaveAttribute('data-vehicle-status', 'passed');

  // Back to one vehicle: the whole cargo is the job again and nothing of the split is kept.
  await panel.getByRole('button', { name: '한 대로 되돌리기', exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.locator('.status-message')).toContainText('전체 화물로 되돌렸습니다');
  await expect(status).toHaveAttribute('data-verification-status', 'unrun');
  expect(await jobState(page)).toEqual({ stored: 21, requested: 21, loaded: 0, waiting: 0 });
  expect(await page.evaluate(() => localStorage.getItem('container-loading-vehicle-split-v1'))).toBeNull();
});

test('vehicles with the same share keep one plan and one verification', async ({ page }) => {
  test.setTimeout(240_000);
  await prepareOverflowingJob(page, directLoadingFixtures.overflowTwentyBox40ft);
  const panel = page.locator('.vehicle-split-panel');
  const status = page.locator('.guided-status-row');
  await runFinalLoading(page);
  expect(await jobState(page)).toEqual({ stored: 20, requested: 20, loaded: 12, waiting: 8 });
  await panel.getByRole('button', { name: '차량 2대로 나누기', exact: true }).click();
  await expect(panel).toHaveAttribute('data-vehicle-active', '1');
  await runFinalLoading(page);
  const tabs = panel.getByRole('tab');
  await expect(tabs.nth(0)).toHaveAttribute('data-vehicle-status', 'passed');

  // Ten slabs in each vehicle: the same input, so the verified plan is the plan of vehicle 2 too.
  // Nothing is recomputed: the plan stays loaded and verified without another final loading.
  await tabs.nth(1).click();
  await expect(panel).toHaveAttribute('data-vehicle-active', '2');
  await expect(page.locator('.status-message')).toContainText('앞 차량과 화물이 같습니다');
  await expect(status).toHaveAttribute('data-verification-status', 'passed');
  await expect(tabs.nth(1)).toHaveAttribute('data-vehicle-status', 'passed');
  await expect(tabs.nth(0)).toContainText('검증 통과 기록');
  expect(await jobState(page)).toEqual({ stored: 10, requested: 10, loaded: 10, waiting: 0 });

  // Its work order is the same plan under its own name.
  const order = await openWorkOrder(page);
  await expect(order.getByRole('heading', { name: /통합 출하·적재 작업지시서 · 차량 2\/2/ })).toBeVisible();
  await expect(order.locator('.vehicle-split-note')).toContainText('차량 1 · 10 EA');
  await order.close();

  await panel.getByRole('button', { name: '한 대로 되돌리기', exact: true }).click();
  await expect(panel).toHaveCount(0);
  expect((await jobState(page)).stored).toBe(20);
});
