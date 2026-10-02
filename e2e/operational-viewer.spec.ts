import { expect, test } from '@playwright/test';
import { comparisonFixture } from '../src/comparison/fixtures';

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });

test('Three carton labels, physical fixture bounds and cutaway controls stay consistent', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const fixture = comparisonFixture('boxes');
  for (const box of fixture.result.placements) {
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0); expect(box.z).toBeGreaterThanOrEqual(0);
    expect(box.x + box.length).toBeLessThanOrEqual(fixture.container.length);
    expect(box.y + box.width).toBeLessThanOrEqual(fixture.container.width);
    expect(box.z + box.height).toBeLessThanOrEqual(fixture.container.height);
  }
  await page.goto('/comparison.html');
  await page.getByRole('button', { name: '박스 12개', exact: true }).click();
  const viewer = page.locator('.three-comparison-viewer');
  await expect(viewer).toHaveAttribute('data-three-applied', 'true', { timeout: 60_000 });
  await expect(viewer).toHaveAttribute('data-three-count', String(fixture.result.placements.length));
  await expect(viewer).toHaveAttribute('data-three-label-faces', '48');
  const revision = await viewer.getAttribute('data-three-plan-revision');
  await viewer.locator('canvas').screenshot({ path: test.info().outputPath('carton-labels.png') });
  await viewer.getByRole('button', { name: '측면', exact: true }).click();
  await expect(viewer.getByRole('button', { name: '측면', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await viewer.locator('canvas').screenshot({ path: test.info().outputPath('carton-side-labels.png') });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('container-loading:placement-select', { detail: { index: 0 } })));
  await expect(viewer.locator('.unity-inspector')).toContainText('SAMPLE-A');
  await viewer.getByRole('button', { name: '박스 정보 ON', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-three-label-faces', '0');
  await viewer.getByRole('button', { name: '박스 정보 OFF', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-three-label-faces', '48');
  await expect(viewer).toHaveAttribute('data-three-plan-revision', revision!);
  await page.getByRole('button', { name: '빈 컨테이너', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-three-applied', 'true');
  await expect(viewer).toHaveAttribute('data-three-label-faces', '0');
  expect(errors).toEqual([]);
});
