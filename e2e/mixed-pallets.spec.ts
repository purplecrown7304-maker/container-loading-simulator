import { expect, test } from '@playwright/test';
test('mixed pallets remain two-tier through real workflow certification', async ({ page, context, baseURL }) => {
  test.setTimeout(180000);
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL!).origin ? route.continue() : route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '적재공간 선택' })).toBeVisible();
  await page.evaluate(() => {
    localStorage.setItem('container-loading-product-packaging-v1:guest', JSON.stringify({
      container: { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 },
      products: ['A','B','C'].map(id => ({ id: `MIX-${id}`, name: `혼합 화물 ${id}`, length: .5, width: .5, height: .3, weightKg: 20, quantity: 2, requiresBoxPackaging: true })),
      boxes: [{ id: 'MIX-BOX', name: '혼합용 박스', innerLength: .51, innerWidth: .51, innerHeight: .31, outerLength: .55, outerWidth: .55, outerHeight: .35, tareWeightKg: .2, maxGrossWeightKg: 30, maxTopLoadKg: 500, maxStackLayers: 1 }], settings: { allowCustom: false },
    }));
  });
  await page.getByRole('button', { name: /다음: 제품 선택/ }).click();
  await page.getByPlaceholder('제품명 또는 제품코드 검색').fill('MIX-');
  for (const id of ['A','B','C']) await page.locator('.guided-product-table article').filter({ hasText: `MIX-${id}` }).locator('input[type="number"]').fill('2');
  await page.getByRole('button', { name: /다음: 제품 포장/ }).click();
  await expect(page.getByText('포장안 준비 완료')).toBeVisible();
  await page.getByRole('button', { name: /포장 확정 · 다음: 적재 방식 선택/ }).click();
  await page.getByRole('radio', { name: /파렛트 적재/ }).click();
  await page.getByRole('radio', { name: /공간효율·적재량 우선형/ }).click();
  await page.getByRole('button', { name: /선택 완료 · 다음: 자동 적재/ }).click();
  const snapshot = () => page.evaluate(() => {
    const result = (window as any).__containerLoadingPalletSnapshot?.result;
    return result && { count: result.placements.length, pallets: result.palletCount, tiers: result.maxUsedStackLevel, mixed: result.pallets.some((p: any) => new Set(p.cargoPlacements.map((b: any) => b.cargoId)).size > 1) };
  });
  await expect.poll(snapshot).toEqual({ count: 6, pallets: 2, tiers: 2, mixed: true });
  await expect(page.locator('.pallet-preview>.unity-viewer')).toHaveAttribute('data-unity-supports', '2', { timeout: 90000 });
  await page.getByRole('button', { name: /최종 적재 진행/ }).click();
  await expect(page.locator('.guided-bottom-bar').getByRole('button', { name: /^결과 확인/ })).toBeEnabled({ timeout: 120000 });
  expect(await snapshot()).toEqual({ count: 6, pallets: 2, tiers: 2, mixed: true });
});
