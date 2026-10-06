import { expect, test } from '@playwright/test';
import { expectHeaderSceneControlsFit } from './helpers/viewer';
import { openWorkspace } from './helpers/workspace';

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

test('header rules preserve explicitly entered custom equipment and honor guest reset after reload', async ({ page }) => {
  const equipmentKey = 'container-loading:transport-equipment-v1';
  const equipment = {
    id: 'custom-container', category: 'container', name: 'CUSTOM CONTAINER', shortName: 'Custom Container', geometry: 'custom',
    length: 8, width: 2.35, height: 2.7, maxPayloadKg: 15000, floorLoadLimitKgPerM2: 1500, sourceLabel: '사용자 입력값',
  };
  await page.goto('/');
  // Guest bootstrap intentionally discards disk-backed business data. Enter the
  // custom equipment through the real UI so the safety guard also records intent.
  const workspace = await openWorkspace(page, 1);
  await page.getByRole('button', { name: '선택한 장비 변경', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '컨테이너 및 트럭 유형' });
  await dialog.locator('.transport-equipment-card[data-equipment-id="custom-container"]').click();
  await dialog.getByLabel('내부 길이(m)').fill(String(equipment.length));
  await dialog.getByLabel('내부 폭(m)').fill(String(equipment.width));
  await dialog.getByLabel('내부 높이(m)').fill(String(equipment.height));
  await dialog.getByLabel('최대 적재중량(kg)').fill(String(equipment.maxPayloadKg));
  await dialog.getByLabel('바닥 허용하중(kg/m²)').fill(String(equipment.floorLoadLimitKgPerM2));
  await dialog.getByRole('button', { name: '사용자 규격 적용', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: '선택한 장비 변경', exact: true })).toContainText('Custom Container');
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), equipmentKey)).toEqual(equipment);
  await workspace.getByRole('button', { name: '설정 닫기', exact: true }).click();
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
  // Rules and equipment are guest business state; only the display background
  // uses sessionStorage and survives a full reload without an authenticated save.
  await expect(rules).toHaveValue('legacy');
  await expect(page.getByRole('button', { name: '현재 장비 변경', exact: true })).toContainText('40FT High Cube');
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null')?.id, equipmentKey)).not.toBe(equipment.id);
  await expect(background).toHaveValue('space');
  await expectHeaderSceneControlsFit(page);
});
