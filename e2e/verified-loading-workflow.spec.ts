import { expect, test } from '@playwright/test';

async function loadEnterpriseSample(page: import('@playwright/test').Page) {
  const planner = page.locator('#product-packaging-planner');
  await expect(planner).toBeVisible();
  await planner.getByRole('button', { name: '샘플 불러오기' }).click();
  await expect(planner.getByText('PRD-A', { exact: false })).toBeVisible();
}

test('guided workflow exposes BOX/PALLET and all six loading strategies', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
  await loadEnterpriseSample(page);

  await page.getByRole('button', { name: /다음: 제품 선택/ }).click();
  const search = page.getByPlaceholder('제품명 또는 제품코드 검색');
  await search.fill('PRD-A');
  const product = page.locator('.guided-product-table article').filter({ hasText: 'PRD-A' }).first();
  await expect(product).toBeVisible();
  await product.locator('input[type="number"]').fill('1');
  await page.getByRole('button', { name: /다음: 제품 포장/ }).click();
  await expect(page.getByRole('heading', { name: '제품 포장' })).toBeVisible();
  await expect(page.getByText('포장안 준비 완료')).toBeVisible();
  await page.getByRole('button', { name: /포장 확정 · 다음: 적재 방식 선택/ }).click();

  await expect(page.getByRole('heading', { name: '적재 방식 선택' })).toBeVisible();
  await expect(page.locator('.guided-strategy-stage > .guided-panel-title p')).toHaveCount(0);
  await expect(page.locator('.guided-load-mode-grid').getByRole('button', { name: /^BOX/ })).toBeVisible();
  await expect(page.locator('.guided-load-mode-grid').getByRole('button', { name: /^PALLET/ })).toBeVisible();
  for (const label of ['균형형', '공간 활용형', '안전 우선형', '무게중심형', '하중 분산형', '하역 우선형']) {
    await expect(page.locator('.guided-strategy-grid').getByRole('button', { name: new RegExp(`^${label}`) })).toBeVisible();
  }

  await page.locator('.guided-load-mode-grid').getByRole('button', { name: /^PALLET/ }).click();
  await expect(page.getByRole('button', { name: '팔레트', exact: true })).toHaveClass(/active/);
  await page.locator('.guided-load-mode-grid').getByRole('button', { name: /^BOX/ }).click();
  await expect(page.getByRole('button', { name: '박스', exact: true })).toHaveClass(/active/);
  await page.locator('.guided-strategy-grid').getByRole('button', { name: /^무게중심형/ }).click();
  await expect(page.locator('.guided-strategy-grid').getByRole('button', { name: /^무게중심형/ })).toHaveClass(/active/);
});

test('verified BOX run exposes real phases and only finalLayout unlocks final 3D canvas', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('container-loading-simulator-v1', JSON.stringify({
      container: { length: 2, width: 1.5, height: 1.5, maxPayloadKg: 1000 },
      cargo: [{
        id: 'SAFE-BOX', name: 'Stable test box', length: 0.4, width: 0.4, height: 0.3,
        weightKg: 2, quantity: 1, maxStackLayers: 1, maxTopLoadKg: 0, allowRotation: true,
      }],
    }));
    (window as Window & { __verifiedFlowPhases?: string[] }).__verifiedFlowPhases = [];
    window.addEventListener('container-loading:workflow-progress', (event) => {
      const detail = (event as CustomEvent<{ phase?: string }>).detail;
      if (detail?.phase) (window as Window & { __verifiedFlowPhases?: string[] }).__verifiedFlowPhases?.push(detail.phase);
    });
  });
  await page.goto('/');

  // A generic candidate result is diagnostic only. It must not unlock the final result.
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('container-loading:result', { detail: {
      container: { length: 2, width: 1.5, height: 1.5, maxPayloadKg: 1000 },
      cargo: [],
      result: { placements: [], remaining: [], loadedWeightKg: 0, usedVolumeM3: 0, validationIssues: [] },
    } }));
  });
  await expect(page.getByRole('button', { name: /결과 확인/ })).toBeDisabled();

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('container-loading:request-verified-loading', {
      detail: { mode: 'boxes', strategy: 'stability' },
    }));
  });

  await expect.poll(async () => page.evaluate(() => (window as Window & { __verifiedFlowPhases?: string[] }).__verifiedFlowPhases ?? []), { timeout: 90_000 })
    .toContain('physics-validation');
  await expect.poll(async () => page.evaluate(() => (window as Window & { __verifiedFlowPhases?: string[] }).__verifiedFlowPhases ?? []), { timeout: 90_000 })
    .toContain('inertia-validation');
  await expect.poll(async () => page.evaluate(() => (window as Window & { __verifiedFlowPhases?: string[] }).__verifiedFlowPhases ?? []), { timeout: 120_000 })
    .toContain('complete');

  await expect(page.getByRole('button', { name: /결과 확인/ })).toBeEnabled();
  await page.getByRole('button', { name: /결과 확인/ }).click();
  await expect(page.getByText(/검증 완료 · BOX · 안전 우선형/)).toBeVisible();
  await expect(page.locator('.guided-final-3d canvas')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('관성 판정')).toBeVisible();
});
