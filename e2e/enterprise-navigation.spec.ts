import { expect, test } from '@playwright/test';

async function openProductManager(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('container-loading:open-product-tool', { detail: 'products' }));
  });
  return page.getByRole('dialog', { name: '회사 제품 관리' });
}

test('guided workflow starts at equipment and advances to product selection without route churn', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '적재공간 선택' })).toBeVisible();
  await expect(page.locator('.guided-step-list button')).toHaveCount(6);
  const url = page.url();

  await page.getByRole('button', { name: /다음: 제품 선택/ }).click();
  await expect(page.getByRole('heading', { name: '제품 선택' })).toBeVisible();
  expect(page.url()).toBe(url);
});

test('company product manager is an in-place modal and closes back to the guided workflow', async ({ page }) => {
  await page.goto('/');
  const url = page.url();
  const dialog = await openProductManager(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: '회사 제품 관리' })).toBeVisible();
  expect(page.url()).toBe(url);

  await dialog.locator('header button').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '적재공간 선택' })).toBeVisible();
  expect(page.url()).toBe(url);
});
