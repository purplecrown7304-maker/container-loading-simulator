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
