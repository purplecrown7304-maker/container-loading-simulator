import { expect, test, type Page } from '@playwright/test';

const STORAGE_KEY = 'container-loading-simulator-v1';
const container = { length: 12.032, width: 2.35, height: 2.7, maxPayloadKg: 28600, floorLoadLimitKgPerM2: 1500, floorLoadWarningMultiplier: 3 };

async function seedCargo(page: Page) {
  await page.addInitScript(({ key, containerSpec }) => {
    if (sessionStorage.getItem('ux3-e2e-seeded') === '1') return;
    localStorage.clear();
    localStorage.setItem(key, JSON.stringify({
      container: containerSpec,
      cargo: [{ id: 'KEEP-A', name: 'Keep A', length: 0.5, width: 0.4, height: 0.3, weightKg: 10, quantity: 3, maxStackLayers: 7, allowRotation: true }],
    }));
    sessionStorage.setItem('ux3-e2e-seeded', '1');
  }, { key: STORAGE_KEY, containerSpec: container });
}

test('selecting a different container preserves the current cargo list', async ({ page }) => {
  await seedCargo(page);
  await page.goto('/');

  await page.getByRole('button', { name: /20' STANDARD/ }).click();
  await expect(page.locator('.ux3-current-job')).toContainText('20FT Standard');

  await page.getByRole('button', { name: '화물 선택으로' }).click();
  await expect(page.getByText('KEEP-A · Keep A')).toBeVisible();
  await expect(page.getByLabel('KEEP-A 적재 수량')).toHaveValue('3');
});

test('truck tab exposes road equipment and custom values can be applied', async ({ page }) => {
  await seedCargo(page);
  await page.goto('/');
  await page.getByRole('button', { name: '트럭', exact: true }).click();

  await expect(page.getByRole('button', { name: /TAUTLINER/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /REFRIGERATED TRUCK/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /MEGA-TRAILER/ })).toBeVisible();

  await page.getByText('사용자 규격 직접 입력').click();
  await page.getByLabel('내부 길이(m)').fill('9.70');
  await page.getByLabel('내부 폭(m)').fill('2.44');
  await page.getByLabel('내부 높이(m)').fill('2.55');
  await page.getByLabel('최대 적재중량(kg)').fill('14500');
  await page.getByLabel('바닥 허용하중(kg/m²)').fill('1650');
  await page.getByRole('button', { name: '사용자 규격 적용' }).click();
  await expect(page.locator('.ux3-current-job')).toContainText('Custom Truck');
});

test('selected equipment persists after reload', async ({ page }) => {
  await seedCargo(page);
  await page.goto('/');
  await page.getByRole('button', { name: /40' OPEN TOP/ }).click();
  await expect(page.locator('.ux3-current-job')).toContainText('40FT Open Top');

  await page.reload();
  await expect(page.locator('.ux3-current-job')).toContainText('40FT Open Top');
  await expect(page.getByRole('button', { name: /40' OPEN TOP/ })).toHaveClass(/active/);
});
