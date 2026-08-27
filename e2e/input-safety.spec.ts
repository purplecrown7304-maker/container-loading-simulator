import { expect, test } from '@playwright/test';

test('unlimited top load remains distinct from explicit zero after edit and save', async ({ page }) => {
  await page.goto('/');

  const panel = page.locator('.cargo-add-panel');
  await panel.locator('summary').click();
  await panel.getByLabel('코드').fill('SAFE-A');
  await panel.getByLabel('이름').fill('Safety A');

  const topLoad = panel.getByLabel('상부 허용중량(kg)');
  await topLoad.fill('');
  await panel.getByRole('button', { name: '박스 추가' }).click();

  const row = page.locator('.cargo-list-item').filter({ hasText: 'SAFE-A' });
  await expect(row).toContainText('상부허용 제한없음');

  await row.getByRole('button', { name: '수정' }).click();
  await expect(panel.getByLabel('상부 허용중량(kg)')).toHaveValue('');

  await panel.getByLabel('상부 허용중량(kg)').fill('0');
  await panel.getByRole('button', { name: '수정 저장' }).click();
  await expect(row).toContainText('상부허용 0 kg');

  await row.getByRole('button', { name: '수정' }).click();
  await expect(panel.getByLabel('상부 허용중량(kg)')).toHaveValue('0');
});

test('editing a planning input clears the stale physics target immediately', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    (window as typeof window & { __containerLoadingPhysicsTarget?: unknown }).__containerLoadingPhysicsTarget = {
      mode: 'boxes',
      container: { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 },
      cargo: [],
      result: { placements: [], remaining: [], loadedWeightKg: 0, usedVolumeM3: 0, validationIssues: [] },
    };
  });

  await page.getByText('상세 규격 / 직접 수정').click();
  const containerCard = page.locator('.dashboard-left .dashboard-card').first();
  await containerCard.getByLabel('길이(m)').fill('12.04');

  const targetExists = await page.evaluate(() => Boolean(
    (window as typeof window & { __containerLoadingPhysicsTarget?: unknown }).__containerLoadingPhysicsTarget,
  ));
  expect(targetExists).toBe(false);
});
