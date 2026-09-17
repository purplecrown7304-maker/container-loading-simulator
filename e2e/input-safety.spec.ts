import { expect, test } from '@playwright/test';

test('product selection cannot advance until at least one product quantity is selected', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /다음: 제품 선택/ }).click();
  await expect(page.getByRole('heading', { name: '제품 선택' })).toBeVisible();
  await expect(page.getByRole('button', { name: /다음: 제품 포장/ })).toBeDisabled();
});

test('changing the active transport equipment invalidates stale physics state', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    (window as Window & { __containerLoadingLatestPhysics?: unknown }).__containerLoadingLatestPhysics = { score: 999 };
  });

  await page.locator('.guided-stage-panel:visible .guided-equipment-card.selected').click();
  const dialog = page.getByRole('dialog', { name: '컨테이너 및 트럭 유형' });
  await expect(dialog).toBeVisible();
  const cards = dialog.locator('.transport-equipment-card');
  await expect(cards.first()).toBeVisible();
  await cards.nth(1).click();
  await expect(dialog).toHaveCount(0);

  await expect.poll(async () => page.evaluate(() => (
    (window as Window & { __containerLoadingLatestPhysics?: unknown }).__containerLoadingLatestPhysics
  ))).toBeUndefined();
});
