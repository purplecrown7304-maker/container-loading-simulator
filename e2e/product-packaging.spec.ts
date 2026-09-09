import { expect, test } from '@playwright/test';
import * as XLSX from 'xlsx';

async function openPlanner(page: import('@playwright/test').Page) {
  await page.goto('/#product-packaging-planner');
  const planner = page.locator('#product-packaging-planner');
  await expect(planner).toBeVisible();
  await planner.scrollIntoViewIfNeeded();
  return planner;
}

test('enterprise products can be converted into container-optimized cartons', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  const planner = await openPlanner(page);

  await planner.getByRole('button', { name: '샘플 불러오기' }).click();
  await expect(planner.getByText('PRD-A', { exact: false }).first()).toBeVisible();
  await expect(planner.getByText('BOX-604040', { exact: false }).first()).toBeVisible();

  await planner.getByRole('button', { name: '기업 포장 최적화' }).click();
  await expect(planner.getByRole('heading', { name: '기업 포장 최적화 결과' })).toBeVisible();
  await expect(planner.getByText('박스 규격 수', { exact: true })).toBeVisible();
  await expect(planner.getByText('예상 컨테이너', { exact: true })).toBeVisible();
  await expect(planner.getByText('PRD-A', { exact: true }).last()).toBeVisible();

  page.once('dialog', dialog => dialog.accept());
  await planner.getByRole('button', { name: '메인 적재에 적용' }).click();
  await page.getByRole('button', { name: /다음: 화물 선택/ }).click();
  await expect(page.locator('.guided-cargo-list')).toContainText('PKG-PRD-A');
  await expect(page.getByRole('button', { name: /적재 목록 적용/ })).toBeEnabled();
});

test('newly generated cartons are fail-closed until strength is verified', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  const planner = await openPlanner(page);

  await planner.getByLabel('제품코드', { exact: true }).fill('NEW-1');
  await planner.getByLabel('제품명', { exact: true }).fill('신규제품');
  await planner.getByLabel('L(mm)', { exact: true }).fill('180');
  await planner.getByLabel('W(mm)', { exact: true }).fill('120');
  await planner.getByLabel('H(mm)', { exact: true }).fill('80');
  await planner.getByLabel('중량(kg)', { exact: true }).fill('0.5');
  await planner.getByLabel('수량', { exact: true }).fill('31');
  await planner.getByLabel('박스당 최대EA', { exact: true }).fill('8');
  await planner.getByRole('button', { name: '제품 등록' }).click();

  await planner.getByRole('button', { name: '기업 포장 최적화' }).click();
  await expect(planner.getByRole('heading', { name: '기업 포장 최적화 결과' })).toBeVisible();
  await expect(planner.getByText('미검증', { exact: false }).first()).toBeVisible();

  page.once('dialog', dialog => dialog.accept());
  await planner.getByRole('button', { name: '메인 적재에 적용' }).click();
  const appliedTopLoad = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('container-loading-simulator-v1') || 'null') as { cargo?: Array<{ id: string; maxTopLoadKg?: number }> } | null;
    return state?.cargo?.find(item => item.id === 'PKG-NEW-1')?.maxTopLoadKg;
  });
  expect(appliedTopLoad).toBe(0);
});

test('enterprise product and box catalogs import without reloading the whole application', async ({ page }) => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['제품코드', '제품명', '길이(mm)', '폭(mm)', '높이(mm)', '중량(kg)', '수량', '박스당최대EA', '회전정책', '완충여유(mm)', '내부최대적층', '파손주의', '혼합포장허용'],
    ['EX-01', '엑셀 제품', 200, 100, 80, 0.5, 100, 20, 'upright', 8, 1, 'Y', 'N'],
  ]), 'Products');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['박스코드', '박스명', '내부L(mm)', '내부W(mm)', '내부H(mm)', '외부L(mm)', '외부W(mm)', '외부H(mm)', '박스자중(kg)', '최대총중량(kg)', '상부허용중량(kg)', '박스단가'],
    ['EX-BOX', '엑셀 박스', 490, 290, 290, 500, 300, 300, 0.6, 18, 60, 1.25],
  ]), 'Boxes');
  const data = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  await page.addInitScript(() => localStorage.clear());
  const planner = await openPlanner(page);
  await page.evaluate(() => { (window as Window & { __enterpriseImportMarker?: string }).__enterpriseImportMarker = 'same-document'; });
  page.once('dialog', dialog => dialog.accept());
  await planner.locator('input[type="file"]').setInputFiles({ name: 'enterprise-products.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: data });

  await expect(planner.getByText('EX-01', { exact: false }).first()).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { __enterpriseImportMarker?: string }).__enterpriseImportMarker)).toBe('same-document');
  await expect(planner.getByText('upright', { exact: false }).first()).toBeVisible();
  await expect(planner.getByText('파손주의', { exact: true }).first()).toBeVisible();
  await expect(planner.getByText('EX-BOX', { exact: false }).first()).toBeVisible();
  await expect(planner.getByText('1.25', { exact: false }).first()).toBeVisible();
});

test('a generated carton requires real tare and manufacturer strength before catalog approval', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  const planner = await openPlanner(page);
  await planner.getByLabel('제품코드', { exact: true }).fill('APPROVE-1');
  await planner.getByLabel('제품명', { exact: true }).fill('승인제품');
  await planner.getByLabel('L(mm)', { exact: true }).fill('183');
  await planner.getByLabel('W(mm)', { exact: true }).fill('121');
  await planner.getByLabel('H(mm)', { exact: true }).fill('83');
  await planner.getByLabel('중량(kg)', { exact: true }).fill('0.5');
  await planner.getByLabel('수량', { exact: true }).fill('31');
  await planner.getByLabel('박스당 최대EA', { exact: true }).fill('8');
  await planner.getByRole('button', { name: '제품 등록' }).click();
  await planner.getByRole('button', { name: '기업 포장 최적화' }).click();
  await expect(planner.getByText('미검증', { exact: false }).first()).toBeVisible();

  const approval = page.locator('.enterprise-approval-center');
  await approval.getByRole('button', { name: '승인 대기 규격 불러오기' }).click();
  await expect(approval.getByText('APPROVE-1', { exact: true })).toBeVisible();
  await approval.getByLabel('승인 박스 코드').fill('VERIFIED-APPROVE-1');
  await approval.getByLabel('제조사 검증 최대총중량(kg)').fill('20');
  await approval.getByLabel('제조사 검증 상부허용중량(kg)').fill('100');
  await approval.getByRole('button', { name: '검증 박스로 승인 등록' }).click();
  await expect(approval.getByText(/실제 자중/)).toBeVisible();

  await approval.getByLabel('완성 박스 실제 자중(kg)').fill('0.72');
  await approval.getByLabel('실제 박스 단가').fill('1.4');
  await approval.getByRole('button', { name: '검증 박스로 승인 등록' }).click();
  await expect(approval.getByText(/회사 카탈로그에 등록/)).toBeVisible();
  await expect(planner.getByText('VERIFIED-APPROVE-1', { exact: false }).first()).toBeVisible();
});
