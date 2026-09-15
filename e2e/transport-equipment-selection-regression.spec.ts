import { expect, test } from '@playwright/test';

async function selectedEquipmentId(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('container-loading:transport-equipment-v1');
    return raw ? JSON.parse(raw).id as string : '';
  });
}

test('explicit equipment choice never reverts to the previous 40ft high cube', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');

  const openSelector = page.getByRole('button', { name: '컨테이너 및 트럭 장비 선택' });
  await openSelector.click();
  let dialog = page.getByRole('dialog', { name: '컨테이너 및 트럭 유형' });
  await dialog.getByRole('button', { name: /20' STANDARD/ }).click();

  // The old SafetyGuard kept a 2s acceptance window and could restore the old
  // 40FT High Cube after the click looked successful. Wait past that window.
  await page.waitForTimeout(2600);
  await expect.poll(() => selectedEquipmentId(page)).toBe('20-standard');
  await expect(openSelector).toContainText('20FT Standard');

  await openSelector.click();
  dialog = page.getByRole('dialog', { name: '컨테이너 및 트럭 유형' });
  await dialog.getByRole('button', { name: /45' HIGH-CUBE/ }).click();

  await page.waitForTimeout(2600);
  await expect.poll(() => selectedEquipmentId(page)).toBe('45-high-cube');
  await expect(openSelector).toContainText('45FT High Cube');
});
