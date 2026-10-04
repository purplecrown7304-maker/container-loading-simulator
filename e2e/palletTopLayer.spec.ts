import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });

test('sparse top tier moves to a final pallet and diagnostics download a local ZIP', async ({ page, context, baseURL }) => {
  test.setTimeout(180_000);
  const mailRequests: string[] = [];
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  context.on('request', request => {
    if (request.url().includes('container-diagnostic-mail')) mailRequests.push(request.url());
  });
  const appOrigin = new URL(baseURL!).origin;
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === appOrigin) return route.continue();
    if (route.request().method() === 'GET' && url.href.startsWith('https://cdn.jsdelivr.net/gh/lojjic/unicode-font-resolver@v1.0.1/packages/data/')) {
      return route.continue({ headers: { accept: '*/*' } });
    }
    return route.abort('blockedbyclient');
  });
  await page.goto('/');
  await expect(page.locator('.guided-step-list button')).toHaveCount(6);
  await page.evaluate(() => {
    localStorage.setItem('container-loading-product-packaging-v1:guest', JSON.stringify({
      container: { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 },
      products: [{ id: 'E2E-TAIL', name: '최상단 분리 확인 제품', length: .5, width: .5, height: .3, weightKg: 1, quantity: 9, requiresBoxPackaging: true }],
      boxes: [{ id: 'E2E-TAIL-BOX', name: '층당 4개 박스', innerLength: .51, innerWidth: .51, innerHeight: .31, outerLength: .55, outerWidth: .55, outerHeight: .35, tareWeightKg: .2, maxGrossWeightKg: 20, maxTopLoadKg: 100 }],
      settings: { allowCustom: false },
    }));
    window.dispatchEvent(new Event('container-loading:enterprise-packaging-planner-updated'));
  });
  await page.getByRole('button', { name: /다음: 제품 선택/ }).click();
  await page.getByPlaceholder('제품명 또는 제품코드 검색').fill('E2E-TAIL');
  await page.locator('.guided-product-table article').filter({ hasText: 'E2E-TAIL' }).locator('input[type="number"]').fill('9');
  await page.getByRole('button', { name: /다음: 제품 포장/ }).click();
  await expect(page.getByText('포장안 준비 완료')).toBeVisible();
  await page.getByRole('button', { name: /포장 확정 · 다음: 적재 방식 선택/ }).click();
  await page.getByRole('radio', { name: /파렛트 적재/ }).click();
  await page.getByRole('radio', { name: /T11 플라스틱 \(수출용 경량\)/ }).click();
  await page.getByRole('radio', { name: /1번 파일 적재 방식/ }).click();
  await page.getByRole('button', { name: /선택 완료 · 다음: 자동 적재/ }).click();
  await page.getByRole('button', { name: /최종 적재 진행/ }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__containerLoadingPalletSnapshot?.result.palletCount)).toBe(2);
  await expect(page.locator('.viewer-host .three-comparison-viewer')).toHaveAttribute('data-three-applied', 'true', { timeout: 100_000 });
  await expect(page.locator('.viewer-host .three-comparison-viewer')).toHaveAttribute('data-three-supports', '2');
  const result = await page.evaluate(() => {
    const result = (window as any).__containerLoadingPalletSnapshot.result;
    return {
      loaded: result.placements.length,
      remaining: result.remaining,
      pallets: result.pallets.map((load: any) => {
        const topZ = Math.max(...load.cargoPlacements.map((p: any) => p.z));
        return {
          tail: Boolean(load.isMixedTail),
          count: load.cargoPlacements.length,
          fill: load.cargoPlacements.filter((p: any) => Math.abs(p.z - topZ) < 1e-8).reduce((area: number, p: any) => area + p.length * p.width, 0) / (load.length * load.width),
        };
      }),
    };
  });
  expect(result.loaded).toBe(9);
  expect(result.remaining).toEqual([]);
  // A chooses rigid-unit order; preparation still preserves the regular and tail decks.
  expect(result.pallets.map((p: any) => p.count).sort((a: number, b: number) => b - a)).toEqual([8, 1]);
  expect(result.pallets.find((p: any) => !p.tail).fill).toBeCloseTo(1);
  expect(result.pallets.find((p: any) => p.tail)).toMatchObject({ tail: true, count: 1 });
  await page.screenshot({ path: test.info().outputPath('pallet-top-layer.png'), fullPage: true });

  await page.getByRole('button', { name: /메뉴/, exact: false }).filter({ has: page.locator('span', { hasText: '☰' }) }).click();
  const downloadAction = page.getByRole('button', { name: /점검 파일 다운로드/ });
  await expect(downloadAction).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('diagnostic-download-menu.png'), fullPage: true });
  const downloaded = page.waitForEvent('download');
  await downloadAction.click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/^loading-system-check-.*\.zip$/);
  expect(await download.failure()).toBeNull();
  const saved = test.info().outputPath(download.suggestedFilename());
  await download.saveAs(saved);
  const bytes = await readFile(saved);
  expect(bytes.subarray(0, 4).toString('hex')).toBe('504b0304');
  const zipText = bytes.toString('utf8');
  for (const filename of ['manifest.json', 'loading-input.json', 'placements.json', 'pallets.csv']) expect(zipText).toContain(filename);
  expect(zipText).toContain('E2E-TAIL');
  expect(mailRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});
