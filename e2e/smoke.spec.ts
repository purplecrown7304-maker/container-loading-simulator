import { expect, test, type Page } from '@playwright/test';

const STORAGE_KEY = 'container-loading-simulator-v1';
const container = { length: 12.032, width: 2.35, height: 2.7, maxPayloadKg: 28600, floorLoadLimitKgPerM2: 1500, floorLoadWarningMultiplier: 3 };

async function seedCargo(page: Page, quantity = 1) {
  await page.addInitScript(({ key, containerSpec, qty }) => {
    localStorage.clear();
    localStorage.setItem(key, JSON.stringify({
      container: containerSpec,
      cargo: [{ id: 'E2E-A', name: 'E2E A', length: 0.5, width: 0.4, height: 0.3, weightKg: 10, quantity: qty, maxStackLayers: 7, maxTopLoadKg: 100, allowRotation: true }],
    }));
  }, { key: STORAGE_KEY, containerSpec: container, qty: quantity });
}

async function goToLoading(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '운송 장비를 선택하세요' })).toBeVisible();
  await page.getByRole('button', { name: '화물 선택으로' }).click();
  await expect(page.getByRole('heading', { name: '화물을 선택하세요' })).toBeVisible();
  await page.getByRole('button', { name: '자동 적재로' }).click();
  await expect(page.getByRole('heading', { name: '자동 적재' })).toBeVisible();
  await expect(page.locator('.ux3-viewer-host canvas')).toBeVisible({ timeout: 20_000 });
}

test('UX v3 mounts as a four-step loading workflow', async ({ page }) => {
  await seedCargo(page, 2);
  await page.goto('/');

  await expect(page.getByText('컨테이너 적재 시뮬레이터')).toBeVisible();
  await expect(page.getByText('장비 선택', { exact: true })).toBeVisible();
  await expect(page.getByText('화물 선택', { exact: true })).toBeVisible();
  await expect(page.getByText('자동 적재', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('결과 확인', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Excel 내보내기' })).toBeVisible();
  await expect(page.getByRole('button', { name: '화물 선택으로' })).toBeEnabled();
});

test('direct box loading reaches result tabs and work order without a certification gate', async ({ page }) => {
  test.setTimeout(120_000);
  await seedCargo(page, 1);
  await goToLoading(page);

  await page.getByRole('button', { name: '자동 적재 실행' }).click();
  await expect(page.getByRole('heading', { name: '적재 결과' })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole('button', { name: /^미적재/ })).toBeVisible();
  await expect(page.getByRole('button', { name: '무게 분포' })).toBeVisible();
  await expect(page.getByRole('button', { name: '안전 검사' })).toBeVisible();
  await expect(page.getByRole('button', { name: '작업지시서 열기' })).toBeEnabled();

  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: '작업지시서 열기' }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveTitle(/적재 작업지시서/);
});

test('pallet mode completes without the legacy certification modal', async ({ page }) => {
  test.setTimeout(90_000);
  await seedCargo(page, 2);
  await page.goto('/');
  await page.getByRole('button', { name: '화물 선택으로' }).click();
  await page.getByRole('button', { name: '팔레트', exact: true }).click();
  await page.getByRole('button', { name: '자동 적재로' }).click();
  await expect(page.locator('.ux3-viewer-host canvas')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: '자동 적재 실행' }).click();
  await expect(page.getByRole('heading', { name: '적재 결과' })).toBeVisible({ timeout: 40_000 });
  await expect(page.locator('.final-cert-modal')).toHaveCount(0);

  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: '작업지시서 열기' }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveTitle(/팔레트 적재 작업지시서/);
});

test('mobile workflow has no horizontal page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedCargo(page, 1);
  await page.goto('/');
  await expect(page.getByText('컨테이너 적재 시뮬레이터')).toBeVisible();
  await page.getByRole('button', { name: '화물 선택으로' }).click();
  await expect(page.getByRole('heading', { name: '화물을 선택하세요' })).toBeVisible();
  const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 2);
});
