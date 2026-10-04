import { openWorkspace } from './helpers/workspace';
import { expect, test } from '@playwright/test';

async function registerDirectProduct(page: import('@playwright/test').Page, id: string) {
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('container-loading:open-product-tool', { detail: 'products' }));
  });
  const dialog = page.getByRole('dialog', { name: '회사 제품 관리' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('제품코드').fill(id);
  await dialog.getByLabel('제품명').fill('가이드 스모크 제품');
  await dialog.getByLabel('길이 mm').fill('800');
  await dialog.getByLabel('폭 mm').fill('600');
  await dialog.getByLabel('높이 mm').fill('500');
  await dialog.getByLabel('중량 kg').fill('1');
  await dialog.getByLabel('박스 적재').selectOption('no');
  await dialog.getByRole('button', { name: '제품 등록' }).click();
  await dialog.locator('header button').click();
}

async function advanceToStrategy(page: import('@playwright/test').Page, id: string) {
  await registerDirectProduct(page, id);
  await page.getByRole('button', { name: /다음: 제품 선택/ }).click();
  await page.getByPlaceholder('제품명 또는 제품코드 검색').fill(id);
  await page.locator('.guided-product-table article').filter({ hasText: id }).locator('input[type="number"]').fill('12');
  await page.screenshot({ path: test.info().outputPath(`studio-products-${test.info().project.name}.png`), fullPage: true });
  await page.getByRole('button', { name: /다음: 제품 포장/ }).click();
  await expect(page.getByText('포장안 준비 완료')).toBeVisible();
  await expect(page.locator('.viewer-host .three-comparison-viewer')).toHaveAttribute('data-three-applied', 'true', { timeout: 100_000 });
  await page.screenshot({ path: test.info().outputPath(`studio-packaging-${test.info().project.name}.png`), fullPage: true });
  await page.getByRole('button', { name: /포장 확정 · 다음: 적재 방식 선택/ }).click();
}


test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });
test('Three renders the real loading plan and preserves A static acceptance during view changes', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if(m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await expect(page.locator('.viewer-host iframe')).toHaveCount(0);
  await expect(page.locator('.workspace-modal')).toBeHidden();
  await expect(page.locator('.viewer-card')).toBeVisible();
  const viewer = page.locator('.viewer-host .three-comparison-viewer');
  await advanceToStrategy(page, 'THREE-TEST');
  await page.getByRole('radio', { name: /1번 파일 적재 방식/ }).click();
  await page.screenshot({ path: test.info().outputPath(`studio-strategy-${test.info().project.name}.png`), fullPage: true });
  await page.getByRole('button', { name: /선택 완료 · 다음: 자동 적재/ }).click();
  await expect(viewer).toHaveAttribute('data-three-ready', 'true', { timeout: 100_000 });
  await page.getByRole('button', { name: /최종 적재 진행/ }).click();
  await expect(viewer.locator('.unity-summary')).toContainText('12 EA', { timeout: 60_000 });
  await expect(viewer).toHaveAttribute('data-three-applied', 'true');
  await page.getByRole('slider', { name: 'Three.js 높이 단면', exact: true }).fill('70');
  await expect(page.locator('.guided-bottom-bar').getByRole('button', { name: /^결과 확인/ })).toBeEnabled({ timeout: 60_000 });
  await expect(page.locator('.transport-recalc-notice')).toHaveCount(0);
  expect((await page.locator('.viewer-card').boundingBox())!.height).toBeGreaterThan(280);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.getElementById('root')!.scrollHeight <= innerHeight + 1)).toBe(true);
  await page.screenshot({ path: test.info().outputPath(`studio-loaded-${test.info().project.name}.png`), fullPage: true });
  await page.getByRole('button', { name: '상단', exact: true }).click();
  await expect(page.getByRole('button', { name: '상단', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '외벽 숨기기', exact: true }).click();
  await page.getByRole('slider', { name: 'Three.js 적재 순서', exact: true }).fill('0');
  await page.getByRole('button', { name: '적재 순서 재생', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Three.js 적재 순서', exact: true })).toHaveValue('12', { timeout: 10_000 });
  await expect(viewer.locator('canvas')).toHaveCount(1);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('container-loading:placement-select', { detail: { index: 0 } })));
  await expect(viewer.locator('.unity-inspector')).toContainText('THREE-TEST');
  await page.getByRole('button', { name: '외벽 표시', exact: true }).click();
  await page.getByRole('button', { name: '입체', exact: true }).click();
  await page.locator('.guided-bottom-bar').getByRole('button', { name: /^결과 확인/ }).click();
  await expect(page.locator('.guided-result-grid.enhanced')).toContainText('12 EA');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect.poll(() => page.locator('#root').evaluate(el => el.scrollTop)).toBe(0);
  await page.screenshot({ path: test.info().outputPath(`studio-results-${test.info().project.name}.png`), fullPage: true });
  await openWorkspace(page, 1);
  await page.getByRole('button', { name: '선택한 장비 변경', exact: true }).click();
  await page.getByRole('dialog', { name: '컨테이너 및 트럭 유형' }).getByRole('button', { name: /^20' STANDARD/ }).click();
  await expect(page.getByRole('button', { name: '선택한 장비 변경', exact: true })).toContainText('20FT Standard');
  await expect(page.locator('.guided-step-list button').nth(5)).toBeDisabled();
  await expect(page.locator('.guided-status-row')).not.toContainText('작업 가능');
  expect(errors).toEqual([]);
});
