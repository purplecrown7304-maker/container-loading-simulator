import { expect, test, type Page } from '@playwright/test';
import { expectFloatingWorkspacesOverCanvas, openWorkspace } from './helpers/workspace';
import { expectCompactViewerFooter, expectGlobalBackgroundControl, expectThreeOnly } from './helpers/viewer';

const mainViewer = '.viewer-host .three-comparison-viewer';
const workspaceTitles = ['적재공간 선택', '제품 선택', '제품 포장', '적재 방식 선택'];

async function seedProducts(page: Page, count = 1) {
  // Guest bootstrap installs memory-backed storage; seed its isolated catalog only after mount.
  await expect(page.locator('.guided-step-list button')).toHaveCount(6);
  await page.evaluate(count => {
    localStorage.setItem('container-loading-product-packaging-v1:guest', JSON.stringify({
      container: { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 },
      products: Array.from({ length: count }, (_, index) => ({
        id: `PERSIST-${String(index + 1).padStart(2, '0')}`, name: `유지 확인 제품 ${index + 1}`,
        length: .2, width: .15, height: .1, weightKg: 1, quantity: 1, requiresBoxPackaging: false,
      })), boxes: [], settings: { allowCustom: false },
    }));
    window.dispatchEvent(new Event('container-loading:enterprise-packaging-planner-updated'));
  }, count);
}

async function selectProduct(page: Page, quantity = '6') {
  const workspace = await openWorkspace(page, 2);
  await workspace.getByRole('textbox', { name: '제품 검색' }).fill('PERSIST-01');
  await workspace.getByRole('spinbutton', { name: '유지 확인 제품 1 출하 수량', exact: true }).fill(quantity);
  return workspace;
}

test('default page keeps a single main viewer and opens workspaces only on request', async ({ page }) => {
  await page.goto('/');
  await seedProducts(page);
  await expect(page.locator('.viewer-card')).toBeVisible();
  await expect(page.locator(mainViewer)).toBeVisible();
  await expect(page.locator('.inertia-canvas-host')).toHaveCount(1);
  await expect(page.locator('.workspace-modal')).toBeHidden();
  await expect(page.locator('.guided-step-list button')).toHaveCount(6);
  await expect(page.locator('.guided-job-summary')).toHaveJSProperty('open', page.viewportSize()!.width > 760);
  await expect(page.locator('.workspace-modal canvas,.workspace-modal iframe')).toHaveCount(0);
  await expect(page.locator('.product-packaging-preview')).toHaveCount(0);
  await expectFloatingWorkspacesOverCanvas(page);
  const viewer = await page.locator(mainViewer).elementHandle();
  const url = page.url();

  for (let cycle = 0; cycle < 2; cycle++) {
    for (const [index, title] of workspaceTitles.entries()) {
      const step = page.locator(`.guided-step-list button[data-workspace-step="${index + 1}"]`);
      await step.click();
      const dialog = page.getByRole('dialog', { name: `${title} 설정`, exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await expect(dialog.getByRole('button', { name: '설정 닫기', exact: true })).toBeFocused();
      await expect(page.locator('.guided-bottom-bar:visible')).toHaveCount(1);
      if (cycle === 0) await dialog.getByRole('button', { name: '설정 닫기', exact: true }).click();
      else await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(step).toBeFocused();
      await expect(page.locator(mainViewer)).toBeVisible();
      expect(await viewer!.evaluate(element => element === document.querySelector('.viewer-host .three-comparison-viewer'))).toBe(true);
      expect(page.url()).toBe(url);
    }
  }
  await openWorkspace(page, 1);
  await page.locator('.workspace-modal-backdrop').click({ position: { x: 2, y: 2 } });
  await expect(page.locator('.workspace-modal')).toBeHidden();
  await expect(page.locator('[data-workspace-step="1"]')).toBeFocused();
});

test('product drafts and the packaging/strategy next flow survive closing and reopening', async ({ page }) => {
  await page.goto('/');
  await seedProducts(page);
  const workspace = await selectProduct(page, '7');
  const input = workspace.getByRole('textbox', { name: '제품 검색' });
  const retainedInput = await input.elementHandle();
  await workspace.getByRole('button', { name: '설정 닫기', exact: true }).click();
  await openWorkspace(page, 1);
  await page.keyboard.press('Escape');
  await openWorkspace(page, 2);
  await expect(input).toHaveValue('PERSIST-01');
  await expect(workspace.getByRole('spinbutton', { name: '유지 확인 제품 1 출하 수량', exact: true })).toHaveValue('7');
  expect(await retainedInput!.evaluate(element => element === document.querySelector('input[aria-label="제품 검색"]'))).toBe(true);

  await workspace.getByRole('button', { name: /다음: 제품 포장/ }).click();
  await expect(workspace).toHaveAttribute('aria-label', '제품 포장 설정');
  await expect(workspace.locator('.guided-packaging-list article')).toContainText('7 EA');
  await expect(page.locator('.workflow-preview-status')).toHaveAttribute('data-preview-kind', 'packaging');
  await expect(page.locator('.workspace-modal canvas,.workspace-modal iframe,.product-packaging-preview')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await openWorkspace(page, 3);
  await expect(workspace.locator('.guided-packaging-list article')).toContainText('7 EA');
  await workspace.getByRole('button', { name: /포장 확정 · 다음: 적재 방식 선택/ }).click();
  await expect(workspace.getByRole('radiogroup', { name: '적재 방식 확인' }).getByRole('radio')).toHaveCount(1);
  await workspace.getByRole('radio', { name: /1번 파일 적재 방식/ }).click();
  const priority = workspace.getByRole('spinbutton', { name: /하역 순서/ });
  await priority.fill('3');
  await page.keyboard.press('Escape');
  await openWorkspace(page, 4);
  await expect(workspace.getByRole('radio', { name: /1번 파일 적재 방식/ })).toHaveAttribute('aria-checked', 'true');
  await expect(priority).toHaveValue('3');
  await workspace.getByRole('button', { name: /선택 완료 · 다음: 자동 적재/ }).click();
  await expect(workspace).toBeHidden();
  await expect(page.locator('.viewer-card')).toBeVisible();
  await expect(page.getByRole('button', { name: /최종 적재 진행/ })).toBeEnabled();
  await openWorkspace(page, 5);
  await expect(workspace).toHaveAttribute('aria-label', '자동 적재 설정');
  await page.keyboard.press('Escape');
});

test('mobile dialogs scroll internally, keep their close and next controls visible, and retain drafts', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await seedProducts(page, 36);
  await expectFloatingWorkspacesOverCanvas(page);
  const workspace = await openWorkspace(page, 2);
  const search = workspace.getByRole('textbox', { name: '제품 검색' });
  await search.fill('PERSIST-');
  const table = workspace.locator('.guided-product-table');
  await expect(table.locator('article')).toHaveCount(36);
  await expect(workspace.getByRole('button', { name: '설정 닫기', exact: true })).toBeInViewport();
  await expect(workspace.getByRole('button', { name: /다음: 제품 포장/ })).toBeInViewport();
  await expect.poll(() => table.evaluate(element => ({ overflow: getComputedStyle(element).overflowY, scrolls: element.scrollHeight > element.clientHeight }))).toEqual({ overflow: 'auto', scrolls: true });
  const before = await page.evaluate(() => ({ page: scrollY, root: document.getElementById('root')!.scrollTop }));
  await table.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(table.locator('article').last()).toBeInViewport();
  await table.locator('article').last().getByRole('spinbutton').fill('5');
  expect(await page.evaluate(() => ({ page: scrollY, root: document.getElementById('root')!.scrollTop }))).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.body.scrollWidth <= innerWidth + 1)).toBe(true);
  const bounds = await workspace.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(391);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(845);
  await workspace.getByRole('button', { name: '설정 닫기', exact: true }).click();
  await openWorkspace(page, 2);
  await expect(search).toHaveValue('PERSIST-');
  await expect(table.locator('article').last().getByRole('spinbutton')).toHaveValue('5');
  await expect(workspace.getByRole('button', { name: /다음: 제품 포장/ })).toBeEnabled();
  await page.screenshot({ path: test.info().outputPath('mobile-retained-workspace.png'), fullPage: true });
});

// Requires a supported WebGL browser. Do not force GPU flags or mock the renderer:
// the actual canvas identity, scene application and final A acceptance are the assertions.
test('one real canvas survives equipment, product, packaging, loading-unit, result and repeated workspace changes @webgl', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/');
  await seedProducts(page);
  const viewer = page.locator(mainViewer);
  await expect(viewer).toHaveAttribute('data-three-applied', 'true', { timeout: 60_000 });
  const canvas = await viewer.locator('canvas').elementHandle();
  expect(canvas).not.toBeNull();
  const background = await expectGlobalBackgroundControl(page, 'warehouse');
  await background.selectOption('forest');
  await expect(viewer).toHaveAttribute('data-three-environment-applied', 'true');
  const assertCanvas = async () => {
    await expectGlobalBackgroundControl(page, 'forest');
    await expect(viewer).toHaveAttribute('data-three-environment', 'forest');
    await expectThreeOnly(page);
    await expect(page.locator('.viewer-host canvas')).toHaveCount(1);
    await expect(page.locator('.workspace-modal canvas,.workspace-modal iframe,.product-packaging-preview')).toHaveCount(0);
    expect(await canvas!.evaluate(element => element === document.querySelector('.viewer-host canvas'))).toBe(true);
  };
  let workspace = await openWorkspace(page, 1);
  await workspace.locator('.equipment-icon-option[data-equipment-id="20-standard"]').click();
  await expect(viewer.locator('.unity-summary')).toContainText('5.90');
  await assertCanvas();
  workspace = await selectProduct(page);
  await expect(viewer).toHaveAttribute('data-three-count', '6');
  await assertCanvas();
  await workspace.getByRole('button', { name: /다음: 제품 포장/ }).click();
  await expect(page.locator('.workflow-preview-status')).toHaveAttribute('data-preview-kind', 'packaging');
  await assertCanvas();
  await workspace.getByRole('button', { name: /포장 확정 · 다음: 적재 방식 선택/ }).click();
  await workspace.getByRole('radio', { name: /파렛트 적재/ }).click();
  await assertCanvas();
  await workspace.getByRole('radio', { name: /박스 직접 적재/ }).click();
  await workspace.getByRole('radio', { name: /1번 파일 적재 방식/ }).click();
  await workspace.getByRole('button', { name: /선택 완료 · 다음: 자동 적재/ }).click();
  await page.getByRole('button', { name: /최종 적재 진행/ }).click();
  const results = page.locator('.guided-bottom-bar:visible').getByRole('button', { name: /^결과 확인/ });
  await expect(results).toBeEnabled({ timeout: 60_000 });
  await expect(viewer).toHaveAttribute('data-three-applied', 'true');
  await expect(viewer).toHaveAttribute('data-three-count', '6');
  await assertCanvas();
  await results.click();
  await expect(workspace).toHaveAttribute('aria-label', '결과 확인 설정');
  await expect(workspace.locator('.guided-result-grid.enhanced > div').nth(1)).toContainText('6 EA');
  await assertCanvas();
  await workspace.getByRole('button', { name: '설정 닫기', exact: true }).click();
  await expectCompactViewerFooter(page);
  const camera = await viewer.getAttribute('data-three-camera-pose');
  const revision = await viewer.getAttribute('data-three-plan-revision');
  const completedTarget = await page.evaluate(() => JSON.stringify((window as any).__containerLoadingPhysicsTarget));
  const completedResult = await page.locator('.guided-result-grid.enhanced').textContent();
  await background.selectOption('space');
  await expect(viewer).toHaveAttribute('data-three-environment', 'space');
  await expect(viewer).toHaveAttribute('data-three-environment-applied', 'true');
  await expect(viewer).toHaveAttribute('data-three-camera-pose', camera!);
  await expect(viewer).toHaveAttribute('data-three-plan-revision', revision!);
  expect(await page.evaluate(() => JSON.stringify((window as any).__containerLoadingPhysicsTarget))).toBe(completedTarget);
  expect(await page.locator('.guided-result-grid.enhanced').textContent()).toBe(completedResult);
  await background.selectOption('forest');
  for (let cycle = 0; cycle < 3; cycle++) {
    await openWorkspace(page, 6);
    await page.keyboard.press('Escape');
    await assertCanvas();
    await expect(viewer).toHaveAttribute('data-three-camera-pose', camera!);
  }
  await page.screenshot({ path: test.info().outputPath('persistent-canvas-final.png'), fullPage: true });
});
