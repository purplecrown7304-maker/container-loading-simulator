import { expect, test } from '@playwright/test';

async function registerDirectProduct(page: import('@playwright/test').Page, id: string) {
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('container-loading:open-product-tool', { detail: 'products' }));
  });
  const dialog = page.getByRole('dialog', { name: '회사 제품 관리' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('제품코드').fill(id);
  await dialog.getByLabel('제품명').fill('가이드 스모크 제품');
  await dialog.getByLabel('길이 mm').fill('200');
  await dialog.getByLabel('폭 mm').fill('150');
  await dialog.getByLabel('높이 mm').fill('100');
  await dialog.getByLabel('중량 kg').fill('1');
  await dialog.getByLabel('박스 적재').selectOption('no');
  await dialog.getByRole('button', { name: '제품 등록' }).click();
  await dialog.locator('header button').click();
}

async function advanceToStrategy(page: import('@playwright/test').Page, id: string) {
  await registerDirectProduct(page, id);
  await page.getByRole('button', { name: /다음: 제품 선택/ }).click();
  await page.getByPlaceholder('제품명 또는 제품코드 검색').fill(id);
  await page.locator('.guided-product-table article').filter({ hasText: id }).locator('input[type="number"]').fill('3');
  await page.getByRole('button', { name: /다음: 제품 포장/ }).click();
  await expect(page.getByText('포장안 준비 완료')).toBeVisible();
  await page.getByRole('button', { name: /포장 확정 · 다음: 적재 방식 선택/ }).click();
}

test('current guided shell mounts with all six workflow stages', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '적재공간 선택' })).toBeVisible();
  const steps = page.locator('.guided-step-list button');
  await expect(steps).toHaveCount(6);
  await expect(steps.nth(0)).toContainText('적재공간 선택');
  await expect(steps.nth(1)).toContainText('제품 선택');
  await expect(steps.nth(2)).toContainText('제품 포장');
  await expect(steps.nth(3)).toContainText('적재 방식 선택');
  await expect(steps.nth(4)).toContainText('자동 적재');
  await expect(steps.nth(5)).toContainText('결과 확인');
});

test('guided flow reaches the React-owned automatic-loading viewer after strategy selection', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await advanceToStrategy(page, 'E2E-VIEWER');

  const strategy = page.getByRole('radio', { name: /무게중심·안정성 우선형/ });
  await strategy.click();
  await expect(strategy).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: /선택 완료 · 다음: 자동 적재/ }).click();
  await expect(page.locator('.viewer-card')).toBeVisible();
  await expect(page.getByRole('button', { name: /최종 적재 진행/ })).toBeEnabled();
});

test('results pallet settings keep the seven-level range and close results after edits', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const spec = {
      length: 1.1, width: 1.1, height: 0.15, tareWeightKg: 25, maxLoadKg: 1000,
      maxStackLevels: 6, maxSupportedTopWeightKg: 1000, useCornerGuards: false,
      cornerGuardWeightKg: 2, cornerGuardExtraHeightM: 0.03, useWrapping: false,
      wrappingWeightKg: 1.5, wrappingExtraHeightM: 0.01, minimizePackaging: true,
    };
    const palletResult = {
      pallets: [], placements: [], remaining: [], palletCount: 0,
      loadedCargoWeightKg: 0, totalPackagingWeightKg: 0, avoidedPackagingWeightKg: 0,
      packagedPalletCount: 0, totalPalletizedWeightKg: 0, consolidatedPallets: 0,
      lateralImbalanceKg: 0, stackedPallets: 0, maxUsedStackLevel: 0,
      optimization: { selectedStackTarget: 6, candidateCount: 1, floorPositions: 0, redistributedForLowUtilization: false, consolidationPasses: 0 },
    };
    (window as typeof window & { __containerLoadingPalletSnapshot?: unknown }).__containerLoadingPalletSnapshot = { spec, result: palletResult };
    const detail = {
      container: { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 },
      cargo: [{ id: 'INACTIVE', name: 'Inactive', length: 0.5, width: 0.4, height: 0.3, weightKg: 10, quantity: 0 }],
      result: { placements: [], remaining: [], loadedWeightKg: 0, usedVolumeM3: 0, validationIssues: [] },
    };
    window.dispatchEvent(new CustomEvent('container-loading-open-results-modal', { detail }));
  });

  const modal = page.locator('.results-modal');
  await expect(modal).toBeVisible();
  const stackInput = modal.getByLabel('최대 적층단');
  await expect(stackInput).toHaveValue('6');
  await expect(stackInput).toHaveAttribute('max', '7');
  await modal.getByLabel('길이(m)').fill('1.2');
  await expect(page.locator('.results-modal')).toHaveCount(0);
});

test('mobile guided dashboard remains usable without horizontal body overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '적재공간 선택' })).toBeVisible();
  await expect(page.getByRole('button', { name: /다음: 제품 선택/ })).toBeVisible();

  const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 2);
});
