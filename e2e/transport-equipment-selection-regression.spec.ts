import { expect, test } from '@playwright/test';

async function selectedEquipmentId(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('container-loading:transport-equipment-v1');
    return raw ? JSON.parse(raw).id as string : '';
  });
}

test('explicit equipment choice persists, closes selector, and updates the guided name label', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');

  const openSelector = page.getByRole('button', { name: '컨테이너 및 트럭 장비 선택' });
  await openSelector.click();
  let dialog = page.getByRole('dialog', { name: '컨테이너 및 트럭 유형' });
  await dialog.getByRole('button', { name: /20' STANDARD/ }).click();

  await expect(dialog).toBeHidden();
  await page.waitForTimeout(2600);
  await expect.poll(() => selectedEquipmentId(page)).toBe('20-standard');
  await expect(openSelector).toContainText('20FT Standard');
  await expect(page.locator('.guided-equipment-type-label')).toHaveText("20' STANDARD");

  await openSelector.click();
  dialog = page.getByRole('dialog', { name: '컨테이너 및 트럭 유형' });
  await dialog.getByRole('button', { name: /45' HIGH-CUBE/ }).click();

  await expect(dialog).toBeHidden();
  await page.waitForTimeout(2600);
  await expect.poll(() => selectedEquipmentId(page)).toBe('45-high-cube');
  await expect(openSelector).toContainText('45FT High Cube');
  await expect(page.locator('.guided-equipment-type-label')).toHaveText("45' HIGH-CUBE");
});
