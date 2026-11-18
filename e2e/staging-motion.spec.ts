import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { CargoItem, ContainerSpec } from '../src/engine/types';
import { PALLET_CATALOG, palletSpecForType } from '../src/engine/palletCatalog';
import { packOnPallets } from '../src/engine/palletOptimization';
import { stagingInputSignature } from '../src/stagingInventory';
import { expectThreeOnly } from './helpers/viewer';

test.use({ launchOptions: {
  // Playwright 1.60's PLAYWRIGHT_LEGACY_SCREENSHOT escape hatch removes this
  // exact forced feature. Use the same capture path only for these clock-driven
  // SwiftShader scenes; retain every other browser default and all real pixels.
  ignoreDefaultArgs: ['--enable-features=CDPScreenshotNewSurface'],
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
} });

const container: ContainerSpec = { length: 12.032, width: 2.35, height: 2.7, maxPayloadKg: 28600,
  floorLoadLimitKgPerM2: 1500, floorLoadWarningMultiplier: 3, ceilingClearanceM: .05 };
const box = (extra: Partial<CargoItem> = {}): CargoItem => ({ id: 'MOTION-BOX', name: '이동 연출 검증 박스',
  length: .5, width: .4, height: .3, weightKg: 1, quantity: 2, maxStackLayers: 1, maxTopLoadKg: 0, allowRotation: true, ...extra });
const panel = (page: Page) => page.locator('[data-staging-yard-panel]');
const viewer = (page: Page) => page.locator('.viewer-host .three-comparison-viewer');
function countRow(page: Page, name: string) {
  return panel(page).locator('.staging-panel-counts > div').filter({ has: page.getByText(name, { exact: true }) }).locator('dd > span');
}

/** Same isolated cloud boot contract as staging-yard.spec.ts; no real account or
 * service is used. Packing and every accepted loading command remain real. */
async function boot(page: Page, cargo: CargoItem[], wrapped = false) {
  const userId = 'staging-motion-browser-fixture', mode = wrapped ? 'pallets' : 'boxes';
  const source: Record<string, unknown> = { container, cargo };
  if (wrapped) {
    const spec = { ...palletSpecForType(PALLET_CATALOG[0]), useWrapping: true, useCornerGuards: true, minimizePackaging: false };
    source.result = { placements: [], remaining: [], loadedWeightKg: 0, usedVolumeM3: 0, validationIssues: [] };
    source.staging = { version: 1, scopeKey: `operator:${userId}|active`, mode,
      inputSignature: stagingInputSignature({ scopeKey: `operator:${userId}|active`, mode, container, cargo, palletSpec: spec, strategy: 'capacity' }),
      selectedUnitId: null, identity: { unitToStableId: {} },
      palletSnapshot: { spec, result: packOnPallets(container, [], spec, 'capacity') }, palletTypeId: 'company-default' };
  }
  let appState: Record<string, string> = { 'container-loading-simulator-v1': JSON.stringify(source),
    'container-loading:guided-loading-unit': mode, 'container-loading:guided-loading-strategy': 'capacity' };
  const member = { id: userId, displayName: '이동 연출 검증', email: 'staging-motion@example.test', status: 'active' };
  await page.addInitScript(({ userId }) => {
    localStorage.setItem('load-studio-ui-language', 'ko');
    sessionStorage.setItem('container-loading:supabase-member-session:v2', JSON.stringify({
      token: 'synthetic-staging-motion-token', expiresAt: new Date(Date.now() + 3600000).toISOString(),
      userId, displayName: '이동 연출 검증', email: 'staging-motion@example.test',
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
  await expect(panel(page)).toBeVisible();
  await expect(viewer(page)).toHaveAttribute('data-three-ready', 'true', { timeout: 60000 });
  await expect(page.locator('.guided-job-summary > dl').getByText(wrapped ? '파렛트 적재' : '박스 직접 적재', { exact: true })).toBeVisible();
  await expect(panel(page).getByText(`박스 총수량 ${cargo.reduce((sum, item) => sum + item.quantity, 0)}개 · 파렛트 내부 포함`, { exact: true })).toBeVisible();
  await expect(viewer(page)).toHaveAttribute('data-three-count', '0');
  await expectThreeOnly(page);
  await panel(page).getByLabel('3D 품질', { exact: true }).selectOption('performance');
  await expect(viewer(page)).toHaveAttribute('data-three-render-path', 'direct');
  await expect(viewer(page)).toHaveAttribute('data-three-camera-moving', 'false');
  await expect(viewer(page).locator('canvas')).toHaveCount(1);
  await viewer(page).locator('canvas').evaluate(element => element.setAttribute('data-motion-persistent-canvas', 'original'));
  const tools = panel(page).locator('.staging-panel-tools');
  if (!(await tools.evaluate(element => (element as HTMLDetailsElement).open))) await tools.locator('summary').click();
}

async function selectFirst(page: Page, pallet = false) {
  const units = panel(page).locator('[data-staging-unit-id]');
  const choice = pallet ? units.filter({ has: page.getByText('포장 파렛트', { exact: false }) }).first() : units.first();
  await expect(choice).toBeVisible();
  const id = await choice.getAttribute('data-staging-unit-id'); expect(id).toBeTruthy();
  await choice.click();
  await expect(panel(page).locator('.staging-panel-unit-id')).toHaveText(id!);
  return id!;
}

async function accepted(page: Page, pallets = false) {
  return page.evaluate(pallets => {
    const browser = window as any;
    const loading = browser.__containerLoadingLatestResult?.result;
    const pallet = browser.__containerLoadingPalletSnapshot;
    const current = pallets ? pallet?.result : loading;
    return { serialized: JSON.stringify({ loading, pallet }), boxCount: current?.placements?.length ?? 0,
      memberIds: (current?.placements ?? []).map((placement: any) => placement.unitId).sort(),
      packages: (pallet?.result?.pallets ?? []).map((load: any) => ({ wrapping: load.wrappingUsed,
        cornerGuards: load.cornerGuardsUsed, memberIds: load.cargoPlacements.map((placement: any) => placement.unitId).sort() })) };
  }, pallets);
}

async function observations(page: Page) {
  return viewer(page).evaluate(element => ({
    active: element.getAttribute('data-three-flight-active'), count: element.getAttribute('data-three-flight-count'),
    request: element.getAttribute('data-three-flight-request'), camera: element.getAttribute('data-three-camera-pose'),
    revision: element.getAttribute('data-three-plan-revision'), modelCount: element.getAttribute('data-three-model-count'),
    geometries: element.getAttribute('data-three-geometries'), textures: element.getAttribute('data-three-textures'),
    renderCalls: element.getAttribute('data-three-render-calls'),
  }));
}

/** Test-only Playwright clock control pauses the real RAF after its active frame.
 * No production duration, accepted plan, quantity or renderer API is changed. */
async function pauseInFlight(page: Page) {
  await expect(viewer(page)).toHaveAttribute('data-three-flight-active', 'true');
  await expect(viewer(page)).toHaveAttribute('data-three-flight-count', '1');
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  // 300 ms preparation, then 420 ms vertical ascent. Capture the cruise phase.
  await page.clock.runFor(800);
  await expect(viewer(page)).toHaveAttribute('data-three-flight-active', 'true');
  await expect(viewer(page)).toHaveAttribute('data-three-flight-count', '1');
  await expect(viewer(page)).toHaveAttribute('data-three-applied', 'true');
  await panel(page).evaluate(element => {
    for (let ancestor: HTMLElement | null = element as HTMLElement; ancestor; ancestor = ancestor.parentElement) ancestor.scrollTop = 0;
  });
}

async function screenshot(page: Page, info: TestInfo, name: string) {
  const bytes = await page.screenshot({ path: info.outputPath(`${name}.png`), timeout: 20000 });
  await info.attach(name, { body: bytes, contentType: 'image/png' });
  if (process.env.QA_OUTPUT_DIR) {
    const directory = resolve(process.env.QA_OUTPUT_DIR); await mkdir(directory, { recursive: true });
    await writeFile(join(directory, `${info.project.name}-${name}.png`), bytes);
  }
}

async function settled(page: Page, camera: string | null, active: Awaited<ReturnType<typeof observations>>) {
  await expect(viewer(page)).toHaveAttribute('data-three-flight-active', 'false');
  await expect(viewer(page)).toHaveAttribute('data-three-flight-count', '0');
  await expect(viewer(page)).toHaveAttribute('data-three-camera-pose', camera!);
  await expect(viewer(page)).toHaveAttribute('data-three-plan-revision', active.revision!);
  await expect(viewer(page)).toHaveAttribute('data-three-model-count', active.modelCount!);
  await expect(viewer(page).locator('canvas')).toHaveAttribute('data-motion-persistent-canvas', 'original');
  await expect(panel(page).getByRole('button', { name: '연출 건너뛰기', exact: true })).toHaveCount(0);
  await expect(page.locator('.guided-status-row[data-verification-status="passed"]')).toHaveCount(0);
}

test('a real manual box load animates accepted instances and naturally settles without changing the plan or camera', async ({ page }, info) => {
  test.setTimeout(120000); await page.setViewportSize({ width: 1920, height: 1080 });
  await page.clock.install();
  await boot(page, [box()]);
  const id = await selectFirst(page), camera = await viewer(page).getAttribute('data-three-camera-pose');
  await panel(page).getByRole('button', { name: '선택 화물 적재', exact: true }).click();
  await pauseInFlight(page);
  await expect(countRow(page, '전체 준비량')).toHaveText(['0', '2']);
  await expect(countRow(page, '현재 차량 배치량')).toHaveText(['0', '1']);
  await expect(countRow(page, '대기량')).toHaveText(['0', '1']);
  await expect(viewer(page)).toHaveAttribute('data-three-count', '1');
  await expect(viewer(page)).toHaveAttribute('data-three-supports', '0');
  await expect(viewer(page)).toHaveAttribute('data-three-camera-pose', camera!);
  const before = await accepted(page), active = await observations(page);
  expect(before.boxCount).toBe(1); expect(before.memberIds).toHaveLength(1);
  expect(before.memberIds.every((value: unknown) => typeof value === 'string' && value.length > 0)).toBe(true);
  await screenshot(page, info, 'staging-motion-box-in-flight');
  await page.clock.runFor(2000);
  await settled(page, camera, active);
  expect(await accepted(page)).toEqual(before);
  await expect(panel(page).locator('.staging-panel-unit-id')).toHaveText(id);
  await expect(countRow(page, '현재 차량 배치량')).toHaveText(['0', '1']);
  await expect(countRow(page, '대기량')).toHaveText(['0', '1']);
  // Natural settling and plan invariants were checked with the paused clock.
  // Restore the browser's frame scheduling before capturing the idle canvas.
  await page.clock.resume();
  await screenshot(page, info, 'staging-motion-box-final');
  await info.attach('box-motion-observations', { contentType: 'application/json', body: JSON.stringify({ active, final: await observations(page),
    clock: 'Test-only paused RAF with runFor; production timing is 300 ms preparation + 1500 ms vertical flight; no FPS estimate.' }, null, 2) });
});

test('a real wrapped whole pallet keeps all members and packaging when its movement is skipped', async ({ page }, info) => {
  test.setTimeout(120000); await page.setViewportSize({ width: 1920, height: 1080 });
  await page.clock.install();
  await boot(page, [box({ id: 'MOTION-PALLET', name: '이동 연출 포장 박스', quantity: 9, width: .5, maxStackLayers: 3, maxTopLoadKg: 100 })], true);
  await expect(panel(page).getByText('포장 계획 계산 중', { exact: true })).toBeHidden({ timeout: 60000 });
  await expect(countRow(page, '전체 준비량').first()).toHaveText(/^[1-9][\d,]*$/);
  const totals = await countRow(page, '전체 준비량').allTextContents(), palletCount = Number(totals[0].replaceAll(',', ''));
  expect(palletCount).toBeGreaterThan(0); expect(totals[1]).toBe('0');
  const id = await selectFirst(page, true), camera = await viewer(page).getAttribute('data-three-camera-pose');
  const packaging = await panel(page).locator('.staging-panel-packaging').innerText();
  expect(packaging).toContain('랩핑 사용'); expect(packaging).toContain('각대 사용');
  const memberCount = Number(await panel(page).locator('.staging-panel-selection dl > div').filter({ has: page.getByText('박스 수량', { exact: true }) }).locator('dd').innerText());
  expect(memberCount).toBeGreaterThan(1);
  await panel(page).getByRole('button', { name: '선택 화물 적재', exact: true }).click();
  await pauseInFlight(page);
  await expect(countRow(page, '현재 차량 배치량')).toHaveText(['1', '0']);
  await expect(countRow(page, '대기량')).toHaveText([String(palletCount - 1), '0']);
  await expect(panel(page).getByText('박스 총수량 9개 · 파렛트 내부 포함', { exact: true })).toBeVisible();
  await expect(viewer(page)).toHaveAttribute('data-three-count', String(memberCount));
  await expect(viewer(page)).toHaveAttribute('data-three-supports', '1');
  const before = await accepted(page, true), active = await observations(page);
  expect(before.boxCount).toBe(memberCount); expect(before.memberIds).toHaveLength(memberCount);
  expect(before.packages).toEqual([{ wrapping: true, cornerGuards: true, memberIds: before.memberIds }]);
  expect(new Set(before.memberIds).size).toBe(memberCount);
  await screenshot(page, info, 'staging-motion-wrapped-pallet-in-flight');
  await panel(page).getByRole('button', { name: '연출 건너뛰기', exact: true }).click();
  await page.clock.runFor(64);
  await settled(page, camera, active);
  expect(await accepted(page, true)).toEqual(before);
  await expect(panel(page).locator('.staging-panel-unit-id')).toHaveText(id);
  await expect(panel(page).locator('.staging-panel-packaging')).toHaveText(packaging, { useInnerText: true });
  await expect(countRow(page, '현재 차량 배치량')).toHaveText(['1', '0']);
  await expect(countRow(page, '대기량')).toHaveText([String(palletCount - 1), '0']);
  await page.clock.resume();
  await screenshot(page, info, 'staging-motion-wrapped-pallet-final');
  await info.attach('pallet-motion-observations', { contentType: 'application/json', body: JSON.stringify({ active, final: await observations(page),
    clock: 'Test-only paused RAF for screenshots and the actual skip control; accepted packing remains live application data.' }, null, 2) });
});

test('real reduced-motion media immediately places a manually accepted box without a flight or duplicate quantity', async ({ page }) => {
  test.setTimeout(120000); await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await boot(page, [box({ quantity: 1 })]);
  await expect(panel(page).getByLabel('화물 이동 연출', { exact: true })).toBeDisabled();
  await expect(panel(page).getByText('동작 줄이기 설정에 따라 즉시 배치합니다.', { exact: true })).toBeVisible();
  const id = await selectFirst(page), camera = await viewer(page).getAttribute('data-three-camera-pose');
  await panel(page).getByRole('button', { name: '선택 화물 적재', exact: true }).click();
  await expect(countRow(page, '전체 준비량')).toHaveText(['0', '1']);
  await expect(countRow(page, '현재 차량 배치량')).toHaveText(['0', '1']);
  await expect(countRow(page, '대기량')).toHaveText(['0', '0']);
  await expect(viewer(page)).toHaveAttribute('data-three-count', '1');
  await expect(viewer(page)).toHaveAttribute('data-three-flight-active', 'false');
  await expect(viewer(page)).toHaveAttribute('data-three-flight-count', '0');
  await expect(viewer(page)).not.toHaveAttribute('data-three-flight-request', /.+/);
  await expect(viewer(page)).toHaveAttribute('data-three-camera-pose', camera!);
  await expect(viewer(page).locator('canvas')).toHaveAttribute('data-motion-persistent-canvas', 'original');
  const result = await accepted(page); expect(result.boxCount).toBe(1);
  expect(result.memberIds).toHaveLength(1); expect(typeof result.memberIds[0]).toBe('string');
  await expect(panel(page).locator('.staging-panel-unit-id')).toHaveText(id);
  await expect(panel(page).getByRole('button', { name: '연출 건너뛰기', exact: true })).toHaveCount(0);
  await expect(page.locator('.guided-status-row[data-verification-status="passed"]')).toHaveCount(0);
});
