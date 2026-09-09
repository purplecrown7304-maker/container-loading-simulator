import { expect, test } from '@playwright/test';
import { advanceToLoading, gotoWithBasicCargo, openHeaderMenuAction } from './helpers';

test('guided workflow and current equipment mount correctly', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');

  await expect(page.getByRole('button', { name: '대시보드로 이동' })).toBeVisible();
  await expect(page.getByText('작업 준비', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '장비 선택', exact: true })).toBeVisible();
  await expect(page.locator('.guided-equipment-card')).toBeVisible();
  await expect(page.locator('.guided-job-summary')).toContainText('현재 작업');
  await expect(page.getByRole('button', { name: /다음: 화물 선택/ })).toBeEnabled();
});

test('box optimization automatically continues into final inertia certification', async ({ page }) => {
  test.setTimeout(90_000);
  await gotoWithBasicCargo(page);
  await advanceToLoading(page, 'boxes');

  await page.getByRole('button', { name: /최종 적재 진행/ }).click();
  const gate = page.locator('.final-cert-modal');
  await expect(gate).toBeVisible({ timeout: 70_000 });
  await expect(gate.getByRole('heading', { name: '최종 적재 결과 전 관성 검증' })).toBeVisible();
  await expect(gate).toContainText('DIRECT BOX');
  await expect(gate).toContainText('출발 가속');
  await expect(gate).toContainText('급정거');
  await expect(gate).toContainText('급회전');
  await expect(gate).toContainText('통과 기준');
});

test('manual result view remains gated before a certified result exists', async ({ page }) => {
  await gotoWithBasicCargo(page);

  await openHeaderMenuAction(page, /결과 확인/);
  const gate = page.locator('.final-cert-modal');
  await expect(gate).toBeVisible({ timeout: 10_000 });
  await expect(gate).toContainText('DIRECT BOX');
  await expect(page.locator('.results-modal')).toHaveCount(0);
});

test('work order remains available before inertia certification', async ({ page }) => {
  await gotoWithBasicCargo(page);

  const popupPromise = page.waitForEvent('popup');
  await openHeaderMenuAction(page, /작업지시서 보기/);
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  await expect(popup.locator('body')).toContainText(/작업|적재/);
});

test('pallet optimization automatically requests pallet inertia certification', async ({ page }) => {
  test.setTimeout(90_000);
  await gotoWithBasicCargo(page);
  await advanceToLoading(page, 'pallets');
  await expect(page.locator('.pallet-preview canvas')).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: /최종 적재 진행/ }).click();
  await expect(page.locator('.final-cert-modal')).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('.final-cert-modal')).toContainText('PALLET');
});

test('result gate distinguishes direct-box and pallet certification modes', async ({ page }) => {
  await gotoWithBasicCargo(page);
  await openHeaderMenuAction(page, /결과 확인/);
  await expect(page.locator('.final-cert-modal')).toContainText('DIRECT BOX');

  await page.reload();
  await expect(page.getByRole('heading', { name: '화물 선택', exact: true })).toBeVisible();
  await page.locator('.guided-mode-segment').getByRole('button', { name: '팔레트', exact: true }).click();
  await openHeaderMenuAction(page, /결과 확인/);
  await expect(page.locator('.final-cert-modal')).toContainText('PALLET');
});

test('results pallet settings keep the seven-level range and close certified results after edits', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const spec = {
      length: 1.1,
      width: 1.1,
      height: 0.15,
      tareWeightKg: 25,
      maxLoadKg: 1000,
      maxStackLevels: 6,
      maxSupportedTopWeightKg: 1000,
      useCornerGuards: false,
      cornerGuardWeightKg: 2,
      cornerGuardExtraHeightM: 0.03,
      useWrapping: false,
      wrappingWeightKg: 1.5,
      wrappingExtraHeightM: 0.01,
      minimizePackaging: true,
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

test('mobile guided workflow remains usable without horizontal overflow', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '대시보드로 이동' })).toBeVisible();
  await expect(page.locator('.guided-stage-panel')).toBeVisible();
  await expect(page.locator('.guided-bottom-bar')).toBeVisible();

  const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 2);
});
