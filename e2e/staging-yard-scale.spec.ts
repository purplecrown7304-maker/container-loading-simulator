import { expect, test, type Locator, type Page } from '@playwright/test';
import type { CargoItem, ContainerSpec } from '../src/engine/types';
import { PerspectiveCamera, Vector3 } from 'three';
import { buildStagingYardLayout } from '../src/stagingYardLayout';

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });

const container: ContainerSpec = { length: 12.032, width: 2.35, height: 2.7, maxPayloadKg: 28600,
  floorLoadLimitKgPerM2: 1500, floorLoadWarningMultiplier: 3, ceilingClearanceM: .05 };
const cargo: CargoItem[] = [{ id: 'YARD-SCALE', name: '대량 대기 박스', length: .5, width: .4, height: .3,
  weightKg: 1, quantity: 5000, maxStackLayers: 1, maxTopLoadKg: 0, allowRotation: true }];

/** Isolated synthetic account/cloud state. Real member endpoints are never used. */
async function boot(page: Page) {
  let appState: Record<string, string> = {
    'container-loading-simulator-v1': JSON.stringify({ container, cargo }),
    'container-loading:guided-loading-unit': 'boxes',
    'container-loading:guided-loading-strategy': 'capacity',
  };
  const userId = 'staging-scale-browser-fixture';
  const member = { id: userId, displayName: '대량 대기장 검증', email: 'staging-scale@example.test', status: 'active' };
  await page.addInitScript(({ userId }) => {
    localStorage.setItem('load-studio-ui-language', 'ko');
    sessionStorage.setItem('container-loading:supabase-member-session:v2', JSON.stringify({
      token: 'synthetic-staging-scale-token', expiresAt: new Date(Date.now() + 3600000).toISOString(),
      userId, displayName: '대량 대기장 검증', email: 'staging-scale@example.test',
    }));
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
      appState = body.appState;
      return route.fulfill({ headers, json: { ok: true, updatedAt: '2026-11-17T00:00:00Z' } });
    }
    if (body.action === 'me') return route.fulfill({ headers, json: { ok: true, member } });
    return route.fulfill({ status: 400, headers, json: { error: 'fixture_action_not_supported' } });
  });
  await page.goto('/');
  await expect(page.locator('[data-staging-yard-panel]')).toBeVisible();
  await expect(page.locator('.viewer-host .three-comparison-viewer')).toHaveAttribute('data-three-ready', 'true', { timeout: 60000 });
}

const panel = (page: Page) => page.locator('[data-staging-yard-panel]');
function countRow(page: Page, name: string) {
  return panel(page).locator('.staging-panel-counts > div').filter({ has: page.getByText(name, { exact: true }) }).locator('dd > span');
}
async function conservedSummary(page: Page) {
  await expect(countRow(page, '전체 준비량')).toHaveText(['0', '5,000']);
  await expect(countRow(page, '현재 차량 배치량')).toHaveText(['0', '0']);
  await expect(countRow(page, '대기량')).toHaveText(['0', '5,000']);
  await expect(countRow(page, '대기 중 미적재량')).toHaveText(['0', '0']);
  await expect(page.locator('.viewer-host .three-comparison-viewer')).toHaveAttribute('data-three-count', '0');
}
async function observations(viewer: Locator) {
  await expect(viewer).toHaveAttribute('data-three-camera-moving', 'false');
  await expect(viewer).toHaveAttribute('data-three-ready-ms', /^\d+(?:\.\d+)?$/);
  await expect(viewer).toHaveAttribute('data-three-geometries', /^[1-9]\d*$/);
  await expect(viewer).toHaveAttribute('data-three-render-calls', /^[1-9]\d*$/);
  await expect(viewer).toHaveAttribute('data-three-camera-pose', /.+/);
  return viewer.evaluate(element => ({
    viewerReadyMs: Number(element.getAttribute('data-three-ready-ms')),
    geometries: Number(element.getAttribute('data-three-geometries')),
    renderCalls: Number(element.getAttribute('data-three-render-calls')),
    triangles: Number(element.getAttribute('data-three-triangles')),
    quality: element.getAttribute('data-three-quality'),
    renderPath: element.getAttribute('data-three-render-path'),
    cameraPose: element.getAttribute('data-three-camera-pose'),
  }));
}

test('5000 loose boxes preserve totals while paging four of 625 staging zones and returning the overview to page one', async ({ page }, info) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const started = performance.now();
  await boot(page);
  const bootElapsedMs = performance.now() - started;
  const viewer = page.locator('.viewer-host .three-comparison-viewer');
  const canvas = viewer.locator('canvas');
  await expect(canvas).toHaveCount(1);
  await canvas.evaluate(element => element.setAttribute('data-scale-persistent-canvas', 'original'));
  await conservedSummary(page);
  const details = panel(page).locator('.staging-panel-tools');
  if (!(await details.evaluate(element => (element as HTMLDetailsElement).open))) await details.locator('summary').click();
  const zones = panel(page).locator('.staging-panel-zones');
  const zonePage = zones.locator('.staging-panel-pagination > span');
  await expect(zones.getByText('표시 4구역 / 전체 625구역', { exact: true })).toBeVisible();
  await expect(zones.getByText('A · B · C · D', { exact: true })).toBeVisible();
  await expect(zonePage).toHaveText('1 / 157 구역 페이지');
  await expect(zones.getByRole('button', { name: '이전 구역', exact: true })).toBeDisabled();
  // The scene resource regression separately verifies 32 rendered units for this
  // four-zone window. Here only public UI and existing renderer metrics are read.
  const firstPage = await observations(viewer);

  const pageStarted = performance.now();
  await zones.getByRole('button', { name: '다음 구역', exact: true }).click();
  await expect(zonePage).toHaveText('2 / 157 구역 페이지');
  await expect(zones.getByText('E · F · G · H', { exact: true })).toBeVisible();
  await expect(zones.getByText('표시 4구역 / 전체 625구역', { exact: true })).toBeVisible();
  await expect(panel(page).getByRole('button', { name: '대기장 보기', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(viewer).not.toHaveAttribute('data-three-camera-pose', firstPage.cameraPose!);
  await conservedSummary(page);
  const secondPage = await observations(viewer);
  const nextPageElapsedMs = performance.now() - pageStarted;

  await panel(page).getByRole('button', { name: '전체 보기', exact: true }).click();
  await expect(zonePage).toHaveText('1 / 157 구역 페이지');
  await expect(zones.getByText('A · B · C · D', { exact: true })).toBeVisible();
  await expect(zones.getByRole('button', { name: '이전 구역', exact: true })).toBeDisabled();
  await expect(panel(page).getByRole('button', { name: '전체 보기', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(viewer).toHaveAttribute('data-three-camera-pose', firstPage.cameraPose!);
  await conservedSummary(page);
  await expect(canvas).toHaveAttribute('data-scale-persistent-canvas', 'original');
  const first = panel(page).locator('[data-staging-unit-id]').first(), firstId = await first.getAttribute('data-staging-unit-id');
  await first.click();
  await expect(panel(page).getByText(firstId!, { exact: true })).toBeVisible();
  const layout = buildStagingYardLayout(Array.from({ length: 5000 }, (_, index) => ({ id: String(index), kind: 'box' as const,
    cargoId: 'YARD-SCALE', length: .5, width: .4, height: .3 })), { container, vehicleRig: 'articulated' });
  async function screen(point: [number, number, number]) {
    const rect = (await canvas.boundingBox())!, pose = (await viewer.getAttribute('data-three-camera-pose'))!.split(',').map(Number);
    const camera = new PerspectiveCamera(40, rect.width / rect.height, .02, 500);
    camera.position.fromArray(pose); camera.quaternion.fromArray(pose.slice(3)); camera.updateMatrixWorld(true);
    const p = new Vector3(...point).project(camera);
    return { x: rect.x + (p.x + 1) * rect.width / 2, y: rect.y + (1 - p.y) * rect.height / 2 };
  }
  const [sx, sy, sz] = layout.slots[0].center;
  const source = await screen([sx, sy + .2, sz]), destination = await screen([0, 0, 0]);
  await page.mouse.move(source.x, source.y); await page.mouse.down();
  await page.mouse.move(destination.x, destination.y, { steps: 12 });
  await expect(panel(page).locator('.staging-panel-preview.valid')).toBeVisible();
  await page.mouse.up();
  await expect(countRow(page, '현재 차량 배치량')).toHaveText(['0', '1']);
  await expect(countRow(page, '대기량')).toHaveText(['0', '4,999']);
  await expect(countRow(page, '전체 준비량')).toHaveText(['0', '5,000']);
  await expect(viewer).toHaveAttribute('data-three-camera-pose', firstPage.cameraPose!);
  await expect(panel(page).getByText(firstId!, { exact: true })).toBeVisible();
  await panel(page).getByRole('button', { name: '되돌리기', exact: true }).click();
  await conservedSummary(page);
  await expect(page.locator('.guided-status-row[data-verification-status="passed"]')).toHaveCount(0);
  expect(errors).toEqual([]);
  await info.attach('staging-scale-observations', { contentType: 'application/json', body: JSON.stringify({
    preparedBoxes: 5000, totalZones: 625, visibleZones: 4, zonePageCount: 157,
    bootElapsedMs, nextPageElapsedMs, firstPage, secondPage, overview: await observations(viewer),
    timingScope: 'Node elapsed time and existing viewer readiness/render metrics; no FPS estimate.',
  }, null, 2) });
});
