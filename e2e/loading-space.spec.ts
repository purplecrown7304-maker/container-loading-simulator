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


test('existing 3D fallback keeps the product workflow usable when Unity is unavailable', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/unity-viewer/build-config.json', route => route.fulfill({ status: 404, body: 'unavailable' }));
  await page.goto('/');
  await page.getByRole('button', { name: '기존 3D 보기', exact: true }).click();
  await expect(page.locator('.space-preview canvas')).toBeVisible();
  await page.getByRole('button', { name: '내부 공간 보기', exact: true }).click();
  await expect(page.getByRole('button', { name: '장비 모델 보기', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await advanceToStrategy(page, 'SPACE-CHECK');
  await page.getByRole('radio', { name: /무게중심·안정성 우선형/ }).click();
  await page.getByRole('button', { name: /선택 완료 · 다음: 자동 적재/ }).click();
  await page.getByRole('button', { name: '기존 3D 보기', exact: true }).click();
  await page.getByRole('button', { name: /최종 적재 진행/ }).click();
  await expect(page.locator('.loading-space-summary')).toContainText('적재 규칙 검사 통과', { timeout: 60_000 });
  await expect(page.locator('.loading-space-toolbar')).toContainText('3 / 3 EA');
  await page.getByRole('button', { name: '외벽 숨기기', exact: true }).click();
  await expect(page.getByRole('button', { name: '외벽 표시', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('slider', { name: '높이 단면' }).fill('50');
  await expect(page.locator('.loading-space-toolbar output')).toContainText('m 아래');
  await expect(page.locator('.guided-bottom-bar').getByRole('button', { name: /^결과 확인/ })).toBeEnabled({ timeout: 60_000 });
  await expect(page.locator('.reference-3d canvas')).toBeVisible();
  await page.screenshot({ path: `../loaded-space-${test.info().project.name}.png`, fullPage: true });
  expect(errors).toEqual([]);
});
