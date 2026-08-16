import { expect, test } from '@playwright/test';

test('core loading flow works', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Container Loading Simulator')).toBeVisible();
  await expect(page.getByText('Codex release v1.3.0')).toBeVisible();
  await expect(page.getByRole('button', { name: '박스 적재 실행' })).toBeVisible();
  await expect(page.getByText('박스 적재 결과')).toBeVisible();

  await page.getByRole('button', { name: '박스 적재 실행' }).click();
  await expect(page.getByText('적재 수량')).toBeVisible();

  await page.getByRole('button', { name: '팔레트 사용' }).click();
  await expect(page.getByRole('button', { name: '팔레트 적재 실행' })).toBeVisible();
  await expect(page.getByText('팔레트 적재 모드')).toBeVisible();

  await page.getByRole('button', { name: '박스만 적재' }).click();
  await page.getByRole('button', { name: '저장' }).click();
  await expect(page.getByText('현재 데이터가 이 브라우저에 저장되었습니다.')).toBeVisible();
  await page.getByRole('button', { name: '불러오기' }).click();
  await expect(page.getByText('저장된 데이터를 불러왔습니다.')).toBeVisible();
});

test('3D viewer mounts without fatal error', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('예기치 않은 오류가 발생했습니다')).toHaveCount(0);
});
