import { expect, test } from '@playwright/test';

test('dashboard core loading flow works', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('컨테이너 적재 시뮬레이터')).toBeVisible();
  await expect(page.getByText('1. 컨테이너 정보')).toBeVisible();
  await expect(page.getByText('2. 적재할 화물')).toBeVisible();
  await expect(page.getByText('3. 3D 적재 뷰')).toBeVisible();
  await expect(page.getByText('4. 적재 요약')).toBeVisible();
  await expect(page.getByText('5. 제약 조건 체크')).toBeVisible();

  await page.getByRole('button', { name: /자동 적재/ }).click();
  await expect(page.getByText('8. 적재 리스트')).toBeVisible();
  await expect(page.locator('.constraint-list')).toContainText(/통과|확인|실패/);
  await expect(page.locator('.heatmap i')).toHaveCount(48);
  await expect(page.locator('.heat-legend')).toContainText('kg/m²');

  await page.getByRole('button', { name: '2D 뷰' }).click();
  await expect(page.locator('.viewer-host')).toHaveAttribute('data-view-mode', '2d');
  await expect(page.locator('.topdown-minimap')).toBeVisible();
  await page.getByRole('button', { name: '3D 뷰', exact: true }).click();
  await expect(page.locator('.viewer-host')).toHaveAttribute('data-view-mode', '3d');

  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page.getByText('현재 데이터가 이 브라우저에 저장되었습니다.')).toBeVisible();
  await page.getByRole('button', { name: '불러오기', exact: true }).click();
  await expect(page.getByText('저장된 데이터를 불러왔습니다.')).toBeVisible();

  await expect(page.getByRole('button', { name: /Excel 내보내기/ })).toBeVisible();
});

test('pallet mode is integrated in the dashboard', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '팔레트', exact: true }).click();
  await expect(page.getByText('팔레트 적재 설정')).toBeVisible();
  await expect(page.getByText('사용 팔레트')).toBeVisible();
  await page.getByRole('button', { name: /자동 적재/ }).click();
  await expect(page.locator('.pallet-preview canvas')).toBeVisible({ timeout: 20_000 });
});

test('3D viewer mounts without fatal error', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.viewer-host canvas')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('예기치 않은 오류가 발생했습니다')).toHaveCount(0);
});

test('mobile dashboard remains usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByText('컨테이너 적재 시뮬레이터')).toBeVisible();
  await expect(page.locator('.viewer-host')).toBeVisible();
  await expect(page.getByRole('button', { name: /자동 적재/ })).toBeVisible();
  await page.getByRole('button', { name: '2D 뷰' }).click();
  await expect(page.locator('.topdown-minimap')).toBeVisible();
  const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 2);
});
