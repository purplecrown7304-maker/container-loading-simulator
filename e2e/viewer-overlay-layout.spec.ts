import { expect, test } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });

// Pallet result overlays share one left-bottom dock; no overlay may hide behind another.
for (const viewport of [{ width: 1906, height: 905 }, { width: 1280, height: 720 }]) {
  test(`pallet overlays do not overlap at ${viewport.width}x${viewport.height}`, async ({ page, context, baseURL }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'The app shows a desktop-only notice on mobile.');
    test.setTimeout(240_000);
    await page.setViewportSize(viewport);
    const appOrigin = new URL(baseURL!).origin;
    await context.route('**/*', route => new URL(route.request().url()).origin === appOrigin ? route.continue() : route.abort('blockedbyclient'));
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('container-loading-product-packaging-v1:guest', JSON.stringify({
        container: { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 },
        products: [{ id: 'E2E-DOCK', name: '오버레이 확인 제품', length: .5, width: .5, height: .3, weightKg: 5, quantity: 200, requiresBoxPackaging: true }],
        boxes: [{ id: 'E2E-DOCK-BOX', name: '오버레이 확인 박스', innerLength: .51, innerWidth: .51, innerHeight: .31, outerLength: .55, outerWidth: .55, outerHeight: .35, tareWeightKg: .2, maxGrossWeightKg: 20, maxTopLoadKg: 100 }],
        settings: { allowCustom: false },
      }));
      window.dispatchEvent(new Event('container-loading:enterprise-packaging-planner-updated'));
    });
    await page.getByRole('button', { name: /다음: 제품 선택/ }).click();
    await page.getByPlaceholder('제품명 또는 제품코드 검색').fill('E2E-DOCK');
    await page.locator('.guided-product-table article').filter({ hasText: 'E2E-DOCK' }).locator('input[type="number"]').fill('200');
    await page.getByRole('button', { name: /다음: 제품 포장/ }).click();
    await page.getByRole('button', { name: /포장 확정 · 다음: 적재 방식 선택/ }).click();
    await page.getByRole('radio', { name: /파렛트 적재/ }).click();
    await page.getByRole('radio', { name: /T11 플라스틱 \(수출용 경량\)/ }).click();
    await page.getByRole('radio', { name: /공간효율 우선/ }).click();
    await page.getByRole('button', { name: /다음 단계/ }).click();
    await page.getByRole('button', { name: /최종 적재 진행/ }).click();
    await expect(page.locator('.viewer-host .three-comparison-viewer')).toHaveAttribute('data-three-applied', 'true', { timeout: 150_000 });
    const dock = page.locator('.viewer-host .pallet-info-dock');
    await expect(dock.locator('.pallet-dock-summary')).toContainText('팔레트');
    await expect(dock.locator('.reference-clearance-strip')).toContainText('천장');
    await expect(dock.locator('.pallet-securing-strip')).toContainText('관성 보강 적용', { timeout: 120_000 });
    // The CG toggle is disabled while the certification scene replays; the legend returns afterwards.
    await expect(page.locator('.viewer-host .unity-toolbar').getByRole('button', { name: '무게중심 ON', exact: true })).toBeEnabled({ timeout: 120_000 });
    await expect(page.locator('.three-cg-legend')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.viewer-bottom-actions.pallet-summary-active')).toBeHidden();

    const boxes = await page.evaluate(() => Object.fromEntries(['.guided-step-rail', '.guided-job-summary', '.viewer-host .unity-toolbar', '.three-cg-legend',
      '.viewer-host .pallet-info-dock', '.viewer-host .viewer-bottom-info', '.viewer-host .unity-hint'].map(selector => {
      const rect = document.querySelector(selector)!.getBoundingClientRect();
      return [selector, { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom }];
    })));
    const names = Object.keys(boxes);
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
      const a = boxes[names[i]], b = boxes[names[j]];
      const overlap = a.x < b.right - 1 && b.x < a.right - 1 && a.y < b.bottom - 1 && b.y < a.bottom - 1;
      expect(overlap, `${names[i]} overlaps ${names[j]}: ${JSON.stringify([a, b])}`).toBe(false);
    }
    // Every dock row stays readable inside the dock (no hidden horizontal scroll).
    expect(await dock.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('pallet-overlay-layout.png') });
  });
}
