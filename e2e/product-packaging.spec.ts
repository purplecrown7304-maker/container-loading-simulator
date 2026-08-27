import { expect, test } from '@playwright/test';
import * as XLSX from 'xlsx';

test('enterprise products can be converted into container-optimized cartons', async ({ page }) => {
  await page.goto('/');
  const planner = page.locator('#product-packaging-planner');
  await expect(planner).toBeVisible();

  await planner.getByRole('button', { name: '샘플 불러오기' }).click();
  await expect(planner.getByText('PRD-A', { exact: false })).toBeVisible();
  await expect(planner.getByText('BOX-604040', { exact: false })).toBeVisible();

  await planner.getByRole('button', { name: '자동 박스 설계' }).click();
  await expect(planner.getByRole('heading', { name: '최적 포장 설계 결과' })).toBeVisible();
  await expect(planner.getByText('PRD-A', { exact: true }).last()).toBeVisible();
  await expect(planner.getByText(/자동설계|보유박스/).first()).toBeVisible();

  page.once('dialog', dialog => dialog.accept());
  await planner.getByRole('button', { name: '메인 적재에 적용' }).click();
  await expect(page.locator('.cargo-list-item').filter({ hasText: 'PKG-PRD-A' })).toBeVisible();
  await expect(page.getByText(/물리 최적 자동 적재/).first()).toBeVisible();
});

test('enterprise product and box catalogs can be bulk imported from Excel', async ({ page }) => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['제품코드', '제품명', '길이(mm)', '폭(mm)', '높이(mm)', '중량(kg)', '수량', '박스당최대EA', '90도회전허용'],
    ['EX-01', '엑셀 제품', 200, 100, 80, 0.5, 100, 20, 'Y'],
  ]), 'Products');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['박스코드', '박스명', '내부L(mm)', '내부W(mm)', '내부H(mm)', '외부L(mm)', '외부W(mm)', '외부H(mm)', '박스자중(kg)', '최대총중량(kg)', '상부허용중량(kg)'],
    ['EX-BOX', '엑셀 박스', 490, 290, 290, 500, 300, 300, 0.6, 18, 60],
  ]), 'Boxes');
  const data = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  await page.goto('/');
  const planner = page.locator('#product-packaging-planner');
  await expect(planner).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await planner.locator('input[type="file"]').setInputFiles({ name: 'enterprise-products.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: data });
  await page.waitForLoadState('domcontentloaded');

  await expect(page.locator('#product-packaging-planner').getByText('EX-01', { exact: false })).toBeVisible();
  await expect(page.locator('#product-packaging-planner').getByText('EX-BOX', { exact: false })).toBeVisible();
});
