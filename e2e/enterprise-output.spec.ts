import { expect, test } from '@playwright/test';

const plannerState = {
  products: [{
    id: 'AUTO-E2E', name: '자동설계 E2E', length: 0.18, width: 0.12, height: 0.08,
    weightKg: 0.5, quantity: 24, maxUnitsPerBox: 8,
    orientationPolicy: 'base-rotation', allowMixedCarton: true,
  }],
  boxes: [],
  container: { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500, floorLoadLimitKgPerM2: 1500, floorLoadWarningMultiplier: 3 },
  settings: {
    allowCustom: true, maxGrossKg: 22, generatedBoxUnitCost: 1.5,
    familyEnabled: false, targetBoxTypes: 4, maxScoreLossPct: 8, allowMixedResidual: false,
    containerFreightCost: 1000, handlingCostPerCarton: 1, newBoxSetupCost: 10, cartonSkuCarryCost: 5, currency: 'KRW',
  },
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript((state) => {
    localStorage.setItem('container-loading-product-packaging-v1', JSON.stringify(state));
  }, plannerState);
});

test('generated carton requires explicit manufacturer values before catalog approval', async ({ page }) => {
  await page.goto('/');
  const approval = page.locator('.generated-carton-approval');
  await expect(approval).toBeVisible();

  await approval.getByRole('button', { name: '검증값으로 보유박스 등록' }).click();
  await expect(approval.getByText(/자동 추정하지 않습니다/)).toBeVisible();

  await approval.getByLabel('검증 박스 코드').fill('VER-E2E');
  await approval.getByLabel('실제 자중(kg)').fill('0.7');
  await approval.getByLabel('검증 최대총중량(kg)').fill('22');
  await approval.getByLabel('검증 상부허용중량(kg)').fill('100');
  await approval.getByLabel('실제 단가').fill('1.7');

  page.once('dialog', (dialog) => dialog.accept());
  await approval.getByRole('button', { name: '검증값으로 보유박스 등록' }).click();
  await page.waitForLoadState('domcontentloaded');

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('container-loading-product-packaging-v1') || '{}'));
  expect(saved.boxes.some((box: { id: string; maxTopLoadKg?: number }) => box.id === 'VER-E2E' && box.maxTopLoadKg === 100)).toBe(true);
});

test('enterprise packaging reports can be downloaded for current and recommended plans', async ({ page }) => {
  await page.goto('/');
  const reports = page.locator('.enterprise-report-actions');
  await expect(reports).toBeVisible();

  const currentDownload = page.waitForEvent('download');
  await reports.getByRole('button', { name: '현재 설정 Excel' }).click();
  expect((await currentDownload).suggestedFilename()).toBe('enterprise-packaging-current.xlsx');

  const recommendedDownload = page.waitForEvent('download');
  await reports.getByRole('button', { name: '자동 추천안 Excel' }).click();
  expect((await recommendedDownload).suggestedFilename()).toBe('enterprise-packaging-recommended.xlsx');
});
