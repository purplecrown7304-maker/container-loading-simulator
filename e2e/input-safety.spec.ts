import { expect, test } from '@playwright/test';
import { gotoWithBasicCargo } from './helpers';

test('unlimited top load remains distinct from explicit zero in the visible box catalog', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('container-loading-box-catalog-v1', JSON.stringify([
      { id: 'SAFE-UNLIMITED', name: 'Unlimited', length: 0.5, width: 0.4, height: 0.3, weightKg: 10, quantity: 0, maxStackLayers: 7, allowRotation: true },
      { id: 'SAFE-ZERO', name: 'Zero', length: 0.5, width: 0.4, height: 0.3, weightKg: 10, quantity: 0, maxStackLayers: 7, maxTopLoadKg: 0, allowRotation: true },
    ]));
  });
  await page.goto('/');
  await page.getByRole('button', { name: /다음: 화물 선택/ }).click();
  await page.getByRole('button', { name: '박스 선택', exact: true }).click();

  const modal = page.locator('.box-selector-modal');
  await expect(modal).toBeVisible();
  const unlimited = modal.getByRole('row').filter({ hasText: 'SAFE-UNLIMITED' });
  const zero = modal.getByRole('row').filter({ hasText: 'SAFE-ZERO' });
  await expect(unlimited).toContainText('제한없음');
  await expect(zero).toContainText('0');
});

test('editing a guided planning input clears the stale physics target immediately', async ({ page }) => {
  await gotoWithBasicCargo(page);
  await page.evaluate(() => {
    (window as typeof window & { __containerLoadingPhysicsTarget?: unknown }).__containerLoadingPhysicsTarget = {
      mode: 'boxes',
      container: { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 },
      cargo: [],
      result: { placements: [], remaining: [], loadedWeightKg: 0, usedVolumeM3: 0, validationIssues: [] },
    };
  });

  await page.locator('.guided-qty-control').first().getByRole('button', { name: '＋' }).click();

  await expect.poll(() => page.evaluate(() => Boolean(
    (window as typeof window & { __containerLoadingPhysicsTarget?: unknown }).__containerLoadingPhysicsTarget,
  ))).toBe(false);
});
