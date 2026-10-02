import { expect, test } from '@playwright/test';
import { securingGeometry } from '../src/viewerSecuring';
import { comparisonFixture } from '../src/comparison/fixtures';

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });

test('Three renders four pallet straps per support in a two-by-two grid', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // Test the exact securing geometry sent by the real rendering fixture, including both pallet types.
  const fixture = comparisonFixture('pallets');
  const decorations = securingGeometry(fixture.container, fixture.result.placements, fixture.supports, fixture.securing!);
  for (const [index, support] of fixture.supports.entries()) {
    const topZ = Math.max(...fixture.result.placements.filter(box => box.x >= support.x && box.x < support.x + support.length).map(box => box.z + box.height));
    const topStraps = decorations.filter(part => part.supportIndex === index && Math.abs(part.z - topZ) < 1e-8 && !part.modelKey);
    expect(topStraps.filter(part => part.length > part.width)).toHaveLength(2);
    expect(topStraps.filter(part => part.width > part.length)).toHaveLength(2);
  }
  await page.goto('/comparison.html');
  const viewer = page.locator('.three-comparison-viewer');
  await expect(viewer).toHaveAttribute('data-three-applied', 'true', { timeout: 60_000 });
  await expect(viewer).toHaveAttribute('data-three-count', '16');
  await expect(viewer).toHaveAttribute('data-three-supports', '2');
  await viewer.getByRole('button', { name: '외벽 숨기기', exact: true }).click();
  const canvas = viewer.locator('canvas');
  const oblique = await canvas.screenshot({ path: test.info().outputPath('pallet-banding-grid-3d.png') });
  const camera = await viewer.getAttribute('data-three-camera-pose');
  await viewer.getByRole('button', { name: '상단', exact: true }).click();
  await expect(viewer).not.toHaveAttribute('data-three-camera-pose', camera!);
  await expect.poll(async () => (await canvas.screenshot()).equals(oblique)).toBe(false);
  await canvas.screenshot({ path: test.info().outputPath('pallet-banding-grid-top.png') });
  expect(errors).toEqual([]);
});
