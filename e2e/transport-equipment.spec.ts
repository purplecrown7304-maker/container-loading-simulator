import { expect, test } from '@playwright/test';

test('transport catalog applies a 20ft container without clearing current cargo', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');

  await page.getByRole('button', { name: '예시 데이터로 시작' }).click();
  const beforeCargo = await page.locator('.cargo-list-item').count();
  expect(beforeCargo).toBeGreaterThan(0);

  await page.getByRole('button', { name: '컨테이너 및 트럭 장비 선택' }).click();
  const dialog = page.getByRole('dialog', { name: '컨테이너 및 트럭 유형' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /20' STANDARD/ }).click();

  await expect(page.getByRole('button', { name: '컨테이너 및 트럭 장비 선택' })).toContainText('20FT Standard');
  await expect(page.locator('.cargo-list-item')).toHaveCount(beforeCargo);
  await expect(page.locator('.transport-dashboard-setting')).toContainText('20FT Standard');

  const card = page.locator('.dashboard-left .dashboard-card').first();
  await card.locator('summary').click();
  await expect(card.getByLabel('길이(m)')).toHaveValue('5.9');
  await expect(card.getByLabel('폭(m)')).toHaveValue('2.352');
  await expect(card.getByLabel('높이(m)')).toHaveValue('2.395');
  await expect(card.getByLabel('최대중량')).toHaveValue('28130');

  const planner = page.locator('#product-packaging-planner');
  await expect(planner.getByLabel('길이(m)').first()).toHaveValue('5.9');
  await expect(planner.getByLabel('폭(m)').first()).toHaveValue('2.352');
  await expect(planner.getByLabel('높이(m)').first()).toHaveValue('2.395');
  await expect(planner.getByLabel('최대중량(kg)').first()).toHaveValue('28130');
});

test('truck tab exposes requested road equipment and custom values can be applied', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
  await page.getByRole('button', { name: '컨테이너 및 트럭 장비 선택' }).click();
  const dialog = page.getByRole('dialog', { name: '컨테이너 및 트럭 유형' });
  await dialog.getByRole('button', { name: /트럭/ }).click();

  await expect(dialog.getByRole('button', { name: /TAUTLINER/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /REFRIGERATED TRUCK/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /ISOTHERM TRUCK/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /MEGA-TRAILER/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /JUMBO/ })).toBeVisible();

  await dialog.getByRole('button', { name: /CUSTOM TRUCK/ }).click();
  await dialog.getByLabel('내부 길이(m)').fill('9.70');
  await dialog.getByLabel('내부 폭(m)').fill('2.44');
  await dialog.getByLabel('내부 높이(m)').fill('2.55');
  await dialog.getByLabel('최대 적재중량(kg)').fill('14500');
  await dialog.getByLabel('바닥 허용하중(kg/m²)').fill('1650');
  await dialog.getByRole('button', { name: '사용자 규격 적용' }).click();

  await expect(page.getByRole('button', { name: '컨테이너 및 트럭 장비 선택' })).toContainText('Custom Truck');
  await expect(page.locator('.transport-dashboard-title')).toHaveText('1. 트럭 적재공간 정보');
  await expect(page.locator('.transport-dashboard-setting')).toContainText('Custom Truck');
});

test('tank equipment is clearly marked as specialized cargo', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
  await page.getByRole('button', { name: '컨테이너 및 트럭 장비 선택' }).click();
  const dialog = page.getByRole('dialog', { name: '컨테이너 및 트럭 유형' });
  await dialog.getByRole('button', { name: /20' TANK/ }).click();
  await expect(dialog.getByText(/특수화물 전용 장비/)).toBeVisible();
  await dialog.getByRole('button', { name: '닫기' }).click();
  await expect(page.locator('.equipment-special-warning')).toContainText('특수화물 전용');
});
