import { expect, test } from '@playwright/test';

async function registerDirectProduct(page: import('@playwright/test').Page, id: string) {
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('container-loading:open-product-tool', { detail: 'products' }));
  });
  const dialog = page.getByRole('dialog', { name: '회사 제품 관리' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('제품코드').fill(id);
  await dialog.getByLabel('제품명').fill('가이드 스모크 제품');
  await dialog.getByLabel('길이 mm').fill('200');
  await dialog.getByLabel('폭 mm').fill('150');
  await dialog.getByLabel('높이 mm').fill('100');
  await dialog.getByLabel('중량 kg').fill('1');
  await dialog.getByLabel('박스 적재').selectOption('no');
  await dialog.getByRole('button', { name: '제품 등록' }).click();
  await dialog.locator('header button').click();
}

async function advanceToStrategy(page: import('@playwright/test').Page, id: string) {
  await registerDirectProduct(page, id);
  await page.getByRole('button', { name: /다음: 제품 선택/ }).click();
  await page.getByPlaceholder('제품명 또는 제품코드 검색').fill(id);
  await page.locator('.guided-product-table article').filter({ hasText: id }).locator('input[type="number"]').fill('3');
  await page.getByRole('button', { name: /다음: 제품 포장/ }).click();
  await expect(page.getByText('포장안 준비 완료')).toBeVisible();
  await page.getByRole('button', { name: /포장 확정 · 다음: 적재 방식 선택/ }).click();
}


test('Unity failure offers retry while the fixed-height product workflow remains usable', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/unity-viewer/build-config.json', route => route.fulfill({ status: 404, body: 'unavailable' }));
  await page.goto('/');
  await expect(page.locator('iframe')).toHaveCount(0);
  await advanceToStrategy(page, 'SPACE-CHECK');
  await page.getByRole('radio', { name: /무게중심·안정성 우선형/ }).click();
  await page.getByRole('button', { name: /선택 완료 · 다음: 자동 적재/ }).click();
  await expect(page.getByRole('button', { name: 'Unity 다시 시도', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /기존 3D/ })).toHaveCount(0);
  await page.unroute('**/unity-viewer/build-config.json');
  await page.getByRole('button', { name: 'Unity 다시 시도', exact: true }).click();
  await expect(page.locator('.unity-viewer')).toHaveAttribute('data-unity-ready', 'true', { timeout: 100_000 });
  await page.getByRole('button', { name: /최종 적재 진행/ }).click();
  await expect(page.locator('.unity-summary')).toContainText('3 EA', { timeout: 60_000 });
  await expect(page.locator('.guided-bottom-bar').getByRole('button', { name: /^결과 확인/ })).toBeEnabled({ timeout: 60_000 });
  await expect(page.locator('.unity-viewer')).toHaveAttribute('data-unity-applied', 'true');
  await expect(page.locator('.reference-3d canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});
