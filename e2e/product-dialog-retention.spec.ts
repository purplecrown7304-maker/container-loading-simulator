import { expect, test } from '@playwright/test';

test('company product draft survives all close paths with keyboard focus and a persistent viewer', async ({ page }) => {
  await page.goto('/');
  const menu = page.locator('.header-menu-button');
  const dialog = page.getByRole('dialog', { name: '회사 제품 관리', exact: true });
  const open = async () => {
    await menu.click();
    await page.locator('.product-menu-company-action').click();
    await expect(dialog).toBeVisible();
  };
  await open();
  const viewer = await page.locator('.viewer-host .three-comparison-viewer').elementHandle();
  const code = dialog.getByRole('textbox', { name: '제품코드', exact: true });
  const name = dialog.getByRole('textbox', { name: '제품명', exact: true });
  await code.fill('UNSAVED-01');
  await name.fill('보존할 제품 입력');
  await dialog.locator('.product-master-form select').selectOption('no');
  await expect(dialog.locator('.product-draft-notice')).toBeVisible();

  for (const method of ['escape', 'outside', 'button']) {
    if (method === 'escape') await page.keyboard.press('Escape');
    else if (method === 'outside') await page.locator('.product-tools-backdrop').click({ position: { x: 2, y: 2 } });
    else await dialog.getByRole('button', { name: '제품 도구 닫기' }).click();
    await expect(dialog).toBeHidden();
    await expect(menu).toBeFocused();
    await open();
    await expect(code).toHaveValue('UNSAVED-01');
    await expect(name).toHaveValue('보존할 제품 입력');
    await expect(dialog.locator('.product-master-form select')).toHaveValue('no');
    expect(await viewer!.evaluate(element => element === document.querySelector('.viewer-host .three-comparison-viewer'))).toBe(true);
  }
  const close = dialog.getByRole('button', { name: '제품 도구 닫기' });
  await close.focus();
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  await page.screenshot({ path: test.info().outputPath('product-dialog-draft.png'), fullPage: true, animations: 'disabled' });
  await dialog.getByRole('button', { name: '제품 등록', exact: true }).click();
  await expect(dialog.locator('.product-draft-notice')).toHaveCount(0);
  await code.fill('UNSAVED-02');
  page.once('dialog', prompt => prompt.dismiss());
  await dialog.locator('.product-master-list article').filter({ hasText: 'UNSAVED-01' }).getByRole('button', { name: '수정', exact: true }).click();
  await expect(code).toHaveValue('UNSAVED-02');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await open();
  await expect(code).toHaveValue('UNSAVED-02');
});
