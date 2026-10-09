import { expect, test } from '@playwright/test';
import { openWorkspace } from './helpers/workspace';

test.beforeEach(async ({ context, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
});

test('default workspace entry opens simulator; company login is chosen from menu', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Simulator retains its existing PC-only gate; company mobile coverage is separate.');
  await page.goto('/workspace.html');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.guided-step-list button')).toHaveCount(6);
  await expect(page.getByRole('dialog', { name: '기업 업무 공간', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('비밀번호', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /메뉴$/ }).click();
  await page.getByRole('button', { name: /기업 작업 공간/ }).click();
  await expect(page.getByRole('dialog', { name: '기업 업무 공간', exact: true })).toBeVisible();
  await expect(page.getByLabel('비밀번호', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '기업 업무 공간 닫기', exact: true }).click();
  await expect(page.locator('.guided-step-list button')).toHaveCount(6);
});

test('explicit company entry preserves login and simulator return link', async ({ page }) => {
  await page.goto('/workspace.html?view=company');
  await expect(page.getByLabel('비밀번호', { exact: true })).toBeVisible();
  await expect(page.locator('.guided-step-list button')).toHaveCount(0);
  await expect(page.getByRole('link', { name: '시뮬레이터', exact: true })).toHaveAttribute('href', '/');
});

test('packaging inspection shows full and partial carton contents without changing inputs', async ({ page, isMobile }, testInfo) => {
  test.skip(isMobile, 'Simulator retains its existing PC-only gate.');
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.guided-step-list button')).toHaveCount(6);
  // Synthetic account and inventory; external services blocked above.
  await page.evaluate(() => {
    const operator = { id: 'contents-regression', name: '내부 보기 테스트' };
    sessionStorage.setItem('container-loading-local-operator-v1', JSON.stringify(operator));
    const products = [{ id: 'CONTENTS-1', name: '내부 보기 제품', length: .03, width: .04, height: .02, cushioningM: .005, weightKg: .1, quantity: 168, requiresBoxPackaging: true }];
    const box = { id: 'CONTENTS-BOX', name: '내부 보기 등록 박스', innerLength: .227, innerWidth: .122, innerHeight: .257, outerLength: .235, outerWidth: .130, outerHeight: .265, tareWeightKg: .1, maxGrossWeightKg: 22, maxStackLayers: 10, maxTopLoadKg: 100, recommendationRegistration: 'explicit' };
    localStorage.setItem('container-loading-product-packaging-v1:contents-regression', JSON.stringify({ container: { length: 5.9, width: 2.352, height: 2.395, maxPayloadKg: 28130 }, products, boxes: [box], settings: { allowCustom: false } }));
    localStorage.setItem('container-loading-user-box-catalog-v1:contents-regression', JSON.stringify([{ id: box.id, name: box.name, length: box.outerLength, width: box.outerWidth, height: box.outerHeight, weightKg: 22, quantity: 0, maxStackLayers: 10, maxTopLoadKg: 100, catalogOrigin: 'recommendation', recommendationRegistration: 'explicit' }]));
    window.dispatchEvent(new CustomEvent('container-loading:local-operator-updated', { detail: operator }));
  });
  await openWorkspace(page, 1);
  await page.getByRole('button', { name: /다음: 제품 선택/ }).click();
  await page.getByPlaceholder('제품명 또는 제품코드 검색').fill('CONTENTS-1');
  await page.locator('.guided-product-table article').filter({ hasText: 'CONTENTS-1' }).locator('input[type="number"]').fill('168');
  await page.getByRole('button', { name: /다음: 제품 포장/ }).click();
  await expect(page.locator('.guided-packaging-list')).toContainText('165EA/BOX');
  const snapshot = () => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key)])));
  const before = await snapshot();
  const opener = page.getByRole('button', { name: '내부 보기 제품 박스 내부 보기', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: '박스 내부 제품 보기', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.packaging-contents-metrics')).toContainText('165 EA');
  await expect(dialog.locator('.packaging-contents-controls')).toContainText('11단');
  await expect(dialog.locator('.packaging-contents-controls')).toContainText('제품 간격 1 mm');
  await expect(dialog.locator('canvas')).toBeVisible();
  await expect(dialog.getByRole('status')).toContainText('Meshy 박스 원본 · 열린 단면 보기');
  await page.screenshot({ path: testInfo.outputPath('box-contents.png') });
  await dialog.getByRole('button', { name: '상단', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '상단', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.workspace-modal')).toBeVisible();
  await expect(opener).toBeFocused();
  // Same public selection event used by main 3D's cargo-select callback; select the residual carton.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('container-loading:open-packaging-contents', { detail: { cargoId: 'PKG-CONTENTS-1-PARTIAL' } })));
  await expect(dialog.locator('.packaging-contents-metrics')).toContainText('3 EA');
  await expect(dialog.locator('.packaging-contents-controls')).toContainText('1단');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await dialog.getByRole('button', { name: '박스 내부 보기 닫기', exact: true }).click();
  expect(await snapshot()).toEqual(before);
  expect(errors).toEqual([]);
});
