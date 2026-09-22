import { expect, test } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });
test('Meshy skins render with the original cargo count and support physics', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    (window as any).__meshEvents = [];
    window.addEventListener('message', e => { if (e.data?.source === 'cargo-unity-host') (window as any).__meshEvents.push(e.data.payload); });
  });
  await page.goto('/unity-viewer/host.html');
  const events = (type: string) => page.evaluate(t => (window as any).__meshEvents.filter((e: any) => e.type === t), type);
  await expect.poll(() => events('ready'), { timeout: 100_000 }).toHaveLength(1);
  const send = (type: string, payload: unknown) => page.evaluate(({ type, payload }) => window.postMessage({ source: 'cargo-web', type, payload }, location.origin), { type, payload });
  const box = { cargoId: 'A', x: 1, y: .3, z: .15, length: 1, width: .8, height: .8, color: '#d6a64f', weightKg: 10 };
  const plan = {
    revision: 1, geometry: 'closed', vehicle: true, container: { length: 6, width: 2.4, height: 2.5 },
    placements: [box, { ...box, x: 2 }], supports: [{ x: 1, y: .2, z: 0, length: 2, width: 1, height: .15 }],
    decorations: [{ x: 1, y: .3, z: .15, length: .035, width: .035, height: .8, color: '#d6b276', modelKey: 'corner-guard', supportIndex: 0 }], cells: [],
  };
  await send('plan', plan);
  await expect.poll(() => events('planApplied')).toEqual([{ type: 'planApplied', revision: 1, count: 2, modelCount: 6 }]);
  await page.locator('canvas').screenshot({ path: 'test-results/meshy-truck.png' });
  await send('plan', { ...plan, revision: 2, vehicle: false });
  await expect.poll(() => events('planApplied')).toHaveLength(2);
  await page.locator('canvas').screenshot({ path: 'test-results/meshy-container.png' });
  const placements = Array.from({ length: 1200 }, (_, i) => ({ ...box, x: (i % 60) * .2, y: (Math.floor(i / 60) % 5) * .4, z: Math.floor(i / 300) * .4, length: .2, width: .4, height: .4 }));
  await send('plan', { ...plan, revision: 3, vehicle: false, container: { length: 12, width: 2.4, height: 2.5 }, placements, supports: [], decorations: [] });
  await expect.poll(() => events('planApplied'), { timeout: 30_000 }).toContainEqual({ type: 'planApplied', revision: 3, count: 1200, modelCount: 1201 });
  await page.locator('canvas').screenshot({ path: 'test-results/meshy-1200-boxes.png' });
  expect(errors).toEqual([]);
});
