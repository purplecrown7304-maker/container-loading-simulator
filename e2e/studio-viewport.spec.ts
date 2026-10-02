import { expect, test } from '@playwright/test';
import { expectFloatingWorkspacesOverCanvas, openWorkspace } from './helpers/workspace';

test('equipment photo cards, persistent canvas and one font stay inside the viewport', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  for (const size of [{ width: 1440, height: 900 }, { width: 1366, height: 768 }, { width: 1024, height: 700 }, { width: 412, height: 850 }]) {
    await page.setViewportSize(size);
    await expect(page.locator('.viewer-card')).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => ({
      page: document.documentElement.scrollHeight <= innerHeight + 1,
      root: document.getElementById('root')!.scrollHeight <= innerHeight + 1,
      width: document.documentElement.scrollWidth <= innerWidth + 1,
    }))).toEqual({ page: true, root: true, width: true });
    const footer = await page.locator('.guided-bottom-bar:visible').boundingBox();
    const center = await page.locator('.dashboard-center').boundingBox();
    await expectFloatingWorkspacesOverCanvas(page);
    expect(center!.y + center!.height).toBeLessThanOrEqual(footer!.y + 1);
    expect(center!.width).toBeGreaterThan(size.width * .8);
    const summaryToggle = page.locator('.guided-job-summary > summary');
    if (await page.locator('.guided-job-summary').getAttribute('open') !== null) await summaryToggle.click();
    await expect(page.locator('.guided-job-summary')).not.toHaveAttribute('open');
    await summaryToggle.click();
    await expect(page.locator('.guided-job-summary')).toHaveAttribute('open');
    expect(await page.locator('.dashboard-center').boundingBox()).toEqual(center);
    await summaryToggle.click();
    await openWorkspace(page, 1);
    await expect(page.locator('.equipment-icon-grid')).toBeVisible();
    await expect(page.getByRole('button', { name: '설정 닫기', exact: true })).toBeInViewport();
    await expect(page.getByRole('button', { name: /다음: 제품 선택/ })).toBeInViewport();
    const modal = await page.locator('.workspace-modal').boundingBox();
    expect(modal!.x).toBeGreaterThanOrEqual(0);
    expect(modal!.x + modal!.width).toBeLessThanOrEqual(size.width + 1);
    expect(modal!.y).toBeGreaterThanOrEqual(0);
    expect(modal!.y + modal!.height).toBeLessThanOrEqual(size.height + 1);
    await expect.poll(() => page.evaluate(() => document.fonts.check('14px "Pretendard Variable"', '적재공간 ABC 123'))).toBe(true);
    const fonts = await page.locator('.guided-stage-panel h1,.guided-step-list button,.equipment-icon-option .transport-equipment-card-name,.guided-primary-cta').evaluateAll(elements => [...new Set(elements.map(el => getComputedStyle(el).fontFamily))]);
    expect(fonts).toHaveLength(1);
    expect(fonts[0]).toContain('Pretendard Variable');
    await page.getByRole('button', { name: '설정 닫기', exact: true }).click();
  }
  await openWorkspace(page, 1);
  await expect(page.locator('.equipment-icon-option').first().locator('.transport-equipment-payload')).toContainText('28,130 kg');
  await expect(page.locator('.equipment-icon-option').first().locator('.equipment-card-photo,.transport-equipment-user-image')).toBeVisible();
  await page.locator('.equipment-icon-option[data-equipment-id="20-standard"]').click();
  await expect(page.locator('.equipment-selected-strip')).toContainText('5,900 mm');
  await page.locator('.guided-segmented').getByRole('button', { name: '트럭', exact: true }).click();
  await page.locator('.equipment-icon-option[data-equipment-id="tautliner"]').click();
  await expect(page.locator('.equipment-selected-strip')).toContainText('Tautliner / Curtainsider');
});
