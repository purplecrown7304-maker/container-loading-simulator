import { expect, type Page } from '@playwright/test';

export const basicContainer = {
  length: 12.03,
  width: 2.35,
  height: 2.69,
  maxPayloadKg: 26500,
  floorLoadLimitKgPerM2: 1500,
  floorLoadWarningMultiplier: 3,
};

export const basicCargo = [{
  id: 'E2E-A',
  name: 'E2E Cargo',
  length: 0.5,
  width: 0.4,
  height: 0.3,
  weightKg: 10,
  quantity: 2,
  maxStackLayers: 7,
  maxTopLoadKg: 100,
  allowRotation: true,
}];

export async function seedBasicCargo(page: Page) {
  await page.addInitScript(({ container, cargo }) => {
    localStorage.setItem('container-loading-simulator-v1', JSON.stringify({ container, cargo }));
  }, { container: basicContainer, cargo: basicCargo });
}

export async function gotoWithBasicCargo(page: Page) {
  await seedBasicCargo(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '화물 선택', exact: true })).toBeVisible();
  await expect(page.locator('.guided-cargo-list')).toContainText('E2E-A');
}

export async function advanceToLoading(page: Page, mode: 'boxes' | 'pallets' = 'boxes') {
  if (mode === 'pallets') {
    await page.locator('.guided-mode-segment').getByRole('button', { name: '팔레트', exact: true }).click();
  }
  await page.getByRole('button', { name: /적재 목록 적용/ }).click();
  await expect(page.locator('.viewer-card')).toBeVisible();
  await expect(page.locator('.viewer-host canvas').first()).toBeVisible({ timeout: 20_000 });
}

export async function openHeaderMenuAction(page: Page, name: string | RegExp) {
  await page.getByRole('button', { name: /메뉴/ }).click();
  const menu = page.locator('.final-workflow-menu');
  await expect(menu).toBeVisible();
  await menu.getByRole('button', { name }).click();
}

export async function selectWorkflowStep(page: Page, name: '장비 선택' | '화물 선택' | '자동 적재' | '결과 확인') {
  const rail = page.locator('.guided-step-rail');
  await rail.getByRole('button', { name: new RegExp(`^${name}`) }).click();
}
