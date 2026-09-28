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
  // A completed result must survive ordinary result/viewer navigation unchanged.
  const verifiedState = () => page.evaluate(() => JSON.stringify({
    plan: (window as any).__containerLoadingPalletSnapshot,
    signature: (window as any).__containerLoadingLatestCertification?.targetSignature,
  }));
  const beforeNavigation = await verifiedState();
  if (await page.getByRole('button', { name: '결과창 닫기' }).isVisible()) await page.getByRole('button', { name: '결과창 닫기' }).click();
  await page.locator('.guided-bottom-bar').getByRole('button', { name: /^결과 확인/ }).click();
  await expect(page.getByRole('heading', { name: '결과 확인', exact: true })).toBeVisible();
  await expect(page.locator('.dashboard-card.viewer-card')).toBeHidden();
  await expect(page.locator('.guided-result-grid.enhanced')).toBeVisible();
  await expect(page.locator('.guided-result-grid.enhanced > div').filter({ hasText: /^적재/ })).toContainText('6 EA');
  expect(await verifiedState()).toBe(beforeNavigation);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.getByRole('button', { name: '이전 단계', exact: true }).click();
  await expect(page.locator('.dashboard-card.viewer-card')).toBeVisible();
  await expect(page.locator('.guided-bottom-bar').getByRole('button', { name: /^결과 확인/ })).toBeEnabled();
  expect(await verifiedState()).toBe(beforeNavigation);
  await page.locator('.guided-bottom-bar').getByRole('button', { name: /^결과 확인/ }).click();
  await expect(page.getByRole('heading', { name: '결과 확인', exact: true })).toBeVisible();
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: /통합 출하·적재 작업지시서 보기/ }).click();
  const report = await popupPromise;
  await expect(report.getByRole('heading', { name: '팔레트 적재 작업지시서', exact: true })).toBeVisible();
  await expect(report.getByRole('region', { name: '팔레트 적재 요약' })).toContainText('6 EA');
  await expect(report.getByRole('region', { name: '팔레트 적재 요약' })).toContainText(/팔레트\s*2 EA/);
  expect(await verifiedState()).toBe(beforeNavigation);
  await report.close();

  // An actual equipment change must still discard the prior certification.
  await page.locator('.guided-step-list button').filter({ hasText: '적재공간' }).click();
  await page.locator('.equipment-icon-grid [data-equipment-id="20-standard"]').click();
  await expect.poll(() => page.evaluate(() => Boolean((window as any).__containerLoadingLatestCertification))).toBe(false);
});
