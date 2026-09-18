import { expect, test } from '@playwright/test';

test('registered stacking updates without reload and bulk packaging advances before loading', async ({ page, context, baseURL }) => {
  test.setTimeout(240_000);
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(30_000);
  const appOrigin = new URL(baseURL!).origin;
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === appOrigin) return route.continue();
    if (route.request().method() === 'GET' && url.href.startsWith('https://cdn.jsdelivr.net/gh/lojjic/unicode-font-resolver@v1.0.1/packages/data/')) return route.continue({ headers: { accept: '*/*' } });
    return route.abort('blockedbyclient');
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '적재공간 선택' })).toBeVisible();
  // Synthetic account data lives only in this isolated browser; all external data services are blocked.
  await page.evaluate(() => {
    const operator = { id: 'stack-regression', name: '적층 테스트' };
    sessionStorage.setItem('container-loading-local-operator-v1', JSON.stringify(operator));
    const quantities = [1000, 2000, 3000, 4000, 50000, 50000];
    const sizes = [[0.055, 0.03, 0.04], [0.055, 0.03, 0.05], [0.055, 0.03, 0.05], [0.03, 0.06, 0.05], [0.031, 0.06, 0.05], [0.032, 0.06, 0.05]];
    const products = quantities.map((quantity, i) => ({ id: `STACK-${i + 1}`, name: `적층 제품 ${i + 1}`, length: sizes[i][0], width: sizes[i][1], height: sizes[i][2], weightKg: 0.1, quantity, requiresBoxPackaging: true }));
    const box = { id: 'REC-235X130X265', name: '범용 등록 박스', innerLength: 0.227, innerWidth: 0.122, innerHeight: 0.257, outerLength: 0.235, outerWidth: 0.13, outerHeight: 0.265, tareWeightKg: 0.6, maxGrossWeightKg: 22, maxTopLoadKg: 0, recommendationRegistration: 'explicit' };
    localStorage.setItem('container-loading-product-packaging-v1:stack-regression', JSON.stringify({ container: { length: 5.9, width: 2.352, height: 2.395, maxPayloadKg: 28130 }, products, boxes: [box], settings: { allowCustom: false } }));
    localStorage.setItem('container-loading-user-box-catalog-v1:stack-regression', JSON.stringify([{ id: box.id, name: box.name, length: box.outerLength, width: box.outerWidth, height: box.outerHeight, weightKg: 22, quantity: 0, maxStackLayers: 1, maxTopLoadKg: 100, catalogOrigin: 'recommendation', recommendationRegistration: 'explicit' }]));
    window.dispatchEvent(new CustomEvent('container-loading:local-operator-updated', { detail: operator }));
  });
  await page.getByRole('button', { name: /적재공간 다시 선택$/ }).click();
  await page.getByRole('dialog', { name: '컨테이너 및 트럭 유형' }).locator('[data-equipment-id="20-standard"]').click();
  await page.getByRole('button', { name: /다음: 제품 선택/ }).click();
  await page.getByPlaceholder('제품명 또는 제품코드 검색').fill('STACK-');
  const quantities = [1000, 2000, 3000, 4000, 50000, 50000];
  for (let i = 0; i < quantities.length; i++) await page.locator('.guided-product-table article').filter({ hasText: `STACK-${i + 1}` }).locator('input[type="number"]').fill(String(quantities[i]));
  await page.getByRole('button', { name: /다음: 제품 포장/ }).click();
  await expect(page.getByText('자동 적재 최대 1단', { exact: false })).toHaveCount(6);
  await expect(page.locator('.product-packaging-preview-head')).toContainText('1,562');

  await page.getByRole('button', { name: /메뉴$/ }).click();
  await page.getByRole('button', { name: /박스 관리/ }).click();
  const modal = page.locator('.box-selector-modal');
  await modal.locator('tbody tr').filter({ hasText: 'REC-235X130X265' }).getByRole('button', { name: '수정', exact: true }).click();
  await modal.getByLabel('최대적층단', { exact: true }).fill('10');
  await modal.getByRole('button', { name: '저장', exact: true }).click();
  await modal.getByRole('button', { name: '닫기', exact: true }).click();
  // 265 mm cartons fit at most nine layers inside this 20 FT container.
  await expect(page.getByText('자동 적재 최대 9단', { exact: false })).toHaveCount(6);
  await page.getByRole('button', { name: /포장 확정 · 다음: 적재 방식 선택/ }).click({ timeout: 10_000 });
  await expect(page.getByRole('heading', { name: '적재 방식 선택' })).toBeVisible({ timeout: 5000 });
  const prepared = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('container-loading-simulator-v1')!);
    const latest = (window as any).__containerLoadingLatestResult;
    return { cargo: saved.cargo, placed: latest.result.placements.length, remaining: latest.result.remaining.length };
  });
  expect(prepared.cargo.reduce((sum: number, item: any) => sum + item.quantity, 0)).toBe(1562);
  expect(prepared.cargo.every((item: any) => item.maxStackLayers === 9 && item.maxTopLoadKg === 100 && item.boxId === 'REC-235X130X265')).toBe(true);
  expect(prepared.placed).toBe(0);
  expect(prepared.remaining).toBe(0);
  console.log('bulk packaging confirmed: 1562 cartons, 9 layers, no hidden loading');

  await page.getByRole('radio', { name: /공간효율·적재량 우선형/ }).click();
  await page.getByRole('button', { name: /선택 완료 · 다음: 자동 적재/ }).click();
  const workerStarted = page.waitForEvent('worker', { predicate: worker => /loading\.worker-/.test(worker.url()), timeout: 15_000 });
  await page.getByRole('button', { name: /최종 적재 진행/ }).click();
  await workerStarted;
  console.log('bulk packing worker started');
  await expect(page.locator('.guided-primary-cta')).toContainText('검사 중');
  // UI actions remain usable while the real packing worker is calculating.
  await page.getByRole('button', { name: /메뉴$/ }).click({ timeout: 5000 });
  await expect(page.getByRole('navigation', { name: '적재 작업 전체 메뉴' })).toBeVisible();
  await page.getByRole('button', { name: /메뉴$/ }).click();
  console.log('bulk packing UI remains responsive');
  await expect.poll(async () => page.evaluate(() => (window as any).__containerLoadingLatestResult?.result.placements.length ?? 0), { timeout: 180_000 }).toBeGreaterThan(452);
  const loaded = await page.evaluate(() => {
    const { result, cargo } = (window as any).__containerLoadingLatestResult;
    return { count: result.placements.length, left: result.remaining.reduce((sum: number, item: any) => sum + item.quantity, 0), maxZ: Math.max(...result.placements.map((item: any) => item.z)), issues: result.validationIssues, cargo };
  });
  expect(loaded.count + loaded.left).toBe(1562);
  expect(loaded.maxZ).toBeGreaterThan(0.265);
  expect(loaded.issues).toEqual([]);
  console.log('bulk stacking result', { count: loaded.count, remaining: loaded.left, maxZ: loaded.maxZ });
  await expect(page.locator('.guided-bottom-bar').getByRole('button', { name: /^결과 확인/ })).toBeEnabled({ timeout: 120_000 });
  await page.locator('.guided-bottom-bar').getByRole('button', { name: /^결과 확인/ }).click();
  await expect(page.getByRole('heading', { name: '결과 확인' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__containerLoadingLatestResult.result.placements.length)).toBe(loaded.count);
  await page.screenshot({ path: test.info().outputPath('registered-stacking.png'), fullPage: true });
});
