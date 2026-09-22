import { expect, test } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });
test('Unity applies pallet poses and ignores stale or malformed physics frames', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => {
    (window as any).__unityEvents = [];
    window.addEventListener('message', event => {
      if (event.data?.source === 'cargo-unity-host') (window as any).__unityEvents.push(event.data.payload);
    });
  });
  await page.goto('/unity-viewer/host.html');
  const events = (type: string) => page.evaluate(type => (window as any).__unityEvents.filter((event: any) => event.type === type), type);
  await expect.poll(() => events('ready'), { timeout: 100_000 }).toHaveLength(1);
  const plan = {
    revision: 17, container: { length: 4, width: 2, height: 2.5 }, geometry: 'platform',
    placements: [{ cargoId: 'ROTATED', x: 1.4, y: .6, z: .15, length: 1.2, width: .8, height: 1, color: '#4285f4', weightKg: 25, invalid: false }],
    supports: [{ cargoId: 'P1', x: 1.3, y: .5, z: 0, length: 1.4, width: 1, height: .15, weightKg: 10 }],
    decorations: [{ x: 1.4, y: .6, z: 1.15, length: .03, width: .8, height: .03, color: '#1f2937', supportIndex: 0 }],
    cells: [{ x: 1, y: .5, length: 1, width: 1, loadKg: 25, kgPerM2: 25 }], centerOfGravity: { x: 2, y: 1, z: .65 },
  };
  const send = (type: string, payload: unknown) => page.evaluate(({ type, payload }) => window.postMessage({ source: 'cargo-web', type, payload }, location.origin), { type, payload });
  await send('plan', plan);
  await expect.poll(() => events('planApplied')).toEqual([{ type: 'planApplied', revision: 17, count: 1, modelCount: 2 }]);
  const canvas = page.locator('canvas');
  // Let the startup overlay finish and the static scene enter idle rendering.
  await page.waitForTimeout(2500);
  const initial = await canvas.screenshot();
  const frame = { revision: 17, cargo: [1, .8, .2, 0, Math.SQRT1_2, 0, Math.SQRT1_2], supports: [.8, .075, .2, 0, Math.SQRT1_2, 0, Math.SQRT1_2] };
  await send('frame', frame);
  await expect.poll(() => events('frameApplied')).toHaveLength(1);
  const moved = await canvas.screenshot();
  expect(moved.equals(initial)).toBe(false);
  await page.waitForTimeout(500);
  await send('command', { action: 'view', view: 'top' });
  await expect.poll(async () => (await canvas.screenshot()).equals(moved)).toBe(false);
  await send('frame', { ...frame, revision: 16 });
  await send('frame', { ...frame, cargo: [] });
  // A round trip through a harmless view command/plan lets the browser process
  // the preceding messages; neither rejected frame can emit an acknowledgement.
  await send('plan', { ...plan, revision: 18 });
  await expect.poll(() => events('planApplied')).toHaveLength(2);
  expect(await events('frameApplied')).toHaveLength(1);
  await send('command', { action: 'weight', value: 1 });
  expect((await canvas.screenshot()).equals(initial)).toBe(false);
  expect(errors).toEqual([]);
});
