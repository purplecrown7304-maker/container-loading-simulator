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
});
