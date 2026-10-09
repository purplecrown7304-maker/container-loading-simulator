import { openWorkspace } from './helpers/workspace';
import { expect, test } from '@playwright/test';
import { directLoadingFixtures } from './helpers/loadingFixtures';
import { expectVerifiedLoading } from './helpers/certification';

async function registerDirectProduct(page: import('@playwright/test').Page, id: string) {
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('container-loading:open-product-tool', { detail: 'products' }));
  });
  const fixture = directLoadingFixtures.twelveBox40ft;
  const dialog = page.getByRole('dialog', { name: '회사 제품 관리' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('제품코드').fill(id);
  await dialog.getByLabel('제품명').fill('가이드 스모크 제품');
  await dialog.getByLabel('길이 mm').fill(String(fixture.length * 1000));
  await dialog.getByLabel('폭 mm').fill(String(fixture.width * 1000));
  await dialog.getByLabel('높이 mm').fill(String(fixture.height * 1000));
  await dialog.getByLabel('중량 kg').fill(String(fixture.weightKg));
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
test('truck selection loads the Meshy cab and truck underbody instead of the container tractor', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [], assets = new Set<string>();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.ok() && response.url().includes('/models/vehicles/')) assets.add(new URL(response.url()).pathname); });
  await page.goto('/');
  const viewer = page.locator('.viewer-host .three-comparison-viewer');
  await expect(viewer).toHaveAttribute('data-three-vehicle-rig', 'articulated');
  await expect(viewer).toHaveAttribute('data-three-applied', 'true', { timeout: 60_000 });
  const workspace = await openWorkspace(page, 1);
  await workspace.getByRole('button', { name: '트럭', exact: true }).click();
  const rigs = { 'kr-1t-box': 'rigid', 'kr-2.5t-wing': 'medium-rigid', 'kr-2.4t-box': 'medium-rigid', 'kr-5.5t-wing': 'heavy-rigid', 'kr-7t-wing': 'multi-axle-rigid', 'custom-truck': 'rigid' };
  for (const [id, rig] of Object.entries(rigs)) {
    await workspace.locator(`.equipment-icon-option[data-equipment-id="${id}"]`).click();
    if (id === 'custom-truck') {
      const selector = page.getByRole('dialog', { name: '컨테이너 및 트럭 유형' });
      await selector.locator('[data-equipment-id="custom-truck"]').click();
      await selector.getByRole('button', { name: '사용자 규격 적용', exact: true }).click();
    }
    await expect(workspace.locator(`.equipment-icon-option[data-equipment-id="${id}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect(viewer).toHaveAttribute('data-three-vehicle-rig', rig);
    await expect(viewer).toHaveAttribute('data-three-applied', 'true', { timeout: 60_000 });
    await expect(viewer).toHaveAttribute('data-three-vehicle-status', 'ready');
  }
  for (const asset of ['cargo-1ton-cab-v2-clean.glb', 'cargo-rigid-heavy-cab-v1.glb', 'cargo-truck-underbody-v2-web.glb', 'cargo-container-tractor-v2-web.glb', 'cargo-container-chassis-v2-web.glb']) expect(assets.has(`/models/vehicles/${asset}`), asset).toBe(true);
  expect(errors).toEqual([]);
});

test('Three renders the real loading plan and preserves certification during view changes', async ({ page }) => {
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
  await page.getByRole('radio', { name: /안정성 우선/ }).click();
  await page.screenshot({ path: test.info().outputPath(`studio-strategy-${test.info().project.name}.png`), fullPage: true });
  await page.getByRole('button', { name: /다음 단계/ }).click();
  await expect(viewer).toHaveAttribute('data-three-ready', 'true', { timeout: 100_000 });
  await page.getByRole('button', { name: /최종 적재 진행/ }).click();
  await expect(viewer.locator('.unity-summary')).toContainText('12 EA', { timeout: 60_000 });
  // The summary is synchronous plan data; it is not a WebGL readiness signal.
  // A final plan rebuild needs the same model-application wait as packaging.
  await expect(viewer).toHaveAttribute('data-three-applied', 'true', { timeout: 100_000 });
  await page.getByRole('slider', { name: 'Three.js 높이 단면', exact: true }).fill('70');
  await expectVerifiedLoading(page);
  await expect(page.locator('.guided-bottom-bar').getByRole('button', { name: /^결과 확인/ })).toBeEnabled();
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
