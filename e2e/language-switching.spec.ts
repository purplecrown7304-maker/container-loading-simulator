import { expect, test } from '@playwright/test';

test.beforeEach(async ({ context, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
});

test('language switch sits before login and retains login drafts, canvas and loading inputs', async ({ page, isMobile }, testInfo) => {
  test.skip(isMobile, 'The simulator retains its existing PC-only gate.');
  test.setTimeout(90000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const switcher = page.getByRole('group', { name: 'Language / 언어 / Ngôn ngữ', exact: true });
  await expect(switcher).toBeVisible();
  const mainCanvas = page.locator('.viewer-host canvas').first(); await expect(mainCanvas).toBeVisible();
  await page.waitForFunction(() => document.querySelector('.three-comparison-viewer')?.getAttribute('data-three-ready') === 'true');
  const before = await page.evaluate(() => {
    (window as Window & { __languageTestCanvas?: Element }).__languageTestCanvas = document.querySelector('.viewer-host canvas')!;
    const snapshot = () => Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('container-loading')).map(k => [k, localStorage.getItem(k)]));
    return { inputs: snapshot(), revision: document.querySelector('.three-comparison-viewer')?.getAttribute('data-three-plan-revision') };
  });
  const buttonGeometry = await page.evaluate(() => {
    const language = document.querySelector('.header-language-switcher')!.getBoundingClientRect();
    const login = document.querySelector('.header-login-button')!.getBoundingClientRect();
    return { languageRight: language.right, loginLeft: login.left };
  });
  expect(buttonGeometry.languageRight).toBeLessThanOrEqual(buttonGeometry.loginLeft);
  await switcher.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('.guided-step-list')).toContainText('Select loading space');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill('operator@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('draft-only-not-submitted');
  // Real modal close/reopen, without submitting any authentication request.
  await page.getByRole('button', { name: 'Close sign-in dialog', exact: true }).click();
  await switcher.getByRole('button', { name: 'Tiếng Việt', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await expect(page.locator('.guided-step-list')).toContainText('Chọn không gian xếp hàng');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('operator@example.invalid');
  // The existing sign-in opener deliberately clears password fields on every reopening.
  await expect(page.getByLabel('Mật khẩu', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Đóng cửa sổ đăng nhập', exact: true }).click();
  await page.locator('.header-menu-button').click();
  await expect(page.getByRole('button', { name: /Sản phẩm doanh nghiệp/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Quản lý thùng/ })).toBeVisible();
  await page.locator('.header-menu-button').click();
  const after = await page.evaluate(() => ({
    sameCanvas: document.querySelector('.viewer-host canvas') === (window as Window & { __languageTestCanvas?: Element }).__languageTestCanvas,
    inputs: Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('container-loading')).map(k => [k, localStorage.getItem(k)])),
    revision: document.querySelector('.three-comparison-viewer')?.getAttribute('data-three-plan-revision'),
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
  }));
  expect(after.sameCanvas).toBe(true); expect(after.inputs).toEqual(before.inputs); expect(after.revision).toEqual(before.revision); expect(after.overflow).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('vietnamese-switch.png') });
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await expect(page.locator('.header-login-button')).toHaveText('Đăng nhập');
  await page.locator('.guided-step-list button[data-workspace-step="1"]').click();
  await expect(page.getByRole('heading', { name: 'Chọn không gian xếp hàng', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Container', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Xe tải', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Đóng cài đặt', exact: true }).click();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(switcher).toBeInViewport(); await expect(page.locator('.header-login-button')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await switcher.getByRole('button', { name: '한국어', exact: true }).click();
  await expect(page.locator('.header-login-button')).toHaveText('로그인');
  expect(errors).toEqual([]);
});

test('translated menu retains specialized-equipment work-order protection', async ({ page, isMobile }) => {
  test.skip(isMobile, 'The simulator retains its existing PC-only gate.');
  await page.goto('/');
  await page.getByRole('button', { name: 'Tiếng Việt', exact: true }).click();
  await page.locator('.header-equipment-pill').click();
  await page.getByRole('dialog', { name: '컨테이너 및 트럭 유형', exact: true }).locator('.transport-equipment-card[data-equipment-id="20-tank"]').click();
  await expect(page.locator('.header-equipment-pill')).toContainText('20FT Tank');
  await page.locator('.header-menu-button').click();
  // A real translated menu action must still be captured before report generation.
  await page.locator('.header-menu-panel button[data-requires-general-cargo="true"]').last().click();
  await expect(page.locator('.transport-specialized-dialog')).toBeVisible();
  await expect(page.locator('.header-equipment-pill')).toContainText('20FT Tank');
});
