import { expect, test, type Page } from '@playwright/test';
import type { CargoItem, ContainerSpec } from '../src/engine/types';
import { PerspectiveCamera, Vector3 } from 'three';
import { buildStagingYardLayout } from '../src/stagingYardLayout';
import { palletSpecForType, PALLET_CATALOG } from '../src/engine/palletCatalog';
import { packMixedMode } from '../src/engine/mixedModePacking';
import { packOnPallets } from '../src/engine/palletOptimization';
import { stagingInputSignature } from '../src/stagingInventory';

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    await page.screenshot({ path: info.outputPath('failure.png') });
    const detail = await page.locator('.staging-panel-selection').evaluateAll(elements => elements.map(element => {
      const ancestors = []; for (let e: Element | null = element; e; e = e.parentElement) {
        const style = getComputedStyle(e); ancestors.push({ tag: e.tagName, class: e.className, open: e.getAttribute('open'), display: style.display, height: e.getBoundingClientRect().height });
      } return ancestors;
    }));
    await info.attach('selection-layout', { body: JSON.stringify(detail), contentType: 'application/json' });
    await info.attach('workspace-provenance', { body: JSON.stringify(await page.evaluate(() => ({ saved: localStorage.getItem('container-loading-simulator-v1'),
      latest: (window as any).__containerLoadingLatestResult }))), contentType: 'application/json' });
  }
});
const container: ContainerSpec = { length: 12.032, width: 2.35, height: 2.7, maxPayloadKg: 28600,
  floorLoadLimitKgPerM2: 1500, floorLoadWarningMultiplier: 3, ceilingClearanceM: .05 };
const box = (extra: Partial<CargoItem> = {}): CargoItem => ({ id: 'YARD-BOX', name: '대기장 검증 박스', length: .5,
  width: .4, height: .3, weightKg: 1, quantity: 20, maxStackLayers: 1, maxTopLoadKg: 0, allowRotation: true, ...extra });

/** Synthetic cloud account/state only. No request reaches a real member service. */
async function boot(page: Page, cargo: CargoItem[], mode: 'boxes' | 'pallets' | 'mixed' = 'boxes', wrapped = false) {
  const userId = 'staging-browser-fixture';
  const source: Record<string, unknown> = { container, cargo };
  if (wrapped && mode !== 'boxes') {
    const spec = { ...palletSpecForType(PALLET_CATALOG[0]), useWrapping: true, useCornerGuards: true, minimizePackaging: false };
    const snapshot = { spec, result: mode === 'mixed' ? packMixedMode(container, [], spec, 'capacity') : packOnPallets(container, [], spec, 'capacity') };
    source.result = { placements: [], remaining: [], loadedWeightKg: 0, usedVolumeM3: 0, validationIssues: [] };
    source.staging = { version: 1, scopeKey: `operator:${userId}|active`, mode,
      inputSignature: stagingInputSignature({ scopeKey: `operator:${userId}|active`, mode, container, cargo, palletSpec: spec, strategy: 'capacity' }),
      selectedUnitId: null, identity: { unitToStableId: {} }, palletSnapshot: snapshot, palletTypeId: 'company-default' };
  }
  let appState: Record<string, string> = {
    'container-loading-simulator-v1': JSON.stringify(source),
    'container-loading:guided-loading-unit': mode,
    'container-loading:guided-loading-strategy': 'capacity',
  };
  await page.addInitScript(({ userId }) => sessionStorage.setItem('container-loading:supabase-member-session:v2', JSON.stringify({
    token: 'synthetic-staging-browser-token', expiresAt: new Date(Date.now() + 3600000).toISOString(),
    userId, displayName: '대기장 검증', email: 'staging@example.test',
  })), { userId });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (!url.pathname.endsWith('/functions/v1/container-member-api')) return route.abort();
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST,OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (route.request().method() === 'GET') return route.fulfill({ headers, json: { ok: true,
      member: { id: userId, displayName: '대기장 검증', email: 'staging@example.test', status: 'active' } } });
    const body = route.request().postDataJSON() ?? {};
    if (body.action === 'get_data') return route.fulfill({ headers, json: { ok: true, data: {
      appState, plannerState: null, personalBoxes: [], schemaVersion: 1,
    } } });
    if (body.action === 'save_data') {
      appState = body.appState;
      return route.fulfill({ headers, json: { ok: true, updatedAt: '2026-11-17T00:00:00Z' } });
    }
    if (body.action === 'me') return route.fulfill({ headers, json: { ok: true,
      member: { id: userId, displayName: '대기장 검증', email: 'staging@example.test', status: 'active' } } });
    return route.fulfill({ status: 400, headers, json: { error: 'fixture_action_not_supported' } });
  });
  await page.goto('/');
  await expect(page.locator('[data-staging-yard-panel]')).toBeVisible();
  await expect(page.locator('.viewer-host .three-comparison-viewer')).toHaveAttribute('data-three-ready', 'true', { timeout: 60000 });
  await expect(page.locator('.guided-job-summary > dl').getByText(mode === 'mixed' ? '혼합 적재' : mode === 'pallets' ? '파렛트 적재' : '박스 직접 적재', { exact: true })).toBeVisible();
  await expect(page.locator('.guided-job-summary > dl').getByText('공간효율·적재량 우선형', { exact: true })).toBeVisible();
  return { stored: () => JSON.parse(appState['container-loading-simulator-v1']) };
}
const panel = (page: Page) => page.locator('[data-staging-yard-panel]');
function countRow(page: Page, name: string) {
  return panel(page).locator('.staging-panel-counts > div').filter({ has: page.getByText(name, { exact: true }) }).locator('dd > span');
}
async function tools(page: Page) {
  const details = panel(page).locator('.staging-panel-tools');
  if (!(await details.getAttribute('open'))) {
    if (!(await details.evaluate(element => (element as HTMLDetailsElement).open))) await details.locator('summary').click();
  }
}
async function chooseView(page: Page, label: string) {
  const viewer = page.locator('.viewer-host .three-comparison-viewer');
  await expect(viewer).toHaveAttribute('data-three-camera-request', /.+/);
  const previous = await viewer.getAttribute('data-three-camera-request');
  await panel(page).getByRole('button', { name: label, exact: true }).click();
  await expect(viewer).not.toHaveAttribute('data-three-camera-request', previous!);
  await expect(viewer).toHaveAttribute('data-three-camera-moving', 'false');
}
async function overviewScreenshot(page: Page, filename: string) {
  await chooseView(page, '전체 보기');
  const details = panel(page).locator('.staging-panel-tools');
  if (await details.evaluate(element => (element as HTMLDetailsElement).open)) await details.locator('summary').click();
  await panel(page).evaluate(element => { for (let ancestor: HTMLElement | null = element as HTMLElement; ancestor; ancestor = ancestor.parentElement) ancestor.scrollTop = 0; });
  await page.screenshot({ path: test.info().outputPath(filename) });
}

for (const viewport of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
  test(`20 real boxes conserve identity through loading, withdrawal, undo and cloud restore at ${viewport.width}`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize(viewport);
    const cloud = await boot(page, [box()]);
    await expect(countRow(page, '전체 준비량')).toHaveText(['0', '20']);
    await expect(countRow(page, '현재 차량 배치량')).toHaveText(['0', '0']);
    await expect(countRow(page, '대기량')).toHaveText(['0', '20']);
    await expect(page.locator('.viewer-host .three-comparison-viewer')).toHaveAttribute('data-three-count', '0');
    await tools(page);
    const first = panel(page).locator('[data-staging-unit-id]').first();
    const id = await first.getAttribute('data-staging-unit-id');
    await first.click();
    await panel(page).getByRole('button', { name: '선택 화물 적재', exact: true }).click();
    await expect(countRow(page, '현재 차량 배치량')).toHaveText(['0', '1']);
    await expect(countRow(page, '대기량')).toHaveText(['0', '19']);
    await expect(panel(page).getByText(id!, { exact: true })).toBeVisible();
    const resultBeforeCamera = await page.evaluate(() => JSON.stringify((window as any).__containerLoadingLatestResult.result));
    await chooseView(page, '대기장 보기');
    await chooseView(page, '차량 내부');
    expect(await page.evaluate(() => JSON.stringify((window as any).__containerLoadingLatestResult.result))).toBe(resultBeforeCamera);
    await panel(page).getByRole('button', { name: '대기장으로 회수', exact: true }).click();
    await expect(countRow(page, '현재 차량 배치량')).toHaveText(['0', '0']);
    await expect(countRow(page, '대기량')).toHaveText(['0', '20']);
    await expect(countRow(page, '대기 중 미적재량')).toHaveText(['0', '0']);
    await expect(panel(page).getByText(id!, { exact: true })).toBeVisible();
    await panel(page).getByRole('button', { name: '되돌리기', exact: true }).click();
    await expect(countRow(page, '현재 차량 배치량')).toHaveText(['0', '1']);
    await expect(countRow(page, '대기량')).toHaveText(['0', '19']);
    await expect.poll(() => cloud.stored()?.result?.placements?.length).toBe(1);
    await overviewScreenshot(page, `staging-boxes-${viewport.width}.png`);
    await page.reload();
    await expect(countRow(page, '현재 차량 배치량')).toHaveText(['0', '1']);
    await expect(countRow(page, '대기량')).toHaveText(['0', '19']);
    await expect(countRow(page, '전체 준비량')).toHaveText(['0', '20']);
    await expect(page.locator('.guided-status-row[data-verification-status="passed"]')).toHaveCount(0);
  });
}

for (const width of [1366, 1920]) {
test(`oversized cargo stays outside with the actual automatic-loading reason at ${width}`, async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width, height: width === 1366 ? 768 : 1080 });
  await boot(page, [box({ quantity: 3 }), box({ id: 'TOO-LONG', name: '차량보다 긴 박스', length: 20, quantity: 1 })]);
  await page.getByRole('button', { name: '메뉴', exact: true }).click();
  await page.locator('.header-menu-panel').getByRole('button', { name: /최종 적재 진행/ }).click();
  await expect(countRow(page, '현재 차량 배치량')).toHaveText(['0', '3'], { timeout: 120000 });
  await expect(countRow(page, '대기량')).toHaveText(['0', '1']);
  await expect(countRow(page, '대기 중 미적재량')).toHaveText(['0', '1']);
  await tools(page);
  await panel(page).getByRole('button', { name: '차량보다 긴 박스 선택', exact: true }).click();
  await expect(panel(page).locator('.staging-panel-reasons')).toBeVisible();
  await panel(page).getByRole('button', { name: '선택 화물 적재', exact: true }).click();
  await expect(countRow(page, '대기량')).toHaveText(['0', '1']);
  await expect(countRow(page, '현재 차량 배치량')).toHaveText(['0', '3']);
  await overviewScreenshot(page, `staging-unloaded-${width}.png`);
});

test(`mixed packaged pallets and loose boxes keep their full packaging on transfer and undo at ${width}`, async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width, height: width === 1366 ? 768 : 1080 });
  await boot(page, [box({ id: 'PALLET-BOX', name: '파렛트 구성 박스', quantity: 9, length: .5, width: .5,
    maxStackLayers: 3, maxTopLoadKg: 100, mixedLoadingMethod: 'pallet' }),
  box({ id: 'LOOSE', name: '혼합 낱박스', quantity: 2, length: .2, width: .2, height: .2, mixedLoadingMethod: 'direct' })], 'mixed', true);
  await expect(panel(page).getByText('포장 계획 계산 중', { exact: true })).toBeHidden({ timeout: 60000 });
  const totals = await countRow(page, '전체 준비량').allTextContents();
  const pallets = Number(totals[0].replaceAll(',', ''));
  expect(pallets).toBeGreaterThan(0);
  expect(totals[1]).toBe('2');
  await expect(panel(page).getByText('박스 총수량 11개 · 파렛트 내부 포함', { exact: true })).toBeVisible();
  await tools(page);
  const pallet = panel(page).locator('[data-staging-unit-id]').filter({ has: page.getByText('포장 파렛트', { exact: false }) }).first();
  const id = await pallet.getAttribute('data-staging-unit-id');
  await pallet.click();
  const contents = await panel(page).locator('.staging-panel-packaging').innerText();
  expect(contents).toContain('랩핑 사용'); expect(contents).toContain('각대 사용');
  await panel(page).getByRole('button', { name: '선택 화물 적재', exact: true }).click();
  await expect(countRow(page, '현재 차량 배치량')).toHaveText(['1', '0']);
  await expect(countRow(page, '대기량')).toHaveText([String(pallets - 1), '2']);
  await expect(panel(page).getByText(id!, { exact: true })).toBeVisible();
  await panel(page).getByRole('button', { name: '대기장으로 회수', exact: true }).click();
  await expect(countRow(page, '대기량')).toHaveText([String(pallets), '2']);
  await expect(panel(page).getByText(id!, { exact: true })).toBeVisible();
  await expect(panel(page).locator('.staging-panel-packaging')).toHaveText(contents, { useInnerText: true });
  await panel(page).getByRole('button', { name: '되돌리기', exact: true }).click();
  await expect(countRow(page, '현재 차량 배치량')).toHaveText(['1', '0']);
  await expect(panel(page).getByText('박스 총수량 11개 · 파렛트 내부 포함', { exact: true })).toBeVisible();
  await overviewScreenshot(page, `staging-mixed-${width}.png`);
  await chooseView(page, '대기장 보기');
  await page.screenshot({ path: test.info().outputPath(`staging-mixed-yard-${width}.png`) });
});
}

test('real canvas drag rejects an outside drop and revalidates a vehicle drop', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await boot(page, [box({ quantity: 1 })]);
  const viewer = page.locator('.viewer-host .three-comparison-viewer');
  const canvas = viewer.locator('canvas');
  const layout = buildStagingYardLayout([{ id: 'box', kind: 'box', cargoId: 'YARD-BOX', length: .5, width: .4, height: .3 }], { container, vehicleRig: 'articulated' });
  async function screen(point: [number, number, number]) {
    const rect = (await canvas.boundingBox())!;
    const pose = (await viewer.getAttribute('data-three-camera-pose'))!.split(',').map(Number);
    const camera = new PerspectiveCamera(40, rect.width / rect.height, .02, 500);
    camera.position.fromArray(pose); camera.quaternion.fromArray(pose.slice(3)); camera.updateMatrixWorld(true);
    const p = new Vector3(...point).project(camera);
    return { x: rect.x + (p.x + 1) * rect.width / 2, y: rect.y + (1 - p.y) * rect.height / 2 };
  }
  async function beginDrag() {
    const [x, y, z] = layout.slots[0].center;
    const source = await screen([x, y + .2, z]);
    await page.mouse.move(source.x, source.y); await page.mouse.down();
  }
  await beginDrag();
  const invalid = await screen([container.length / 2 + 1, 0, 0]);
  await page.mouse.move(invalid.x, invalid.y, { steps: 12 });
  await expect(panel(page).locator('.staging-panel-preview.invalid')).toBeVisible();
  await page.mouse.up();
  await expect(countRow(page, '현재 차량 배치량')).toHaveText(['0', '0']);
  await expect(countRow(page, '대기량')).toHaveText(['0', '1']);
  await beginDrag();
  const valid = await screen([0, 0, 0]);
  await page.mouse.move(valid.x, valid.y, { steps: 12 });
  await expect(panel(page).locator('.staging-panel-preview.valid')).toBeVisible();
  await page.mouse.up();
  await expect(countRow(page, '현재 차량 배치량')).toHaveText(['0', '1']);
  await expect(countRow(page, '대기량')).toHaveText(['0', '0']);
});

test('quality and GTAO switches preserve the real workspace, selection, camera and plan', async ({ page }, info) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await boot(page, [box()]);
  await tools(page);
  const first = panel(page).locator('[data-staging-unit-id]').first();
  const id = await first.getAttribute('data-staging-unit-id');
  await first.click();
  await panel(page).getByRole('button', { name: '선택 화물 적재', exact: true }).click();
  await expect(countRow(page, '현재 차량 배치량')).toHaveText(['0', '1']);
  await chooseView(page, '전체 보기');
  const viewer = page.locator('.viewer-host .three-comparison-viewer');
  await expect(viewer).toHaveAttribute('data-three-camera-moving', 'false');
  const camera = await viewer.getAttribute('data-three-camera-pose');
  const revision = await viewer.getAttribute('data-three-plan-revision');
  const result = await page.evaluate(() => JSON.stringify((window as any).__containerLoadingLatestResult.result));
  const observations = [];
  for (const quality of ['performance', 'standard', 'high']) {
    await panel(page).getByLabel('3D 품질', { exact: true }).selectOption(quality);
    await expect(viewer).toHaveAttribute('data-three-render-path', quality === 'performance' ? 'direct' : 'gtao');
    await expect(viewer).toHaveAttribute('data-three-plan-revision', revision!);
    await expect(viewer).toHaveAttribute('data-three-camera-pose', camera!);
    await expect(countRow(page, '전체 준비량')).toHaveText(['0', '20']);
    await expect(countRow(page, '대기량')).toHaveText(['0', '19']);
    await expect(panel(page).getByText(id!, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => JSON.stringify((window as any).__containerLoadingLatestResult.result))).toBe(result);
    observations.push({ quality, path: await viewer.getAttribute('data-three-render-path'), aoWidth: await viewer.getAttribute('data-three-ao-width'), calls: await viewer.getAttribute('data-three-render-calls'), triangles: await viewer.getAttribute('data-three-triangles') });
  }
  await panel(page).getByLabel('접촉 음영', { exact: true }).uncheck();
  await expect(viewer).toHaveAttribute('data-three-render-path', 'direct');
  await expect(viewer).toHaveAttribute('data-three-camera-pose', camera!);
  expect(await page.evaluate(() => JSON.stringify((window as any).__containerLoadingLatestResult.result))).toBe(result);
  await info.attach('workspace-quality-observations', { body: JSON.stringify(observations), contentType: 'application/json' });
});

test('explicit view motion yields to user zoom and respects reduced motion without moving cargo', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await boot(page, [box({ quantity: 1 })]);
  const viewer = page.locator('.viewer-host .three-comparison-viewer');
  await panel(page).getByLabel('3D 품질', { exact: true }).selectOption('performance');
  await expect(viewer).toHaveAttribute('data-three-render-path', 'direct');
  const originalCamera = await viewer.getAttribute('data-three-camera-pose');
  await panel(page).getByRole('button', { name: '대기장 보기', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-three-camera-moving', 'true');
  const rect = (await viewer.locator('canvas').boundingBox())!;
  await page.mouse.move(rect.x + rect.width * .45, rect.y + rect.height * .75);
  await page.mouse.wheel(0, -100);
  await expect(viewer).toHaveAttribute('data-three-camera-moving', 'false');
  await expect(countRow(page, '전체 준비량')).toHaveText(['0', '1']);
  await expect(countRow(page, '현재 차량 배치량')).toHaveText(['0', '0']);
  await chooseView(page, '전체 보기');
  await expect(viewer).toHaveAttribute('data-three-camera-pose', originalCamera!);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await chooseView(page, '대기장 보기');
  await expect(viewer).not.toHaveAttribute('data-three-camera-pose', originalCamera!);
  await expect(countRow(page, '대기량')).toHaveText(['0', '1']);
});
