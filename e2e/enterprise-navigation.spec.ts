import { expect, test } from '@playwright/test';

test('enterprise planner can return to the main simulator without losing the document', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');

  const shortcut = page.locator('.product-packaging-shortcut');
  await expect(shortcut).toBeVisible();
  await shortcut.click();

  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#product-packaging-planner');
  await expect(page.locator('#product-packaging-planner')).toBeInViewport();

  const back = page.getByRole('button', { name: '메인 적재 화면으로' });
  await expect(back).toBeVisible();
  await back.click();

  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('');
  await expect(page.locator('.mockup-dashboard')).toBeInViewport();
});

test('browser back also returns from enterprise planner to the main simulator', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');

  await page.locator('.product-packaging-shortcut').click();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#product-packaging-planner');

  await page.goBack();

  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('');
  await expect(page.locator('.mockup-dashboard')).toBeInViewport();
});
