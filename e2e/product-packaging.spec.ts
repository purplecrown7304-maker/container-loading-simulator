import { expect, test } from '@playwright/test';
import * as XLSX from 'xlsx';

async function openProductManager(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('container-loading:open-product-tool', { detail: 'products' }));
  });
  const dialog = page.getByRole('dialog', { name: '회사 제품 관리' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function registerDirectProduct(page: import('@playwright/test').Page, id = 'E2E-DIRECT') {
  const dialog = await openProductManager(page);
  await dialog.getByLabel('제품코드').fill(id);
  await dialog.getByLabel('제품명').fill('E2E 직접 적재 제품');
  await dialog.getByLabel('길이 mm').fill('200');
  await dialog.getByLabel('폭 mm').fill('150');
  await dialog.getByLabel('높이 mm').fill('100');
  await dialog.getByLabel('중량 kg').fill('1.2');
  await dialog.getByLabel('박스 적재').selectOption('no');
  await dialog.getByRole('button', { name: '제품 등록' }).click();
  await expect(dialog).toContainText(`${id} 제품 정보를 저장했습니다.`);
  await dialog.locator('header button').click();
}

test('company product registration feeds the guided product selection stage', async ({ page }) => {
  await page.goto('/');
  await registerDirectProduct(page, 'E2E-SELECT');

  await page.getByRole('button', { name: /다음: 제품 선택/ }).click();
  await page.getByPlaceholder('제품명 또는 제품코드 검색').fill('E2E-SELECT');
  const row = page.locator('.guided-product-table article').filter({ hasText: 'E2E-SELECT' });
  await expect(row).toBeVisible();
  await row.locator('input[type="number"]').fill('12');
  await expect(page.getByText('1종 · 12 EA')).toBeVisible();
  await expect(page.getByRole('button', { name: /다음: 제품 포장/ })).toBeEnabled();
});

test('direct-load product produces a ready packaging plan and can advance to strategy selection', async ({ page }) => {
  await page.goto('/');
  await registerDirectProduct(page, 'E2E-PACK');
  await page.getByRole('button', { name: /다음: 제품 선택/ }).click();
  await page.getByPlaceholder('제품명 또는 제품코드 검색').fill('E2E-PACK');
  await page.locator('.guided-product-table article').filter({ hasText: 'E2E-PACK' }).locator('input[type="number"]').fill('4');
  await page.getByRole('button', { name: /다음: 제품 포장/ }).click();

  await expect(page.getByRole('heading', { name: '제품 포장' })).toBeVisible();
  await expect(page.getByText('포장안 준비 완료')).toBeVisible();
  await expect(page.getByText('박스 불필요 · 직접 적재')).toBeVisible();
  await page.getByRole('button', { name: /포장 확정 · 다음: 적재 방식 선택/ }).click();
  await expect(page.getByRole('heading', { name: '적재 방식 선택' })).toBeVisible();
});

test('product Excel import updates the current product master without reloading the document', async ({ page }) => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['제품코드', '제품명', '길이(mm)', '폭(mm)', '높이(mm)', '중량(kg)', '수량', '박스당최대EA', '회전정책', '완충여유(mm)', '내부최대적층', '파손주의', '혼합포장허용'],
    ['EX-01', '엑셀 제품', 200, 100, 80, 0.5, 100, 20, 'upright', 8, 1, 'Y', 'N'],
  ]), 'Products');
  const data = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  await page.goto('/');
  const dialog = await openProductManager(page);
  await page.evaluate(() => { (window as Window & { __enterpriseImportMarker?: string }).__enterpriseImportMarker = 'same-document'; });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'products.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: data,
  });
  await expect(dialog.getByText('EX-01', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { __enterpriseImportMarker?: string }).__enterpriseImportMarker)).toBe('same-document');
});

test('box recommendations explicitly state that suggestions are not auto-registered', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('container-loading:open-product-tool', { detail: 'cartons' }));
  });
  const dialog = page.getByRole('dialog', { name: '범용 및 추가 박스 추천' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('추천만으로 개인 박스 목록에는 추가되지 않습니다.');
  await expect(dialog).toContainText('등록 버튼을 눌러야 개인 박스 목록에 추가');
});
