import { expect, test } from '@playwright/test';

test('pallet workflow stacks cartons and keeps run instructions outside the canvas', async ({ page, context, baseURL }) => {
  test.setTimeout(180_000);
  // This isolated guest fixture never contacts account/data services.
  // Only the app origin and public 3D font assets are needed for the story.
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
  await expect(page.getByRole('heading', { name: '적재공간 선택' })).toBeVisible();
  await page.evaluate(() => {
    const container = { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 };
    localStorage.setItem('container-loading-product-packaging-v1:guest', JSON.stringify({
      container,
      products: [{ id: 'E2E-STACK', name: '적층 확인 제품', length: 0.5, width: 0.5, height: 0.3, weightKg: 1, quantity: 20, requiresBoxPackaging: true }],
      boxes: [{ id: 'E2E-STACK-BOX', name: '적층 가능 박스', innerLength: 0.51, innerWidth: 0.51, innerHeight: 0.31, outerLength: 0.55, outerWidth: 0.55, outerHeight: 0.35, tareWeightKg: 0.2, maxGrossWeightKg: 20, maxTopLoadKg: 100 }],
      settings: { allowCustom: false },
    }));
  });
  await page.getByRole('button', { name: /다음: 제품 선택/ }).click();
  await page.getByPlaceholder('제품명 또는 제품코드 검색').fill('E2E-STACK');
  await page.locator('.guided-product-table article').filter({ hasText: 'E2E-STACK' }).locator('input[type="number"]').fill('20');
  await page.getByRole('button', { name: /다음: 제품 포장/ }).click();
  await expect(page.getByText('포장안 준비 완료')).toBeVisible();
  await page.getByRole('button', { name: /포장 확정 · 다음: 적재 방식 선택/ }).click();
  await page.getByRole('radio', { name: /파렛트 적재/ }).click();
  await page.getByRole('radio', { name: /하역 순서 우선형/ }).click();
  await page.getByRole('spinbutton', { name: /하역 순서/ }).fill('3');
  await expect(page.getByRole('spinbutton', { name: /하역 순서/ })).toHaveValue('3');
  await page.getByRole('button', { name: /선택 완료 · 다음: 자동 적재/ }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__containerLoadingPalletSnapshot?.result.optimization?.strategy)).toBe('unloading');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('container-loading-simulator-v1')!).cargo[0].unloadPriority)).toBe(3);

  const summary = page.locator('.guided-job-summary');
  if (await summary.getAttribute('open') === null) await summary.locator('summary').click();
  const confirmation = summary.locator('.guided-loading-run-confirmation');
  await expect(confirmation).toBeVisible();
  await expect(page.locator('.pallet-preview>.unity-viewer')).toHaveAttribute('data-unity-applied', 'true', { timeout: 100_000 });
  await expect(page.locator('.pallet-preview>.unity-viewer')).toHaveAttribute('data-unity-supports', '1');
  await expect(summary.locator('dl > div').filter({ hasText: '사용 파렛트' }).locator('dd')).toHaveText('1개');
  await page.evaluate(() => {
    (window as any).__inertiaMessages = [];
    window.addEventListener('message', event => {
      const frame = document.querySelector<HTMLIFrameElement>('iframe[title="Unity 3D 캔버스 · 관성 시험 재생"]');
      if (event.source === frame?.contentWindow && event.data?.source === 'cargo-unity-host') (window as any).__inertiaMessages.push(event.data.payload);
    });
    window.dispatchEvent(new Event('container-loading:open-inertia-test'));
  });
  const motion = page.getByRole('dialog', { name: '관성 애니메이션 테스트' });
  await expect(motion.locator('.unity-viewer')).toHaveAttribute('data-unity-applied', 'true', { timeout: 100_000 });
  await motion.getByRole('slider', { name: '관성 테스트 재생 위치' }).fill('0');
  await motion.getByRole('button', { name: '처음부터', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__inertiaMessages.filter((m: any) => m.type === 'frameApplied').length)).toBeGreaterThan(3);
  expect(await page.evaluate(() => (window as any).__inertiaMessages.filter((m: any) => m.type === 'planApplied').length)).toBe(1);
  await motion.getByRole('button', { name: '관성 테스트 닫기' }).click();
  const snapshot = await page.evaluate(() => (window as typeof window & {
    __containerLoadingPalletSnapshot?: { result: { palletCount: number; placements: Array<{ z: number }> } };
  }).__containerLoadingPalletSnapshot?.result);
  expect(snapshot?.placements).toHaveLength(20);
  expect(new Set(snapshot?.placements.map(item => item.z)).size).toBe(5);

  const visibleClearance = page.locator('.pallet-preview .reference-clearance-strip');
  await expect(visibleClearance).toBeVisible({ timeout: 15_000 });
  await visibleClearance.scrollIntoViewIfNeeded();
  await expect(visibleClearance).toBeVisible();
  const bounds = await visibleClearance.boundingBox();
  const notice = await confirmation.boundingBox();
  expect(bounds).not.toBeNull();
  expect(notice).not.toBeNull();
  expect(notice!.x).toBeGreaterThanOrEqual(0);
  expect(notice!.x + notice!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  expect(bounds!.x + bounds!.width <= notice!.x || notice!.x + notice!.width <= bounds!.x || bounds!.y + bounds!.height <= notice!.y || notice!.y + notice!.height <= bounds!.y).toBe(true);
  const clearanceHit = await visibleClearance.evaluate(element => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return { visible: element.contains(hit), box: box.toJSON(), coveringElement: hit?.outerHTML.slice(0, 400) };
  });
  expect(clearanceHit.visible, JSON.stringify(clearanceHit)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('pallet-canvas.png'), fullPage: true });

  await page.getByRole('button', { name: /최종 적재 진행/ }).click();
  await expect(page.locator('.guided-bottom-bar').getByRole('button', { name: /^결과 확인/ })).toBeEnabled({ timeout: 60_000 });
  await expect(page.locator('.guided-loading-run-confirmation')).toHaveCount(0);
  await expect(summary.locator('dl > div').filter({ hasText: '사용 파렛트' }).locator('dd')).toHaveText('1개');
});
