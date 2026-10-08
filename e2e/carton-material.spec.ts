import { expect, test } from '@playwright/test';

test('box management shows a material estimate, applies it only on request and lists a hidden registered recommendation', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.guided-step-list button')).toHaveCount(6);
  await page.evaluate(() => {
    const operator = { id: 'carton-material-test', name: 'Carton material test' };
    sessionStorage.setItem('container-loading-local-operator-v1', JSON.stringify(operator));
    // A registered recommendation that exists only in the packaging planner (2026-10-08 report).
    localStorage.setItem('container-loading-product-packaging-v1:carton-material-test', JSON.stringify({
      container: { length: 12.032, width: 2.35, height: 2.7, maxPayloadKg: 28600 }, products: [],
      boxes: [{ id: 'REC-235X310X265', name: '범용 추천 235×310×265 (강도확인)', innerLength: .227, innerWidth: .302, innerHeight: .257, outerLength: .235, outerWidth: .31, outerHeight: .265, tareWeightKg: .6, maxGrossWeightKg: 22, maxTopLoadKg: 0, maxStackLayers: 1, recommendationRegistration: 'explicit' }],
    }));
    window.dispatchEvent(new CustomEvent('container-loading:open-workspace', { detail: { tab: 'boxes' } }));
  });
  const modal = page.locator('.box-selector-modal');
  const hidden = modal.locator('.catalog-wrap tbody tr').filter({ hasText: 'REC-235X310X265' });
  await expect(hidden).toHaveCount(1);
  await expect(hidden).toContainText('강도 미확인');

  await hidden.getByRole('button', { name: '수정', exact: true }).click();
  await modal.getByLabel('재질').selectOption('b-flute');
  const estimate = modal.locator('.box-material-estimate');
  await expect(estimate).toContainText('재질 추정 상부 허용하중');
  await expect(estimate).toContainText('시험값이 아니라 대표값 추정');
  // Choosing a material alone does not fill the strength.
  await expect(modal.getByLabel('상부 허용하중(kg)')).toHaveValue('0');
  await estimate.getByRole('button', { name: '추정값 넣기', exact: true }).click();
  const value = Number(await modal.getByLabel('상부 허용하중(kg)').inputValue());
  expect(value).toBeGreaterThan(25);
  expect(value).toBeLessThan(40);
  await modal.getByLabel('최대적층단').fill('');
  await page.screenshot({ path: test.info().outputPath('carton-material-form.png'), fullPage: true, animations: 'disabled' });
  await modal.getByRole('button', { name: '저장', exact: true }).click();
  await expect(hidden).toContainText('B골 단면');
  await expect(hidden).toContainText('재질 추정');
  // The edited value reaches the packaging planner copy used for loading.
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('container-loading-product-packaging-v1:carton-material-test')!).boxes[0].maxTopLoadKg)).toBe(value);
  await page.screenshot({ path: test.info().outputPath('carton-material-list.png'), fullPage: true, animations: 'disabled' });
});
