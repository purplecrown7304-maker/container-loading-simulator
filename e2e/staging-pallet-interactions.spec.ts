import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from 'three';
import type { CargoItem, ContainerSpec, Placement } from '../src/engine/types';
import type { PalletLoad } from '../src/engine/palletOptimization';
import { PALLET_CATALOG, palletSpecForType } from '../src/engine/palletCatalog';
import { packMixedMode } from '../src/engine/mixedModePacking';
import { stagingInputSignature } from '../src/stagingInventory';

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });
const container: ContainerSpec = { length: 12.032, width: 2.35, height: 2.7, maxPayloadKg: 28600,
  floorLoadLimitKgPerM2: 1500, floorLoadWarningMultiplier: 3, ceilingClearanceM: .05 };
const cargo: CargoItem[] = [{ id: 'PALLET-BOX', name: '파렛트 구성 박스', quantity: 9, length: .5, width: .5, height: .3,
  weightKg: 1, maxStackLayers: 3, maxTopLoadKg: 100, allowRotation: true, mixedLoadingMethod: 'pallet' },
{ id: 'LOOSE', name: '혼합 낱박스', quantity: 2, length: .2, width: .2, height: .2, weightKg: 1,
  maxStackLayers: 1, maxTopLoadKg: 0, allowRotation: true, mixedLoadingMethod: 'direct' }];
const panel = (page: Page) => page.locator('[data-staging-yard-panel]');
// A pallet miniature is a second real viewer. Keep root assertions anchored to
// the persistent main inertia host rather than matching both canvases.
const viewer = (page: Page) => page.locator('.viewer-host > .inertia-canvas-host > .renderer-comparison > .three-comparison-viewer');
const canvas = (page: Page) => viewer(page).locator('canvas');
function countRow(page: Page, name: string) {
  return panel(page).locator('.staging-panel-counts > div').filter({ has: page.getByText(name, { exact: true }) }).locator('dd > span');
}
type Accepted = { pallets: PalletLoad[]; placements: Placement[]; certification: unknown; clears: number };
async function accepted(page: Page): Promise<Accepted> {
  return page.evaluate(() => {
    const browser = window as any;
    return { pallets: browser.__containerLoadingPalletSnapshot?.result.pallets ?? [],
      placements: browser.__containerLoadingPalletSnapshot?.result.placements ?? [],
      certification: browser.__containerLoadingLatestCertification ?? null, clears: browser.__palletInteractionCertClears ?? 0 };
  });
}

/** Minimal copy of the mixed wrapped9 + loose2 cloud fixture from staging-yard.
 * Native pointer input and the real pack/move validators own all plan changes. */
async function boot(page: Page) {
  const userId = 'staging-pallet-pointer-fixture', mode = 'mixed' as const;
  const spec = { ...palletSpecForType(PALLET_CATALOG[0]), useWrapping: true, useCornerGuards: true, minimizePackaging: false };
  const source = { container, cargo, result: { placements: [], remaining: [], loadedWeightKg: 0, usedVolumeM3: 0, validationIssues: [] },
    staging: { version: 1, scopeKey: `operator:${userId}|active`, mode,
      inputSignature: stagingInputSignature({ scopeKey: `operator:${userId}|active`, mode, container, cargo, palletSpec: spec, strategy: 'capacity' }),
      selectedUnitId: null, identity: { unitToStableId: {} },
      palletSnapshot: { spec, result: packMixedMode(container, [], spec, 'capacity') }, palletTypeId: 'company-default' } };
  let appState: Record<string, string> = { 'container-loading-simulator-v1': JSON.stringify(source),
    'container-loading:guided-loading-unit': mode, 'container-loading:guided-loading-strategy': 'capacity' };
  const member = { id: userId, displayName: '파렛트 포인터 검증', email: 'pallet-pointer@example.test', status: 'active' };
  await page.addInitScript(({ userId }) => {
    localStorage.setItem('load-studio-ui-language', 'ko');
    sessionStorage.setItem('container-loading:supabase-member-session:v2', JSON.stringify({
      token: 'synthetic-pallet-pointer-token', expiresAt: new Date(Date.now() + 3600000).toISOString(),
      userId, displayName: '파렛트 포인터 검증', email: 'pallet-pointer@example.test',
    }));
    // Observe actual invalidation; never fabricate a certification or dispatch a
    // placement/drop event. A missing prior PASS is kept honestly missing.
    (window as any).__palletInteractionCertClears = 0;
    window.addEventListener('container-loading:inertia-certification-result', event => {
      // The DOM normalizes an omitted/undefined CustomEvent payload to null.
      if ((event as CustomEvent).detail == null) (window as any).__palletInteractionCertClears++;
    });
  }, { userId });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (!url.pathname.endsWith('/functions/v1/container-member-api')) return route.abort();
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST,OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (route.request().method() === 'GET') return route.fulfill({ headers, json: { ok: true, member } });
    const body = route.request().postDataJSON() ?? {};
    if (body.action === 'get_data') return route.fulfill({ headers, json: { ok: true,
      data: { appState, plannerState: null, personalBoxes: [], schemaVersion: 1 } } });
    if (body.action === 'save_data') {
      appState = body.appState; return route.fulfill({ headers, json: { ok: true, updatedAt: '2026-11-18T00:00:00Z' } });
    }
    if (body.action === 'me') return route.fulfill({ headers, json: { ok: true, member } });
    return route.fulfill({ status: 400, headers, json: { error: 'fixture_action_not_supported' } });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(panel(page)).toBeVisible();
  await expect(viewer(page)).toHaveAttribute('data-three-ready', 'true', { timeout: 60000 });
  await expect(page.locator('.guided-job-summary > dl').getByText('혼합 적재', { exact: true })).toBeVisible();
  await expect(panel(page).getByText('포장 계획 계산 중', { exact: true })).toBeHidden({ timeout: 60000 });
  await expect(countRow(page, '전체 준비량').first()).toHaveText(/^[1-9][\d,]*$/);
  const totalPallets = Number((await countRow(page, '전체 준비량').first().innerText()).replaceAll(',', ''));
  await expect(countRow(page, '전체 준비량')).toHaveText([String(totalPallets), '2']);
  await panel(page).getByLabel('3D 품질', { exact: true }).selectOption('performance');
  await expect(viewer(page)).toHaveAttribute('data-three-render-path', 'direct');
  const tools = panel(page).locator('.staging-panel-tools');
  if (!(await tools.evaluate(element => (element as HTMLDetailsElement).open))) await tools.locator('summary').click();
  const pallet = panel(page).locator('[data-staging-unit-id]').filter({ has: page.getByText('포장 파렛트', { exact: false }) }).first();
  const id = await pallet.getAttribute('data-staging-unit-id'); expect(id).toBeTruthy(); await pallet.click();
  await panel(page).getByRole('button', { name: '선택 화물 적재', exact: true }).click();
  await expect(countRow(page, '현재 차량 배치량')).toHaveText(['1', '0']);
  await expect(countRow(page, '대기량')).toHaveText([String(totalPallets - 1), '2']);
  await expect(viewer(page)).toHaveAttribute('data-three-applied', 'true', { timeout: 60000 });
  await expect(viewer(page)).toHaveAttribute('data-three-flight-active', 'false');
  await expect(panel(page).getByLabel('화물 이동 연출', { exact: true })).toBeDisabled();
  await expect(viewer(page)).toHaveAttribute('data-three-camera-request', /.+/);
  const previousRequest = await viewer(page).getAttribute('data-three-camera-request');
  await viewer(page).getByRole('button', { name: '상단', exact: true }).click();
  await expect(viewer(page)).not.toHaveAttribute('data-three-camera-request', previousRequest!);
  await expect(viewer(page)).toHaveAttribute('data-three-camera-moving', 'false');
  await viewer(page).getByRole('button', { name: '외벽 숨기기', exact: true }).click();
  await canvas(page).evaluate(element => element.setAttribute('data-pallet-persistent-canvas', 'original'));
  const plan = await accepted(page); expect(plan.pallets).toHaveLength(1);
  expect(plan.pallets[0].wrappingUsed).toBe(true); expect(plan.pallets[0].cornerGuardsUsed).toBe(true);
  return { id: id!, totalPallets, plan };
}

async function projection(page: Page) {
  await expect(viewer(page)).toHaveAttribute('data-three-applied', 'true', { timeout: 60000 });
  await expect(viewer(page)).toHaveAttribute('data-three-camera-moving', 'false');
  const rect = await canvas(page).boundingBox(); expect(rect).not.toBeNull();
  const pose = (await viewer(page).getAttribute('data-three-camera-pose'))!.split(',').map(Number);
  const camera = new PerspectiveCamera(40, rect!.width / rect!.height, .02, 500);
  camera.position.fromArray(pose); camera.quaternion.fromArray(pose.slice(3)); camera.updateMatrixWorld(true);
  const screen = (world: Vector3) => {
    const point = world.clone().project(camera);
    return { x: rect!.x + (point.x + 1) * rect!.width / 2, y: rect!.y + (1 - point.y) * rect!.height / 2 };
  };
  return { rect: rect!, camera, screen };
}
function topBox(pallet: PalletLoad) {
  return pallet.cargoPlacements.reduce((highest, box) => box.z + box.height > highest.z + highest.height ? box : highest);
}
function boxCenter(box: Placement) {
  return new Vector3(box.x + box.length / 2 - container.length / 2, box.z + box.height / 2,
    box.y + box.width / 2 - container.width / 2);
}
async function beginPalletDrag(page: Page, pallet: PalletLoad, desiredX: number, desiredY: number) {
  const view = await projection(page), source = view.screen(boxCenter(topBox(pallet)));
  const ray = new Raycaster();
  ray.setFromCamera(new Vector2((source.x - view.rect.x) / view.rect.width * 2 - 1,
    1 - (source.y - view.rect.y) / view.rect.height * 2), view.camera);
  const floorGrip = ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -pallet.z), new Vector3());
  expect(floorGrip).not.toBeNull();
  // Preserve the actual off-centre grip, exactly as a user's pointer movement
  // does; projecting the target pallet centre would test a different operation.
  const destination = view.screen(floorGrip!.add(new Vector3(desiredX - pallet.x, 0, desiredY - pallet.y)));
  expect(Math.hypot(destination.x - source.x, destination.y - source.y)).toBeGreaterThan(4);
  await page.mouse.move(source.x, source.y); await page.mouse.down();
  await page.mouse.move(destination.x, destination.y, { steps: 12 });
}
async function summary(page: Page, pallets: number, loose = 0) {
  await expect(countRow(page, '현재 차량 배치량')).toHaveText(['1', String(loose)]);
  await expect(countRow(page, '대기량')).toHaveText([String(pallets - 1), String(2 - loose)]);
  await expect(countRow(page, '전체 준비량')).toHaveText([String(pallets), '2']);
  await expect(panel(page).getByText('박스 총수량 11개 · 파렛트 내부 포함', { exact: true })).toBeVisible();
}
async function screenshot(page: Page, info: TestInfo, name: string) {
  const bytes = await page.screenshot({ path: info.outputPath(`${name}.png`) });
  await info.attach(name, { body: bytes, contentType: 'image/png' });
  if (process.env.QA_OUTPUT_DIR) {
    const directory = resolve(process.env.QA_OUTPUT_DIR); await mkdir(directory, { recursive: true });
    await writeFile(join(directory, `${info.project.name}-${name}.png`), bytes);
  }
}

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    await page.screenshot({ path: info.outputPath('pallet-pointer-failure.png') });
    await info.attach('pallet-pointer-state', { contentType: 'application/json', body: JSON.stringify({
      accepted: await accepted(page), camera: await viewer(page).evaluateAll(elements => elements.map(element => element.getAttribute('data-three-camera-pose'))),
      preview: await panel(page).locator('.staging-panel-preview').allTextContents(),
    }, null, 2) });
  }
});

test('native right-click on a loaded pallet carton opens an isolated real miniature without changing the accepted plan', async ({ page }, info) => {
  test.setTimeout(180000); await page.setViewportSize({ width: 1920, height: 1080 });
  const setup = await boot(page), before = await accepted(page), camera = await viewer(page).getAttribute('data-three-camera-pose');
  const revision = await viewer(page).getAttribute('data-three-plan-revision'), view = await projection(page);
  const source = view.screen(boxCenter(topBox(before.pallets[0])));
  await page.mouse.click(source.x, source.y, { button: 'right' });
  const dialog = page.locator('.staging-pallet-details [role="dialog"]');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleName(`AUTO-PALLET-${String(before.pallets[0].palletIndex).padStart(2, '0')} 적재 정보`);
  const miniature = dialog.locator('.pallet-mini-canvas .three-comparison-viewer');
  await expect(miniature).toHaveAttribute('data-three-ready', 'true', { timeout: 60000 });
  await expect(miniature.locator('canvas')).toHaveCount(1);
  await expect(miniature).toHaveAttribute('data-three-count', String(before.pallets[0].cargoPlacements.length));
  await expect(miniature.locator('[data-three-staging-yard]')).toHaveCount(0);
  await expect(dialog.locator('.pallet-content-list article')).toHaveCount(1);
  await expect(dialog.locator('.pallet-content-list article b')).toContainText('PALLET-BOX 파렛트 구성 박스');
  await expect(dialog.locator('.pallet-content-list article strong')).toHaveText(`${before.pallets[0].cargoPlacements.length} EA`);
  await expect(page.locator('.viewer-host canvas')).toHaveCount(2);
  await summary(page, setup.totalPallets);
  expect(await accepted(page)).toEqual(before);
  await expect(viewer(page)).toHaveAttribute('data-three-camera-pose', camera!);
  await expect(viewer(page)).toHaveAttribute('data-three-plan-revision', revision!);
  await expect(canvas(page)).toHaveAttribute('data-pallet-persistent-canvas', 'original');
  await screenshot(page, info, 'staging-pallet-right-click-miniature');
  await dialog.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(dialog).toHaveCount(0); await expect(page.locator('.viewer-host canvas')).toHaveCount(1);
  expect(await accepted(page)).toEqual(before);
  await expect(panel(page).locator('.staging-panel-unit-id')).toHaveText(setup.id);
});

test('native left drag relocates the whole wrapped pallet on its floor plane, invalidates certification and supports undo', async ({ page }, info) => {
  test.setTimeout(180000); await page.setViewportSize({ width: 1920, height: 1080 });
  const setup = await boot(page), before = await accepted(page), original = before.pallets[0];
  const camera = await viewer(page).getAttribute('data-three-camera-pose');
  const dx = original.x + original.length + .2 < container.length ? .2 : -.2;
  await beginPalletDrag(page, original, original.x + dx, original.y);
  await expect(panel(page).locator('.staging-panel-preview.valid')).toBeVisible();
  await screenshot(page, info, 'staging-pallet-valid-drag-preview');
  await page.mouse.up();
  await expect.poll(async () => (await accepted(page)).pallets[0]?.x).not.toBe(original.x);
  const after = await accepted(page), moved = after.pallets[0];
  expect(moved.x - original.x).toBeCloseTo(dx, 2); expect(moved.y).toBeCloseTo(original.y, 2); expect(moved.z).toBe(original.z);
  expect(moved.palletIndex).toBe(original.palletIndex);
  expect(moved.wrappingUsed).toBe(true); expect(moved.cornerGuardsUsed).toBe(true); expect(moved.bandingPlan).toEqual(original.bandingPlan);
  expect(moved.cargoPlacements.map(box => box.unitId).sort()).toEqual(original.cargoPlacements.map(box => box.unitId).sort());
  for (const member of moved.cargoPlacements) {
    const previous = original.cargoPlacements.find(box => box.unitId === member.unitId)!;
    expect(member.x - moved.x).toBeCloseTo(previous.x - original.x, 8);
    expect(member.y - moved.y).toBeCloseTo(previous.y - original.y, 8);
    expect(member.z - moved.z).toBeCloseTo(previous.z - original.z, 8);
  }
  expect(after.placements).toHaveLength(before.placements.length); expect(after.clears).toBeGreaterThan(before.clears); expect(after.certification).toBeNull();
  await summary(page, setup.totalPallets);
  await expect(panel(page).locator('.staging-panel-unit-id')).toHaveText(setup.id);
  await expect(viewer(page)).toHaveAttribute('data-three-camera-pose', camera!);
  await expect(canvas(page)).toHaveAttribute('data-pallet-persistent-canvas', 'original');
  await expect(viewer(page)).toHaveAttribute('data-three-applied', 'true', { timeout: 60000 });
  await screenshot(page, info, 'staging-pallet-accepted-move');
  const undo = panel(page).getByRole('button', { name: '되돌리기', exact: true }); await expect(undo).toBeEnabled(); await undo.click();
  await expect.poll(async () => (await accepted(page)).pallets[0]?.x).toBe(original.x);
  const restored = await accepted(page); expect(restored.pallets).toEqual(before.pallets); expect(restored.placements).toEqual(before.placements);
  expect(restored.certification).toBeNull(); await summary(page, setup.totalPallets);
});

test('native outside and collision drags show actual invalid candidates and preserve every accepted pallet member', async ({ page }) => {
  test.setTimeout(180000); await page.setViewportSize({ width: 1920, height: 1080 });
  const setup = await boot(page), beforeOutside = await accepted(page), original = beforeOutside.pallets[0];
  await beginPalletDrag(page, original, -.15, original.y);
  await expect(panel(page).locator('.staging-panel-preview.invalid')).toBeVisible();
  await page.mouse.up(); expect(await accepted(page)).toEqual(beforeOutside);
  await summary(page, setup.totalPallets);
  await panel(page).getByRole('button', { name: '혼합 낱박스 선택', exact: true }).first().click();
  await panel(page).getByRole('button', { name: '선택 화물 적재', exact: true }).click();
  await summary(page, setup.totalPallets, 1);
  const beforeCollision = await accepted(page), obstacle = beforeCollision.placements.find(box => box.cargoId === 'LOOSE')!;
  expect(obstacle).toBeDefined(); expect(obstacle.z).toBe(0);
  const source = beforeCollision.pallets[0];
  const x = Math.max(0, Math.min(container.length - source.length, obstacle.x));
  const y = Math.max(0, Math.min(container.width - source.width, obstacle.y));
  await beginPalletDrag(page, source, x, y);
  await expect(panel(page).locator('.staging-panel-preview.invalid')).toBeVisible();
  await expect(panel(page).locator('.staging-panel-preview.invalid')).toContainText('충돌');
  await page.mouse.up(); expect(await accepted(page)).toEqual(beforeCollision);
  await summary(page, setup.totalPallets, 1);
  await expect(panel(page).locator('.staging-panel-unit-id')).toHaveText(setup.id);
  await expect(canvas(page)).toHaveAttribute('data-pallet-persistent-canvas', 'original');
});
