import { expect, test } from '@playwright/test';

test('enterprise planner can return to the guided simulator without losing the document', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/#product-packaging-planner');

  const planner = page.locator('#product-packaging-planner');
  await expect(planner).toBeVisible();
  await planner.scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#product-packaging-planner');

  const actions = page.locator('.enterprise-packaging-planner .packaging-actions');
  const back = page.getByRole('button', { name: '메인 적재 화면으로' });
  await expect(back).toBeVisible();
  await expect(actions.locator('button').first()).toHaveClass(/enterprise-back-to-main/);

  await back.click();

  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('');
  await expect(page.getByRole('heading', { name: '장비 선택', exact: true })).toBeVisible();
});

test('browser back returns from enterprise planner to the guided simulator', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
  await page.goto('/#product-packaging-planner');
  await expect(page.locator('#product-packaging-planner')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#product-packaging-planner');

  await page.goBack();

  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('');
  await expect(page.getByRole('heading', { name: '장비 선택', exact: true })).toBeVisible();
});
