import { expect, test } from '@playwright/test';

test('product selection cannot advance until at least one product quantity is selected', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /다음: 제품 선택/ }).click();
  await expect(page.getByRole('heading', { name: '제품 선택' })).toBeVisible();
  await expect(page.getByRole('button', { name: /다음: 제품 포장/ })).toBeDisabled();
});

test('changing the active transport equipment invalidates stale physics state', async ({ page }) => {
  await page.goto('/');
  // The selector remains accessible while the Unity preview loads.
  const selector = page.getByRole('button', { name: '선택한 장비 변경', exact: true });
  await expect(selector).toBeVisible();
  await selector.click();
  const dialog = page.getByRole('dialog', { name: '컨테이너 및 트럭 유형' });
  await expect(dialog).toBeVisible();
  const standard = dialog.locator('.transport-equipment-card[data-equipment-id="20-standard"]');
  await expect(standard).toBeVisible();

  // Seed stale state only after the initial page and selector have mounted.
  await page.evaluate(() => {
    (window as Window & { __containerLoadingLatestPhysics?: unknown }).__containerLoadingLatestPhysics = { score: 999 };
  });
  await standard.click();
  await expect(dialog).toHaveCount(0);
  await expect(selector).toContainText('20FT Standard');
  await expect(page.locator('.guided-equipment-specs')).toContainText('5,900 mm');

  await expect.poll(async () => page.evaluate(() => (
    (window as Window & { __containerLoadingLatestPhysics?: unknown }).__containerLoadingLatestPhysics
  ))).toBeUndefined();
});
