import { expect, test } from '@playwright/test';

test('review controls preserve actual limits and warning through cancel, save/load and strict switch', async ({ page }) => {
  await page.goto('/');
  const panel = page.getByRole('region', { name: '한도 초과 검토 설정' });
  await expect(panel).toContainText('기본 엄격 모드');
  await panel.getByRole('button', { name: '한도 초과 범위 선택', exact: true }).click();
  await expect(panel).toContainText('출고 승인 불가');
  await panel.locator('summary').click();
  await panel.getByRole('checkbox', { name: '수평 이동', exact: true }).check();
  await panel.getByRole('spinbutton', { name: '수평 이동 검토 범위', exact: true }).fill('20');
  await panel.getByRole('button', { name: '변경 취소', exact: true }).click();
  await expect(panel.getByRole('spinbutton', { name: '수평 이동 검토 범위', exact: true })).toHaveValue('12');
  await panel.getByRole('checkbox', { name: '수평 이동', exact: true }).check();
  await panel.getByRole('spinbutton', { name: '수평 이동 검토 범위', exact: true }).fill('20');
  await panel.getByRole('button', { name: '검토 범위 적용', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('container-loading:app-action', { detail: { action: 'save-local' } })));
  await panel.getByRole('button', { name: '엄격 모드로 전환', exact: true }).click();
  await expect(panel).toContainText('기본 엄격 모드');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('container-loading:app-action', { detail: { action: 'load-local' } })));
  await expect(panel).toContainText('출고 승인 불가');
  await expect(panel.getByRole('spinbutton', { name: '수평 이동 검토 범위', exact: true })).toHaveValue('20');
  await expect(panel).toContainText('원 기준 12 mm');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
