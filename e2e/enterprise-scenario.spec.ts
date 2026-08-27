import { expect, test } from '@playwright/test';

test('enterprise packaging scenarios can be compared and recommended cargo applied', async ({ page }) => {
  await page.goto('/');

  const planner = page.locator('#product-packaging-planner');
  await expect(planner).toBeVisible();
  await planner.getByRole('button', { name: '샘플 불러오기' }).click();
  await expect(planner.getByText('PRD-A', { exact: false }).first()).toBeVisible();

  await planner.getByRole('button', { name: '기업 포장 최적화' }).click();
  await expect(planner.getByText(/포장설계 완료/)).toBeVisible();

  const explorer = page.locator('#enterprise-scenario-explorer');
  await expect(explorer).toBeVisible();
  await explorer.getByRole('button', { name: '시나리오 자동 비교' }).click();
  await expect(explorer.getByText('추천 전략', { exact: true })).toBeVisible();
  await expect(explorer.getByText(/Pareto/)).toBeVisible();

  page.once('dialog', dialog => dialog.accept());
  await explorer.getByRole('button', { name: '추천안 메인 적재에 적용' }).click();
  await expect(page.locator('.cargo-list-item').filter({ hasText: 'PKG-' }).first()).toBeVisible();
});
