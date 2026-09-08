import { expect, test, type Page } from '@playwright/test';

const STORAGE_KEY = 'container-loading-simulator-v1';
const container = { length: 12.032, width: 2.35, height: 2.7, maxPayloadKg: 28600, floorLoadLimitKgPerM2: 1500, floorLoadWarningMultiplier: 3 };

async function seedCargo(page: Page) {
  await page.addInitScript(({ key, containerSpec }) => {
    localStorage.clear();
    localStorage.setItem(key, JSON.stringify({
      container: containerSpec,
      cargo: [{ id: 'SAFE-A', name: 'Safety A', length: 0.5, width: 0.4, height: 0.3, weightKg: 10, quantity: 1, maxStackLayers: 7, maxTopLoadKg: 100, allowRotation: true }],
    }));
  }, { key: STORAGE_KEY, containerSpec: container });
}

async function goToStep3(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '화물 선택으로' }).click();
  await page.getByRole('button', { name: '자동 적재로' }).click();
  await expect(page.getByRole('heading', { name: '자동 적재' })).toBeVisible();
}

test('weight-center evaluation is presented as a warning/quality item, not a work-order gate', async ({ page }) => {
  test.setTimeout(120_000);
  await seedCargo(page);
  await goToStep3(page);
  await page.getByRole('button', { name: '자동 적재 실행' }).click();
  await expect(page.getByRole('heading', { name: '적재 결과' })).toBeVisible({ timeout: 90_000 });

  await page.getByRole('button', { name: '무게 분포' }).click();
  await expect(page.getByText(/적재 중단 또는 작업지시서 발급 차단 조건이 아닙니다/)).toBeVisible();
  await expect(page.getByRole('button', { name: '작업지시서 열기' })).toBeEnabled();
});

test('specialized tank equipment blocks general box optimization', async ({ page }) => {
  await seedCargo(page);
  await page.goto('/');

  const tank = page.getByRole('button', { name: /20' TANK/ });
  await expect(tank).toBeVisible();
  await tank.click();
  await expect(page.getByText(/특수화물 전용 장비입니다/)).toBeVisible();

  await page.getByRole('button', { name: '화물 선택으로' }).click();
  await page.getByRole('button', { name: '자동 적재로' }).click();
  await page.getByRole('button', { name: '자동 적재 실행' }).click();
  await expect(page.getByRole('alert')).toContainText('특수화물 전용 장비라 일반 박스/팔레트 자동 적재 대상이 아닙니다');
  await expect(page.getByRole('heading', { name: '자동 적재' })).toBeVisible();
});

test('custom equipment rejects invalid geometry before loading', async ({ page }) => {
  await seedCargo(page);
  await page.goto('/');
  await page.getByText('사용자 규격 직접 입력').click();
  await page.getByLabel('내부 길이(m)').fill('0');
  await page.getByRole('button', { name: '사용자 규격 적용' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
});
