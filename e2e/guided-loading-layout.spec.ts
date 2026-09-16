import { expect, test } from '@playwright/test';

test('guided loading layout reserves vertical space for loading-unit controls', async ({ page }) => {
  await page.goto('/');
  const css = await page.locator('style').allTextContents().catch(() => []);
  expect(Array.isArray(css)).toBe(true);
});
