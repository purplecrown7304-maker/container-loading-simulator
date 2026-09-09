import { expect, test } from '@playwright/test';
import { advanceToLoading, seedBasicCargo, selectWorkflowStep } from './helpers';

async function openEquipmentDialog(page: import('@playwright/test').Page) {
  await page.locator('.guided-equipment-card').click();
  const dialog = page.getByRole('dialog', { name: '컨테이너 및 트럭 유형' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('transport catalog applies a 20ft container without clearing current cargo', async ({ page }) => {
  await seedBasicCargo(page);
  await page.goto('/');
  await selectWorkflowStep(page, '장비 선택');

  const dialog = await openEquipmentDialog(page);
  await dialog.getByRole('button', { name: /20' STANDARD/ }).click();
  await expect(dialog).toContainText(/20FT Standard.*현재 적재계획에 적용했습니다|20FT Standard 규격을 현재 적재계획에 적용했습니다/);
  await dialog.getByRole('button', { name: '닫기' }).click();

  await expect(page.locator('.guided-equipment-card')).toContainText('20FT Standard');
  await selectWorkflowStep(page, '화물 선택');
  await expect(page.locator('.guided-cargo-list')).toContainText('E2E-A');
  await expect(page.locator('.guided-job-summary')).toContainText('20FT Standard');

  const planner = page.locator('#product-packaging-planner');
  await expect(planner.getByLabel('길이(m)').first()).toHaveValue('5.9');
  await expect(planner.getByLabel('폭(m)').first()).toHaveValue('2.352');
  await expect(planner.getByLabel('높이(m)').first()).toHaveValue('2.395');
  await expect(planner.getByLabel('최대중량(kg)').first()).toHaveValue('28130');
});

test('truck tab exposes requested road equipment and custom values can be applied', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
  const dialog = await openEquipmentDialog(page);
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
  await dialog.getByRole('button', { name: '닫기' }).click();

  await expect(page.locator('.guided-equipment-card')).toContainText('Custom Truck');
  await expect(page.locator('.guided-job-summary')).toContainText('Custom Truck');
});

test('tank equipment is marked specialized and blocks general box optimization', async ({ page }) => {
  await seedBasicCargo(page);
  await page.goto('/');
  await selectWorkflowStep(page, '장비 선택');
  const dialog = await openEquipmentDialog(page);
  await dialog.getByRole('button', { name: /20' TANK/ }).click();
  await expect(dialog.getByText(/특수화물 전용 장비/)).toBeVisible();
  await dialog.getByRole('button', { name: '닫기' }).click();
  await expect(page.locator('.equipment-special-warning')).toContainText('특수화물 전용');

  await selectWorkflowStep(page, '화물 선택');
  await advanceToLoading(page, 'boxes');
  await page.getByRole('button', { name: /최종 적재 진행/ }).click();
  const safety = page.getByRole('alertdialog', { name: /일반 박스 적재 대상이 아닙니다/ });
  await expect(safety).toBeVisible();
  await expect(safety).toContainText('20FT Tank');
  await expect(page.locator('.calculation-overlay')).toHaveCount(0);
});

test('selected equipment persists after reload', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
  const dialog = await openEquipmentDialog(page);
  await dialog.getByRole('button', { name: /40' OPEN TOP/ }).click();
  await dialog.getByRole('button', { name: '닫기' }).click();
  await expect(page.locator('.guided-equipment-card')).toContainText('40FT Open Top');

  await page.reload();
  await expect(page.locator('.guided-equipment-card')).toContainText('40FT Open Top');
  await expect(page.locator('.guided-job-summary')).toContainText('40FT Open Top');
});
