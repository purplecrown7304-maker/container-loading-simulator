import { expect, test } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });
test('an oversized shipment finishes with actionable reasons and no shipping certification', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('container-loading-product-packaging-v1:guest', JSON.stringify({
      container: { length: 12.03, width: 2.35, height: 2.7, maxPayloadKg: 28000 },
      products: [{ id: 'OVERSIZE-E2E', name: '초대형 설비', length: 15, width: 3, height: 3, weightKg: 100, quantity: 1, requiresBoxPackaging: false }],
      boxes: [], settings: { allowCustom: false },
    }));
  });
  await page.getByRole('button', { name: /다음: 제품 선택/ }).click();
  await page.getByPlaceholder('제품명 또는 제품코드 검색').fill('OVERSIZE-E2E');
  await page.locator('.guided-product-table article').filter({ hasText: 'OVERSIZE-E2E' }).locator('input[type="number"]').fill('1');
  await page.getByRole('button', { name: /다음: 제품 포장/ }).click();
  await expect(page.getByText('포장안 준비 완료')).toBeVisible();
  await page.getByRole('button', { name: /포장 확정 · 다음: 적재 방식 선택/ }).click();
  await page.getByRole('radio', { name: /공간효율·적재량 우선형/ }).click();
  await page.getByRole('button', { name: /선택 완료 · 다음: 자동 적재/ }).click();
  await page.getByRole('button', { name: /최종 적재 진행/ }).click();
  const result = page.locator('.guided-bottom-bar').getByRole('button', { name: /^결과 확인/ });
  await expect(result).toBeEnabled({ timeout: 30_000 });
  await result.click();
  await expect(page.locator('.guided-unloaded-list')).toContainText('크기가');
  await expect(page.locator('.guided-unloaded-list')).toContainText('1 EA');
  await expect(page.locator('.guided-bottom-bar .guided-primary-cta')).toBeDisabled();
  await expect(page.locator('.guided-status-row')).not.toContainText('작업 가능');
});
