import { expect, test } from '@playwright/test';
import { expectHeaderSceneControlsFit } from './helpers/viewer';

for (const width of [320, 480, 481, 761, 1280]) {
  test(`rules stay beside the background control and review settings remain reachable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await expect(page.locator('.guided-step-list button')).toHaveCount(6);
    await expectHeaderSceneControlsFit(page);
    await expect(page.locator('.app-shell > .loading-rules-selector')).toHaveCount(0);

    const background = page.getByRole('combobox', { name: '3D 배경', exact: true });
    const rules = page.getByRole('combobox', { name: '적재 규칙', exact: true });
    await background.focus();
    await page.keyboard.press('Tab');
    await expect(rules).toBeFocused();
    await expect(rules).toHaveAccessibleDescription(/이전 적재·점검 결과가 초기화/);

    const review = page.getByRole('region', { name: '한도 초과 검토 설정' });
    await review.getByRole('button', { name: '한도 초과 범위 선택', exact: true }).click();
    await expect(review.locator('.limit-review-persistent-warning')).toBeVisible();
    await expect(review).toContainText('출고 승인 불가');
    await review.locator('summary').click();
    await expectHeaderSceneControlsFit(page);
    await review.getByRole('checkbox', { name: '수평 이동', exact: true }).check();
    await review.getByRole('spinbutton', { name: '수평 이동 검토 범위', exact: true }).fill('20');
    await review.getByRole('button', { name: '검토 범위 적용', exact: true }).click();
    await review.getByRole('button', { name: '엄격 모드로 전환', exact: true }).click();
    await expect(review).toContainText('기본 엄격 모드');
    await expectHeaderSceneControlsFit(page);
  });
}

test('header rules work with the keyboard and preserve custom equipment and selection after reload', async ({ page }) => {
  const equipmentKey = 'container-loading:transport-equipment-v1';
  const equipment = {
    id: 'custom-container', category: 'container', name: 'CUSTOM CONTAINER', shortName: 'Custom Container', geometry: 'custom',
    length: 8, width: 2.35, height: 2.7, maxPayloadKg: 15000, floorLoadLimitKgPerM2: 1500, sourceLabel: '사용자 입력값',
  };
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: equipmentKey, value: equipment });
  await page.goto('/');
  const rules = page.getByRole('combobox', { name: '적재 규칙', exact: true });
  const background = page.getByRole('combobox', { name: '3D 배경', exact: true });
  await expect(rules).toHaveValue('legacy');
  await rules.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(rules).toHaveValue('a-v1');
  await expect(rules).toHaveAccessibleDescription(/운송 안전 인증이 아닙니다/);
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), equipmentKey)).toEqual(equipment);
  await background.selectOption('space');
  await expect(rules).toHaveValue('a-v1');
  for (const value of ['legacy', 'a-v1', 'legacy', 'a-v1']) {
    await rules.selectOption(value);
    await expect(rules).toHaveValue(value);
    await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), equipmentKey)).toEqual(equipment);
  }
  await page.reload();
  await expect(rules).toHaveValue('a-v1');
  await expect(background).toHaveValue('space');
  await expectHeaderSceneControlsFit(page);
});
