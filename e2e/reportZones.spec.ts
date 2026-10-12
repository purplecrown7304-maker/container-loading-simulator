import { expect, test } from '@playwright/test';
import { buildLoadingReportHtml } from '../src/report';
import { reportFixture } from '../src/reportZones.fixture';

test('work order presents actual zones and checks editable shipment fields before printing', async ({ page }) => {
  const fixture = reportFixture();
  await page.setContent(buildLoadingReportHtml(fixture.container, fixture.cargo, fixture.result));
  await expect(page.locator('.zone-table tbody tr')).toHaveCount(5);
  await expect(page.locator('.zone-progress article')).toHaveCount(5);
  await expect(page.locator('.zone-progress article').first().locator('svg polygon').first()).toBeVisible();
  await expect(page.locator('.zone-progress article').first().locator('.zone-3d-instructions')).toContainText('1–18열 1–8행 1단 · 144개');
  expect(await page.locator('[data-3d-work-run]').evaluateAll(rows => rows.reduce((sum, row) => sum + Number(row.getAttribute('data-quantity')), 0))).toBe(895);
  await expect(page.locator('.zone-table tfoot')).toContainText('895개');
  await expect(page.locator('.work-grid-legend')).toContainText('같은 시작위치는 단이 달라도 같은 행·열 번호');
  await expect(page.locator('.work-grid-run').first()).toContainText('1–18열 1–8행 1단 · 144개');
  await expect(page.locator('.numbered-zone-plan[data-zone="E"][data-layer="2"]')).toContainText('32행');
  expect(await page.locator('.work-grid-run').evaluateAll(rows => rows.reduce((sum, row) => sum + Number(row.getAttribute('data-quantity')), 0))).toBe(895);
  await expect(page.locator('.numbered-zone-plan [data-placement-index]')).toHaveCount(895);
  expect(await page.locator('.work-grid-run').evaluateAll(rows => rows.every(row => {
    const marker = row.getAttribute('data-work-run');
    const diagram = document.querySelector(`.numbered-zone-plan [data-work-run="${marker}"]`);
    const ids = [...(diagram?.querySelectorAll('[data-placement-index]') ?? [])].map(el => Number(el.getAttribute('data-placement-index'))).sort((a, b) => a - b);
    const expected = (row.getAttribute('data-placement-indices') ?? '').split(',').map(Number).sort((a, b) => a - b);
    return JSON.stringify(ids) === JSON.stringify(expected);
  }))).toBe(true);
  await expect(page.locator('.partial-locations li')).toHaveCount(3);
  await expect(page.locator('.recommendations li')).toHaveCount(3);
  expect(await page.locator('.zone-report').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  expect(await page.locator('.zone-overview').first().evaluate(el => el.compareDocumentPosition(document.querySelector('.shipment-block')!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
  await page.evaluate(() => { (window as any).__printed = 0; window.print = () => { (window as any).__printed++; }; });
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: '인쇄 / PDF 저장' }).click();
  expect(await page.evaluate(() => (window as any).__printed)).toBe(0);
  await expect(page.getByLabel('거래처', { exact: true })).toBeFocused();
  for (const [label, value] of [['거래처', '<현장 A>'], ['목적지', '인천 창고'], ['차량/컨테이너 No.', 'TEST-001'], ['출고 예정', '2026-09-30 09:00']]) await page.getByLabel(label, { exact: true }).fill(value);
  await expect(page.locator('[data-shipment-value="customer"]')).toHaveText('<현장 A>');
  await page.getByRole('button', { name: '인쇄 / PDF 저장' }).click();
  expect(await page.evaluate(() => (window as any).__printed)).toBe(1);
  await page.getByLabel('출고 예정', { exact: true }).fill('');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '인쇄 / PDF 저장' }).click();
  expect(await page.evaluate(() => (window as any).__printed)).toBe(2);
  await expect(page.locator('[data-shipment-value="departure"]')).toHaveText('미입력');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.work-grid-legend')).toBeVisible();
  await expect(page.locator('.numbered-zone-plan').first()).toBeVisible();
  await expect(page.locator('.report-shipment-entry')).toBeHidden();
  await expect(page.locator('[data-shipment-value="vehicle"]')).toHaveText('TEST-001');
});

for (const language of ['ko', 'en', 'vi'] as const) {
  test(`3D work-order count arrows remain legible in ${language} screen and print`, async ({ page }, testInfo) => {
    const { setUiLanguage } = await import('../src/uiLanguage');
    setUiLanguage(language);
    const fixture = reportFixture();
    await page.setContent(buildLoadingReportHtml(fixture.container, fixture.cargo, fixture.result));
    setUiLanguage('ko');
    await expect(page.locator('[data-work-order-count-dimensions]')).toHaveCount(6);
    const first = page.locator('.zone-progress article').first();
    const expected = { ko: ['8행', '18열', '2단'], en: ['8 rows', '18 columns', '2 tiers'], vi: ['8 hàng', '18 cột', '2 tầng'] }[language];
    await expect(first.locator('[data-count-axis] text')).toHaveText(expected);
    await expect(page.locator('.zone-progress article').last().locator('[data-count-axis="row"]')).toHaveAttribute('data-count', '1');
    for (const media of ['screen', 'print'] as const) {
      await page.emulateMedia({ media });
      expect(await page.locator('[data-count-axis] text').evaluateAll(elements => elements.every(element => {
        const text = element as SVGTextElement;
        const box = text.getBoundingClientRect(), svg = text.ownerSVGElement!.getBoundingClientRect();
        const local = text.getBBox(), background = text.previousElementSibling as SVGRectElement;
        return box.width > 0 && box.height > 0 && box.left >= svg.left && box.right <= svg.right + .5
          && box.top >= svg.top && box.bottom <= svg.bottom + .5
          && local.x >= background.x.baseVal.value && local.x + local.width <= background.x.baseVal.value + background.width.baseVal.value + .5;
      }))).toBe(true);
    }
    // Retain a real Chromium-generated print artifact for pagination inspection.
    await page.pdf({ path: testInfo.outputPath(`work-order-3d-${language}.pdf`), format: 'A4', printBackground: true });
  });
}
