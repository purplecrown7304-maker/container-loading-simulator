import { expect, test } from '@playwright/test';

async function restoreSample(page: import('@playwright/test').Page) {
  const empty = page.locator('.empty-cargo');
  if (await empty.isVisible().catch(() => false)) {
    await empty.getByRole('button', { name: '샘플 복원' }).click();
  } else {
    const cargoItems = page.locator('.cargo-list-item');
    if (await cargoItems.count() === 0) await page.getByRole('button', { name: '샘플 복원' }).first().click();
  }
  await expect(page.locator('.cargo-list-item').first()).toBeVisible();
}

test('current dashboard and field material settings mount correctly', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('컨테이너 적재 시뮬레이터')).toBeVisible();
  await expect(page.getByText('1. 컨테이너 정보')).toBeVisible();
  await expect(page.getByText('2. 적재할 화물')).toBeVisible();
  await expect(page.getByText('3. 적재 옵션')).toBeVisible();
  await expect(page.getByText('4. 적재 요약')).toBeVisible();
  await expect(page.getByText('5. 제약 조건 체크')).toBeVisible();
  await expect(page.locator('.viewer-host canvas')).toBeVisible({ timeout: 20_000 });

  await restoreSample(page);
  await expect(page.locator('.cargo-list-item')).not.toHaveCount(0);
  await expect(page.getByRole('button', { name: /물리 최적 자동 적재/ })).toBeEnabled();
  await expect(page.getByRole('button', { name: /Excel 내보내기/ })).toBeVisible();
  await expect(page.getByText('적재 보조자재 실제 중량 설정')).toBeVisible();
});

test('box optimization automatically continues into final inertia certification', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await restoreSample(page);

  await page.getByRole('button', { name: /물리 최적 자동 적재/ }).click();
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
  test.setTimeout(60_000);
  await page.goto('/');
  await restoreSample(page);

  await page.locator('.viewer-bottom-actions .result-open-action').click();
  const gate = page.locator('.final-cert-modal');
  await expect(gate).toBeVisible({ timeout: 10_000 });
  await expect(gate).toContainText('DIRECT BOX');
  await expect(page.locator('.results-modal')).toHaveCount(0);
});

test('Excel export remains blocked until the current box plan has a matching inertia PASS', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const detail = {
      container: { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 },
      cargo: [{ id: 'E2E-A', name: 'E2E A', length: 0.5, width: 0.4, height: 0.3, weightKg: 10, quantity: 1 }],
      result: {
        placements: [{ cargoId: 'E2E-A', x: 0, y: 0, z: 0, length: 0.5, width: 0.4, height: 0.3, weightKg: 10 }],
        remaining: [],
        loadedWeightKg: 10,
        usedVolumeM3: 0.06,
        validationIssues: [],
      },
    };
    window.dispatchEvent(new CustomEvent('container-loading:result', { detail }));
  });

  const exportButton = page.getByRole('button', { name: /Excel 내보내기/ });
  await expect(exportButton).toBeEnabled();
  const dialogPromise = page.waitForEvent('dialog');
  await exportButton.click();
  const dialog = await dialogPromise;
  expect(dialog.message()).toContain('관성 시뮬레이션 3종');
  await dialog.accept();
});

test('pallet optimization automatically requests pallet inertia certification', async ({ page }) => {
  test.setTimeout(70_000);
  await page.goto('/');
  await restoreSample(page);

  await page.getByRole('button', { name: '팔레트', exact: true }).click();
  await expect(page.locator('.pallet-preview canvas')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('사용 팔레트', { exact: true })).toBeVisible();
  await expect(page.getByText('관성 보강', { exact: true })).toBeVisible();
  await expect(page.getByText('보조자재 중량', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /물리 최적 자동 적재/ }).click();
  await expect(page.locator('.final-cert-modal')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.final-cert-modal')).toContainText('PALLET');
});

test('result gate distinguishes direct-box and pallet certification modes', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await restoreSample(page);

  await page.locator('.viewer-bottom-actions .result-open-action').click();
  await expect(page.locator('.final-cert-modal')).toContainText('DIRECT BOX');

  await page.reload();
  await restoreSample(page);
  await page.getByRole('button', { name: '팔레트', exact: true }).click();
  await expect(page.locator('.pallet-preview canvas')).toBeVisible({ timeout: 20_000 });
  await page.locator('.viewer-bottom-actions .result-open-action').click();
  await expect(page.locator('.final-cert-modal')).toContainText('PALLET');
});

test('results pallet settings preserve 4 to 7 stack levels when another field changes', async ({ page }) => {
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
  await expect(stackInput).toHaveValue('6');
});

test('mobile dashboard remains usable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByText('컨테이너 적재 시뮬레이터')).toBeVisible();
  await expect(page.locator('.viewer-host')).toBeVisible();
  await restoreSample(page);
  await expect(page.getByRole('button', { name: /물리 최적 자동 적재/ })).toBeVisible();
  await expect(page.locator('.viewer-bottom-actions .result-open-action')).toBeVisible();

  const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 2);
});
