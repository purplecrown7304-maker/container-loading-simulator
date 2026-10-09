import { openWorkspace } from './helpers/workspace';
import { expect, test, type Page } from '@playwright/test';

async function openEquipment(page: Page) {
  // Detailed specifications stay available beside the direct icon picker.
  await openWorkspace(page, 1);
  const selector = page.getByRole('button', { name: '선택한 장비 변경', exact: true });
  await expect(selector).toBeVisible();
  await selector.click();
  const dialog = page.getByRole('dialog', { name: '컨테이너 및 트럭 유형' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function expectSelectedEquipment(page: Page, shortName: string) {
  await expect(page.getByRole('button', { name: '선택한 장비 변경', exact: true })).toContainText(shortName);
}

test('guided equipment selector changes the current container in place', async ({ page }) => {
  await page.goto('/');
  const dialog = await openEquipment(page);
  await dialog.locator('.transport-equipment-card[data-equipment-id="20-standard"]').click();
  await expect(dialog).toHaveCount(0);
  await expectSelectedEquipment(page, '20FT Standard');
  await expect(page.locator('.equipment-selected-strip')).toContainText('5,900 mm');
  // Reopening must work after a selection and show the currently active equipment.
  const reopened = await openEquipment(page);
  await expect(reopened.locator('.transport-equipment-card[data-equipment-id="20-standard"]')).toHaveClass(/active/);
  await reopened.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(reopened).toHaveCount(0);
});

test('truck category selects a domestic one-ton body without leaving the guided workflow', async ({ page }) => {
  await page.goto('/');
  await openWorkspace(page, 1);
  await page.getByRole('button', { name: '트럭', exact: true }).click();
  await expect(page.locator('.equipment-icon-option')).toHaveCount(7);
  await expect(page.locator('[data-equipment-id="tautliner"]')).toHaveCount(0);
  const small = page.locator('.equipment-icon-option[data-equipment-id="kr-1t-box"]');
  await expect(small.locator('.truck-card-photo')).toHaveAttribute('data-thumbnail-state', 'ready', { timeout: 60_000 });
  await expect(small.getByRole('img')).toHaveAttribute('src', /^data:image\/png/);
  await page.screenshot({ path: test.info().outputPath('domestic-truck-catalog.png'), fullPage: true });
  await small.click();
  await expectSelectedEquipment(page, '1톤 내장탑');
  await expect(page.locator('.equipment-selected-strip')).toContainText('2,830 mm');
  await expect(page.locator('.equipment-selected-strip')).toContainText('1,000 kg');
  await expect(page.getByRole('heading', { name: '적재공간 선택' })).toBeVisible();
});

test('large-body reference cannot load until actual payload and floor rating are registered', async ({ page }) => {
  await page.goto('/');
  await openWorkspace(page, 1);
  await page.getByRole('button', { name: '트럭', exact: true }).click();
  const large = page.locator('.equipment-icon-option[data-equipment-id="custom-heavy-truck"]');
  await expect(large).toContainText('실차 등록 필요');
  await large.click();
  const dialog = page.getByRole('dialog', { name: '컨테이너 및 트럭 유형' });
  await expect(dialog.getByLabel('최대 적재중량(kg)')).toHaveValue('0');
  await dialog.getByRole('button', { name: '사용자 규격 적용' }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('status')).toContainText('0보다 크게');
  await dialog.getByLabel('최대 적재중량(kg)').fill('11000');
  await dialog.getByLabel('바닥 허용하중(kg/m²)').fill('1000');
  await dialog.getByRole('button', { name: '사용자 규격 적용' }).click();
  await expect(dialog).toHaveCount(0);
  await expectSelectedEquipment(page, '대형 실차 등록');
  await expect(page.locator('.equipment-selected-strip')).toContainText('11,000 kg');
  await expect(page.locator('.viewer-host .three-comparison-viewer')).toHaveAttribute('data-three-vehicle-rig', 'multi-axle-rigid');
});

test('custom truck dimensions can be applied from the current selector', async ({ page }) => {
  await page.goto('/');
  await openWorkspace(page, 1);
  await page.getByRole('button', { name: '트럭', exact: true }).click();
  await page.locator('.equipment-icon-option[data-equipment-id="custom-truck"]').click();
  const dialog = page.getByRole('dialog', { name: '컨테이너 및 트럭 유형' });
  await dialog.locator('.transport-equipment-card[data-equipment-id="custom-truck"]').click();
  await dialog.getByLabel('내부 길이(m)').fill('10.5');
  await dialog.getByLabel('내부 폭(m)').fill('2.4');
  await dialog.getByLabel('내부 높이(m)').fill('2.6');
  await dialog.getByLabel('최대 적재중량(kg)').fill('12000');
  await dialog.getByLabel('바닥 허용하중(kg/m²)').fill('1800');
  await dialog.getByRole('button', { name: '사용자 규격 적용' }).click();
  await expect(dialog).toHaveCount(0);
  await expectSelectedEquipment(page, 'Custom Truck');
  await expect(page.locator('.equipment-selected-strip')).toContainText('10,500 mm');
  await expect(page.locator('.equipment-selected-strip')).toContainText('12,000 kg');
});

test('specialized tank equipment remains selectable but explicitly identifiable', async ({ page }) => {
  await page.goto('/');
  const dialog = await openEquipment(page);
  const tank = dialog.locator('.transport-equipment-card[data-equipment-id="20-tank"]');
  await expect(tank).toContainText("20' TANK");
  await tank.click();
  await expect(dialog).toHaveCount(0);
  await expectSelectedEquipment(page, '20FT Tank');
  await expect(page.getByRole('button', { name: /다음: 제품 선택/ })).toBeEnabled();
});
