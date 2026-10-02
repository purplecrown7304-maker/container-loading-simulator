import { expect, test } from '@playwright/test';
import { expectFloatingWorkspacesOverCanvas, openWorkspace } from './helpers/workspace';
import { backgroundPreferenceKey, expectCompactViewerFooter, expectGlobalBackgroundControl, expectHeaderSceneControlsFit, expectThreeOnly } from './helpers/viewer';

for (const query of ['', '?renderer=unity', '?renderer=compare']) {
  test(`global header is Three-only even with legacy renderer URLs (${query || 'default'})`, async ({ page }) => {
    const unityRequests: string[] = [];
    page.on('request', request => { if (/\/unity-viewer\//.test(request.url())) unityRequests.push(request.url()); });
    await page.goto(`/${query}`);
    await expect(page.locator('.guided-step-list button')).toHaveCount(6);
    await expect(page.locator('.viewer-host .three-comparison-viewer')).toHaveCount(1);
    await expectThreeOnly(page);
    await expectHeaderSceneControlsFit(page);
    await expect(page.locator('.viewer-host .three-comparison-metrics')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '5초 회전 측정', exact: true })).toHaveCount(0);
    await expect(page.locator('.viewer-host').getByText(/^모델 준비.*ms/)).toHaveCount(0);
    await expectFloatingWorkspacesOverCanvas(page);
    await expectCompactViewerFooter(page);
    const selector = await expectGlobalBackgroundControl(page, 'warehouse');
    await selector.selectOption('forest');
    await expect(page.locator('.viewer-host .three-comparison-viewer')).toHaveAttribute('data-three-environment', 'forest');
    for (const step of [1, 2, 3, 4]) {
      const workspace = await openWorkspace(page, step);
      await expectGlobalBackgroundControl(page, 'forest');
      await expect(workspace.locator('canvas,iframe')).toHaveCount(0);
      await page.keyboard.press('Escape');
    }
    await expectHeaderSceneControlsFit(page);
    expect(unityRequests).toEqual([]);
  });
}

test('the single global background preference survives main-page reload and remains usable on narrow mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.guided-step-list button')).toHaveCount(6);
  await expectHeaderSceneControlsFit(page);
  const selector = await expectGlobalBackgroundControl(page, 'warehouse');
  for (const background of ['space', 'beach', 'forest', 'space']) {
    await selector.selectOption(background);
    await expect(page.locator('.viewer-host .three-comparison-viewer')).toHaveAttribute('data-three-environment', background);
  }
  expect(await page.evaluate(key => sessionStorage.getItem(key), backgroundPreferenceKey)).toBe('space');
  await page.reload();
  await expect(page.locator('.guided-step-list button')).toHaveCount(6);
  await expectGlobalBackgroundControl(page, 'space');
  await expect(page.locator('.viewer-host .three-comparison-viewer')).toHaveAttribute('data-three-environment', 'space');
  await expectThreeOnly(page);
  await expectHeaderSceneControlsFit(page);
  await expectFloatingWorkspacesOverCanvas(page);
  await expectCompactViewerFooter(page);
  await page.screenshot({ path: test.info().outputPath('mobile-global-background.png'), fullPage: true });

  // Old or malformed display preferences must never hide the selector or change loading inputs.
  await page.evaluate(key => sessionStorage.setItem(key, 'missing-environment'), backgroundPreferenceKey);
  await page.reload();
  await expectGlobalBackgroundControl(page, 'warehouse');
  await selector.selectOption('beach');
  await expect(page.locator('.viewer-host .three-comparison-viewer')).toHaveAttribute('data-three-environment', 'beach');
  await expectHeaderSceneControlsFit(page);
});

for (const width of [390, 720]) {
  test(`mobile header menu stays below both header rows and scrolls internally at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 600 });
    await page.goto('/');
    await expect(page.locator('.guided-step-list button')).toHaveCount(6);
    await expectHeaderSceneControlsFit(page);
    const toggle = page.locator('.header-menu-button');
    await toggle.click();
    const menu = page.getByRole('navigation', { name: '적재 작업 전체 메뉴', exact: true });
    await expect(menu).toBeVisible();
    const layout = await menu.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const header = document.querySelector('.reference-utility')!.getBoundingClientRect();
      return { rect: rect.toJSON(), header: header.toJSON(), overflow: getComputedStyle(element).overflowY, scrolls: element.scrollHeight > element.clientHeight };
    });
    expect(layout.rect.y).toBeGreaterThanOrEqual(layout.header.bottom);
    expect(layout.rect.x).toBeGreaterThanOrEqual(0);
    expect(layout.rect.right).toBeLessThanOrEqual(width);
    expect(layout.rect.bottom).toBeLessThanOrEqual(600);
    expect(layout.overflow).toBe('auto');
    expect(layout.scrolls).toBe(true);
    const pageBefore = await page.evaluate(() => ({ page: scrollY, root: document.getElementById('root')!.scrollTop }));
    await menu.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(menu.getByRole('button').last()).toBeInViewport();
    expect(await page.evaluate(() => ({ page: scrollY, root: document.getElementById('root')!.scrollTop }))).toEqual(pageBefore);
    await page.screenshot({ path: test.info().outputPath(`header-menu-${width}.png`), fullPage: true });
    await toggle.click();
    await expect(menu).toBeHidden();
    await expectHeaderSceneControlsFit(page);
    const background = await expectGlobalBackgroundControl(page);
    await background.selectOption('space');
    await expect(page.locator('.viewer-host .three-comparison-viewer')).toHaveAttribute('data-three-environment', 'space');
  });
}
