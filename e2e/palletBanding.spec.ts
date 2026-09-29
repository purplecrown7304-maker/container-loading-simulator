import { expect, test } from '@playwright/test';
import { securingGeometry } from '../src/unitySecuring';
import type { SecuringUsage } from '../src/inertiaCertification';

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });

test('Unity renders four pallet straps in a two-by-two grid', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    (window as any).__bandingEvents = [];
    window.addEventListener('message', event => {
      if (event.data?.source === 'cargo-unity-host') (window as any).__bandingEvents.push(event.data.payload);
    });
  });
  await page.goto('/unity-viewer/host.html');
  const events = (type: string) => page.evaluate(type => (window as any).__bandingEvents.filter((event: any) => event.type === type), type);
  await expect.poll(() => events('ready'), { timeout: 100_000 }).toHaveLength(1);
  const container = { length: 1.8, width: 1.6, height: 1.5, maxPayloadKg: 1000 };
  const supports = [{ id: 'P1', x: .3, y: .3, z: 0, length: 1.2, width: 1, height: .12, weightKg: 20, modelKey: 'plastic-pallet' }];
  const placements = Array.from({ length: 8 }, (_, i) => ({ cargoId: 'GRID', x: .3 + (i % 2) * .6, y: .3 + (Math.floor(i / 2) % 2) * .5, z: .12 + Math.floor(i / 4) * .4, length: .6, width: .5, height: .4, weightKg: 10, color: '#b78650' }));
  // Isolate the four strap loops so both directions are visible without wrap/guards.
  const usage: SecuringUsage = { level: 3, levelLabel: '격자 밴딩 확인', palletCount: 1, palletWeightKg: 20, bandingStraps: 4, bandingLengthM: 16.4, cornerGuards: 0, cornerGuardLengthM: 0, wrappingLengthM: 0, antiSlipMats: 0, dunnageBlocks: 0, loadBars: 0, estimatedAddedWeightKg: .41, estimatedNonCargoWeightKg: 20.41 };
  const decorations = securingGeometry(container, placements, supports, usage);
  const top = decorations.filter(p => Math.abs(p.z - .92) < 1e-8);
  expect(top.filter(p => p.length > p.width)).toHaveLength(2);
  expect(top.filter(p => p.width > p.length)).toHaveLength(2);
  const send = (type: string, payload: unknown) => page.evaluate(({ type, payload }) => window.postMessage({ source: 'cargo-web', type, payload }, location.origin), { type, payload });
  await send('plan', { revision: 1, geometry: 'platform', container, placements, supports, decorations, cells: [] });
  await expect.poll(() => events('planApplied')).toEqual([{ type: 'planApplied', revision: 1, count: 8, modelCount: 9 }]);
  await send('command', { action: 'shell', value: 0 });
  const canvas = page.locator('canvas');
  const oblique = await canvas.screenshot({ path: test.info().outputPath('pallet-banding-grid-3d.png') });
  await send('command', { action: 'view', view: 'top' });
  await expect.poll(async () => (await canvas.screenshot()).equals(oblique)).toBe(false);
  await canvas.screenshot({ path: test.info().outputPath('pallet-banding-grid-top.png') });
  expect(errors).toEqual([]);
});
