import { expect, test } from '@playwright/test';

test.describe('current guided workflow', () => {
  test('starts at equipment selection and advances to product selection', async ({ page }) => {
    await page.goto('/');

    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-guided-workflow', 'true');
    await expect(html).toHaveAttribute('data-guided-step', '1');
    await expect(page.locator('.guided-equipment-visual')).toBeVisible();

    const next = page.getByRole('button', { name: /다음: 제품 선택/ });
    await expect(next).toBeVisible();
    await next.click();

    await expect(html).toHaveAttribute('data-guided-step', '2');
    await expect(page.getByRole('heading', { name: '제품 선택', exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('제품명 또는 제품코드 검색')).toBeVisible();
  });

  test('automatic loading status reflects each selected unit and strategy instead of one fixed label', async ({ page }) => {
    await page.goto('/');

    await page.evaluate(() => {
      document.documentElement.dataset.guidedStep = '5';
      localStorage.setItem('container-loading:guided-loading-unit-v1', 'pallets');
      localStorage.setItem('container-loading-user-strategy-v2', 'balance');
      window.dispatchEvent(new CustomEvent('container-loading:guided-loading-unit-updated', { detail: 'pallets' }));
      window.dispatchEvent(new CustomEvent('container-loading:user-strategy-updated', { detail: 'balance' }));
    });

    const status = page.getByLabel('자동 적재 선택 상태');
    await expect(status).toBeVisible();
    await expect(status).toContainText('파렛트 적재');
    await expect(status).toContainText('무게 중심형 적재');

    const cases = [
      ['capacity', '공간 활용 우선형'],
      ['safety', '안정성 우선형'],
      ['unloading', '작업 편의 우선형'],
      ['auto', '균형 최적화형'],
    ] as const;

    for (const [strategy, label] of cases) {
      await page.evaluate(({ strategy }) => {
        localStorage.setItem('container-loading-user-strategy-v2', strategy);
        window.dispatchEvent(new CustomEvent('container-loading:user-strategy-updated', { detail: strategy }));
      }, { strategy });
      await expect(status).toContainText(label);
    }

    await page.evaluate(() => {
      localStorage.setItem('container-loading:guided-loading-unit-v1', 'boxes');
      window.dispatchEvent(new CustomEvent('container-loading:guided-loading-unit-updated', { detail: 'boxes' }));
    });
    await expect(status).toContainText('상자 적재');
  });
});
