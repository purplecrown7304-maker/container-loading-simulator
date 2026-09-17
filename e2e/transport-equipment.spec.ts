import { expect, test } from '@playwright/test';

async function openEquipment(page: import('@playwright/test').Page) {
  await page.locator('.guided-stage-panel:visible .guided-equipment-card.selected').click();
  const dialog = page.getByRole('dialog', { name: '컨테이너 및 트럭 유형' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('guided equipment selector changes the current container in place', async ({ page }) => {
  await page.goto('/');
  const dialog = await openEquipment(page);
  await dialog.locator('.transport-equipment-card[data-equipment-id="20-standard"]').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.guided-equipment-card.selected')).toContainText('20FT Standard');
  await expect(page.locator('.guided-equipment-specs')).toContainText('5,900 mm');
});

test('truck category can select a Tautliner without leaving the guided workflow', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '트럭', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '컨테이너 및 트럭 유형' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.transport-equipment-card[data-category="truck"]')).toHaveCount(6);
  await dialog.locator('.transport-equipment-card[data-equipment-id="tautliner"]').click();
  await expect(page.locator('.guided-equipment-card.selected')).toContainText('Tautliner / Curtainsider');
  await expect(page.getByRole('heading', { name: '적재공간 선택' })).toBeVisible();
});

test('custom truck dimensions can be applied from the current selector', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '트럭', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '컨테이너 및 트럭 유형' });
  await dialog.locator('.transport-equipment-card[data-equipment-id="custom-truck"]').click();
  await dialog.getByLabel('내부 길이(m)').fill('10.5');
  await dialog.getByLabel('내부 폭(m)').fill('2.4');
  await dialog.getByLabel('내부 높이(m)').fill('2.6');
  await dialog.getByLabel('최대 적재중량(kg)').fill('12000');
  await dialog.getByLabel('바닥 허용하중(kg/m²)').fill('1800');
  await dialog.getByRole('button', { name: '사용자 규격 적용' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.guided-equipment-card.selected')).toContainText('Custom Truck');
  await expect(page.locator('.guided-equipment-specs')).toContainText('10,500 mm');
  await expect(page.locator('.guided-equipment-specs')).toContainText('12,000 kg');
});

test('specialized tank equipment remains selectable but explicitly identifiable', async ({ page }) => {
  await page.goto('/');
  const dialog = await openEquipment(page);
  const tank = dialog.locator('.transport-equipment-card[data-equipment-id="20-tank"]');
  await expect(tank).toContainText("20' TANK");
  await tank.click();
  await expect(page.locator('.guided-equipment-card.selected')).toContainText('20FT Tank');
  await expect(page.getByRole('button', { name: /다음: 제품 선택/ })).toBeEnabled();
});
