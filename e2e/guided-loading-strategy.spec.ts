import { expect, test } from '@playwright/test';

test('guided workflow shows loading strategy between packaging and automatic loading', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');

  const steps = page.locator('.guided-step-list button');
  await expect(steps).toHaveCount(6);
  await expect(steps.nth(2)).toContainText('제품 포장');
  await expect(steps.nth(3)).toContainText('적재 방식 선택');
  await expect(steps.nth(4)).toContainText('자동 적재');
  await expect(steps.nth(5)).toContainText('결과 확인');
});
