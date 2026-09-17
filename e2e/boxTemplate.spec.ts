import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import * as XLSX from 'xlsx';

test('box management downloads and imports its template without quantity or unloading order', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '적재공간 선택' })).toBeVisible();
  // Isolated local catalog fixture; no remote account or account data is used.
  await page.evaluate(() => {
    sessionStorage.setItem('container-loading-local-operator-v1', JSON.stringify({ id: 'box-template-test', name: 'Box template test' }));
    window.dispatchEvent(new CustomEvent('container-loading:open-workspace', { detail: { tab: 'boxes' } }));
  });

  const modal = page.locator('.box-selector-modal');
  const downloadPromise = page.waitForEvent('download');
  await modal.getByRole('button', { name: '기초 엑셀 다운로드' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('container-loading-box-template.xlsx');
  const path = await download.path();
  const workbook = XLSX.read(await readFile(path!), { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
  expect(rows[0]).toHaveLength(9);
  expect(rows[0]).not.toContain('수량');
  expect(rows[0]).not.toContain('하역순서');

  await modal.getByRole('button', { name: '신규 박스 등록', exact: true }).click();
  await modal.locator('input[type="file"]').setInputFiles(path!);
  await expect(modal.locator('footer')).toContainText('신규 2종');
  const catalogRows = modal.locator('.catalog-wrap tbody tr');
  await expect(catalogRows).toHaveCount(2);
  await expect(catalogRows.nth(0)).toContainText('BOX-A');
  await expect(catalogRows.nth(0).locator('input[type="number"]')).toHaveValue('0');
  await expect(catalogRows.nth(1)).toContainText('BOX-B');
});
