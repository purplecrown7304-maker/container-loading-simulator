import { expect, test, type Locator, type Page } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });

const environments = ['forest', 'warehouse', 'beach', 'space'] as const;
const preferenceKey = 'container-loading:viewer-environment';
const preservedAttributes = [
  'data-three-plan-revision', 'data-three-camera-pose', 'data-three-ready-ms',
  'data-three-count', 'data-three-supports', 'data-three-model-count',
  'data-three-label-faces', 'data-three-cg-visible', 'data-three-cg-position',
  'data-three-selected', 'data-three-cut', 'data-three-step',
  'data-three-frame-step', 'data-three-frame-rejected',
];

function sceneState(viewer: Locator) {
  return viewer.evaluate((element, attributes) => Object.fromEntries(attributes.map(name => [name, element.getAttribute(name)])), preservedAttributes);
}

async function renderedFrame(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function selectEnvironment(page: Page, viewer: Locator, environment: string) {
  await page.getByRole('combobox', { name: '3D 배경', exact: true }).selectOption(environment);
  await expect(viewer).toHaveAttribute('data-three-environment', environment);
  await expect(viewer).toHaveAttribute('data-three-environment-applied', 'true');
  await renderedFrame(page);
}

async function resources(viewer: Locator) {
  await expect(viewer).toHaveAttribute('data-three-geometries', /^[1-9]\d*$/);
  await expect(viewer).toHaveAttribute('data-three-textures', /^[1-9]\d*$/);
  return viewer.evaluate(element => ({
    geometries: Number(element.getAttribute('data-three-geometries')),
    textures: Number(element.getAttribute('data-three-textures')),
    renderCalls: Number(element.getAttribute('data-three-render-calls')),
  }));
}

test('four backgrounds preserve the canvas, camera, cargo and controls without accumulating GPU resources', async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/comparison.html');
  const viewer = page.locator('.three-comparison-viewer');
  const selector = page.getByRole('combobox', { name: '3D 배경', exact: true });
  await expect(viewer).toHaveAttribute('data-three-applied', 'true', { timeout: 60000 });
  await expect(viewer).toHaveAttribute('data-three-environment-applied', 'true');
  await expect(selector).toHaveValue('warehouse');
  await expect(selector.locator('option')).toHaveText(['숲속', '물류창고', '해변', '우주']);
  await expect(viewer).toHaveAttribute('data-three-count', '16');
  await expect(viewer).toHaveAttribute('data-three-supports', '2');
  const canvas = await viewer.locator('canvas').elementHandle();
  expect(canvas).not.toBeNull();
  const baseline = await sceneState(viewer);
  expect(baseline['data-three-camera-pose']?.split(',').map(Number)).toHaveLength(7);
  expect(baseline['data-three-cg-position']?.split(',').map(Number).every(Number.isFinite)).toBe(true);
  const storedInputs = await page.evaluate(key => Object.fromEntries(Object.entries(localStorage).filter(([name]) => name !== key)), preferenceKey);

  // Capture every environment with the unchanged, fully visible cargo fixture.
  for (const environment of ['warehouse', 'forest', 'beach', 'space'] as const) {
    await selectEnvironment(page, viewer, environment);
    await expect.poll(() => sceneState(viewer)).toEqual(baseline);
    expect(await canvas!.evaluate(element => element === document.querySelector('.three-comparison-viewer canvas'))).toBe(true);
    await expect(selector).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`background-${environment}.png`), fullPage: true });
  }

  // User orbit, selected cargo and partial loading views must survive repeated switches.
  await viewer.locator('canvas').scrollIntoViewIfNeeded();
  const bounds = await viewer.locator('canvas').boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width / 2 + 35, bounds!.y + bounds!.height / 2 + 20, { steps: 5 });
  await page.mouse.up();
  await expect(viewer).not.toHaveAttribute('data-three-camera-pose', baseline['data-three-camera-pose']!);
  await viewer.getByRole('slider', { name: 'Three.js 높이 단면', exact: true }).fill('70');
  await viewer.getByRole('slider', { name: 'Three.js 적재 순서', exact: true }).fill('8');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('container-loading:placement-select', { detail: { index: 0 } })));
  await expect(viewer).toHaveAttribute('data-three-selected', '0');
  await renderedFrame(page);
  const controlledState = await sceneState(viewer);
  await selectEnvironment(page, viewer, 'warehouse');
  const warehouseResources = await resources(viewer);
  const resourceHistory = [warehouseResources];
  for (let cycle = 0; cycle < 3; cycle++) {
    for (const environment of environments) await selectEnvironment(page, viewer, environment);
    await selectEnvironment(page, viewer, 'warehouse');
    await expect.poll(() => resources(viewer)).toEqual(warehouseResources);
    resourceHistory.push(await resources(viewer));
    await expect.poll(() => sceneState(viewer)).toEqual(controlledState);
  }
  // Issue the next selection immediately, without waiting for the previous render.
  for (const environment of ['forest', 'space', 'beach', 'forest', 'warehouse']) await selector.selectOption(environment);
  await expect(viewer).toHaveAttribute('data-three-environment', 'warehouse');
  await expect(viewer).toHaveAttribute('data-three-environment-applied', 'true');
  await renderedFrame(page);
  await expect.poll(() => resources(viewer)).toEqual(warehouseResources);
  await expect.poll(() => sceneState(viewer)).toEqual(controlledState);

  expect(await canvas!.evaluate(element => element === document.querySelector('.three-comparison-viewer canvas'))).toBe(true);
  expect(await page.evaluate(key => Object.fromEntries(Object.entries(localStorage).filter(([name]) => name !== key)), preferenceKey)).toEqual(storedInputs);
  expect(await page.evaluate(key => sessionStorage.getItem(key), preferenceKey)).toBe('warehouse');
  await selector.selectOption('beach');
  await page.reload();
  await expect(selector).toHaveValue('beach');
  await expect(viewer).toHaveAttribute('data-three-applied', 'true', { timeout: 60000 });
  await expect(viewer).toHaveAttribute('data-three-environment', 'beach');
  await test.info().attach('warehouse-resource-cycles', { body: JSON.stringify(resourceHistory, null, 2), contentType: 'application/json' });
  expect(errors).toEqual([]);
});

test('background selection remains usable during a model-load failure and its retry', async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  let failedModels = 0;
  const modelUrl = /\/[^/?]+\.obj(?:\?.*)?$/;
  await page.route(modelUrl, async route => {
    failedModels++;
    await route.fulfill({ status: 503, contentType: 'text/plain', body: 'Intentional model failure for background isolation test' });
  });
  await page.goto('/comparison.html');
  const viewer = page.locator('.three-comparison-viewer');
  const error = viewer.locator('.three-comparison-error');
  await expect(error).toBeVisible({ timeout: 30000 });
  expect(failedModels).toBeGreaterThan(0);
  const canvas = await viewer.locator('canvas').elementHandle();
  expect(canvas).not.toBeNull();
  const revision = await viewer.getAttribute('data-three-plan-revision');
  for (const environment of environments) {
    await selectEnvironment(page, viewer, environment);
    await expect(error).toBeVisible();
    await expect(viewer).toHaveAttribute('data-three-applied', 'false');
    await expect(viewer).toHaveAttribute('data-three-plan-revision', revision!);
    expect(await canvas!.evaluate(element => element === document.querySelector('.three-comparison-viewer canvas'))).toBe(true);
  }
  await page.screenshot({ path: test.info().outputPath('background-model-error.png'), fullPage: true });
  await page.unroute(modelUrl);
  await error.getByRole('button', { name: '다시 시도', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-three-applied', 'true', { timeout: 60000 });
  await expect(viewer).toHaveAttribute('data-three-environment', 'space');
  await expect(viewer).toHaveAttribute('data-three-environment-applied', 'true');
  await expect(viewer).toHaveAttribute('data-three-count', '16');
  await expect(error).toBeHidden();
  expect(errors).toEqual([]);
});
