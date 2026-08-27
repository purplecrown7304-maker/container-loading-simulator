import { expect, test } from '@playwright/test';

test('enterprise products can be converted into container-optimized cartons', async ({ page }) => {
  await page.goto('/');
  const planner = page.locator('#product-packaging-planner');
  await expect(planner).toBeVisible();

  await planner.getByRole('button', { name: '샘플 불러오기' }).click();
  await expect(planner.getByText('PRD-A', { exact: false })).toBeVisible();
  await expect(planner.getByText('BOX-604040', { exact: false })).toBeVisible();

  await planner.getByRole('button', { name: '자동 박스 설계' }).click();
  await expect(planner.getByRole('heading', { name: '최적 포장 설계 결과' })).toBeVisible();
  await expect(planner.getByText('PRD-A', { exact: true }).last()).toBeVisible();
  await expect(planner.getByText(/자동설계|보유박스/).first()).toBeVisible();

  page.once('dialog', dialog => dialog.accept());
  await planner.getByRole('button', { name: '메인 적재에 적용' }).click();
  await expect(page.locator('.cargo-list-item').filter({ hasText: 'PKG-PRD-A' })).toBeVisible();
  await expect(page.getByText(/물리 최적 자동 적재/).first()).toBeVisible();
});
