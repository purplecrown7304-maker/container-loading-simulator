import { expect, test } from '@playwright/test';

test('different carton footprints share a supported pallet from confirmed packaging to Unity and work order', async ({ page, context, baseURL }) => {
  test.setTimeout(180000);
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL!).origin ? route.continue() : route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '적재공간 선택' })).toBeVisible();
  // Synthetic guest catalog only; calculated packaging and loading results are never injected.
  await page.evaluate(() => {
    localStorage.setItem('container-loading-product-packaging-v1:guest', JSON.stringify({
      container: { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 },
      products: [
        { id: 'SURFACE-W', name: '합성 넓은 제품', length: .58, width: .58, height: .18, weightKg: 19.8, quantity: 1, requiresBoxPackaging: true },
        { id: 'SURFACE-N', name: '합성 작은 제품', length: .38, width: .38, height: .18, weightKg: 9.8, quantity: 1, requiresBoxPackaging: true },
      ],
      boxes: [
        { id: 'SURFACE-BOX-W', name: '넓은 박스', innerLength: .592, innerWidth: .592, innerHeight: .192, outerLength: .6, outerWidth: .6, outerHeight: .2, tareWeightKg: .2, maxGrossWeightKg: 30, maxTopLoadKg: 1000, maxStackLayers: 10 },
        { id: 'SURFACE-BOX-N', name: '작은 박스', innerLength: .392, innerWidth: .392, innerHeight: .192, outerLength: .4, outerWidth: .4, outerHeight: .2, tareWeightKg: .2, maxGrossWeightKg: 30, maxTopLoadKg: 1000, maxStackLayers: 10 },
      ], settings: { allowCustom: false },
    }));
  });
  await page.getByRole('button', { name: /다음: 제품 선택/ }).click();
  await page.getByPlaceholder('제품명 또는 제품코드 검색').fill('SURFACE-');
  for (const id of ['W', 'N']) await page.locator('.guided-product-table article').filter({ hasText: `SURFACE-${id}` }).locator('input[type="number"]').fill('1');
  await page.getByRole('button', { name: /다음: 제품 포장/ }).click();
  await expect(page.getByText('포장안 준비 완료')).toBeVisible();
  await page.getByRole('button', { name: /포장 확정 · 다음: 적재 방식 선택/ }).click();
  const confirmed = await page.evaluate(() => JSON.parse(localStorage.getItem('container-loading-simulator-v1')!).cargo);
  expect(confirmed.reduce((sum: number, row: any) => sum + row.quantity, 0)).toBe(2);
  expect(confirmed.map((row: any) => row.length).sort()).toEqual([.4, .6]);
  await page.getByRole('radio', { name: /파렛트 적재/ }).click();
  await page.getByRole('radio', { name: /공간효율·적재량 우선형/ }).click();
  await page.getByRole('button', { name: /선택 완료 · 다음: 자동 적재/ }).click();
  const readResult = () => page.evaluate(() => {
    const result = (window as any).__containerLoadingPalletSnapshot?.result;
    return result && { count: result.placements.length, remaining: result.remaining.reduce((sum: number, row: any) => sum + row.quantity, 0), pallets: result.palletCount, upper: result.placements.some((row: any) => row.z > .15 + 1e-6) };
  });
  await expect.poll(readResult).toEqual({ count: 2, remaining: 0, pallets: 1, upper: true });
  await expect(page.locator('.pallet-preview>.unity-viewer')).toHaveAttribute('data-unity-applied', 'true', { timeout: 90000 });
  await expect(page.locator('.pallet-preview>.unity-viewer')).toHaveAttribute('data-unity-supports', '1');
  await expect(page.locator('.pallet-preview>.unity-viewer')).toHaveAttribute('data-unity-count', '2');
  await page.getByRole('button', { name: /최종 적재 진행/ }).click();
  await expect(page.locator('.guided-bottom-bar').getByRole('button', { name: /^결과 확인/ })).toBeEnabled({ timeout: 120000 });
  expect(await readResult()).toEqual({ count: 2, remaining: 0, pallets: 1, upper: true });
  const final = await page.evaluate(() => (window as any).__containerLoadingPalletSnapshot.result);
  for (const item of confirmed) expect(final.placements.filter((p: any) => p.cargoId === item.id).length + final.remaining.filter((r: any) => r.cargoId === item.id).reduce((sum: number, r: any) => sum + r.quantity, 0)).toBe(item.quantity);
  expect(new Set(final.placements.map((p: any) => [p.cargoId, p.x, p.y, p.z].join('|'))).size).toBe(final.placements.length);
  // Successful pallet certification opens the normal result dialog over the guided navigation.
  await page.getByRole('button', { name: '결과창 닫기', exact: true }).click();
  // Keep the certified pallet viewer mounted; the separate guided step-6 reset is recorded as an outstanding issue.
  await page.getByRole('button', { name: /메뉴$/ }).click();
  const reportPromise = page.waitForEvent('popup');
  await page.getByRole('navigation', { name: '적재 작업 전체 메뉴' }).getByRole('button', { name: /작업지시서 보기/ }).click();
  const report = await reportPromise;
  await expect(report.getByRole('heading', { name: /팔레트 적재 작업지시서/ })).toBeVisible();
  await expect(report.locator('section.summary').getByText('2 EA', { exact: true })).toBeVisible();
  await expect(report.locator('section.summary').getByText('1 EA', { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('mixed-surface-result.png'), fullPage: true });
});
