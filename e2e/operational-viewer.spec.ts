import { expect, test } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });
test('Unity box-face labels and Meshy geometry respect the physical container envelope', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    (window as any).__viewerEvents = [];
    window.addEventListener('message', event => { if (event.data?.source === 'cargo-unity-host') (window as any).__viewerEvents.push(event.data.payload); });
  });
  await page.goto('/unity-viewer/host.html');
  const events = (type: string) => page.evaluate(t => (window as any).__viewerEvents.filter((event: any) => event.type === t), type);
  await expect.poll(() => events('ready'), { timeout: 100_000 }).toHaveLength(1);
  const send = (type: string, payload: unknown) => page.evaluate(({ type, payload }) => window.postMessage({ source: 'cargo-web', type, payload }, location.origin), { type, payload });
  const carton = { cargoId: 'SKU-042', length: .6, width: .4, height: .4, weightKg: 12.5, color: '#6a96b8', labelTitle: '정밀 부품 · 포장 박스', labelCode: 'BOX-042', labelDetail: '24 EA · 12.5 kg', labelSize: '600 × 400 × 400 mm' };
  const plan = { revision: 10, geometry: 'closed', vehicle: false, container: { length: 2.4, width: 1.2, height: 1.2 },
    placements: [{ ...carton, x: 0, y: 0, z: 0 }, { ...carton, x: 1.8, y: .8, z: 0 }, { ...carton, x: .9, y: .4, z: 0 }], supports: [], decorations: [], cells: [] };
  await send('plan', plan);
  await expect.poll(() => events('geometryAudit')).toContainEqual({ type: 'geometryAudit', revision: 10, outsideCargo: 0, interiorClipped: true });
  await expect.poll(() => events('labelsApplied')).toContainEqual({ type: 'labelsApplied', revision: 10, faces: 12 });
  await page.locator('canvas').screenshot({ path: `test-results/carton-labels-${test.info().project.name}.png` });
  await send('command', { action: 'view', view: 'side' });
  await page.locator('canvas').screenshot({ path: `test-results/carton-side-labels-${test.info().project.name}.png` });
  await send('command', { action: 'labels', value: 0 });
  await send('plan', { ...plan, revision: 11, placements: [] });
  await expect.poll(() => events('labelsApplied')).toContainEqual({ type: 'labelsApplied', revision: 11, faces: 0 });
  expect(errors).toEqual([]);
});
