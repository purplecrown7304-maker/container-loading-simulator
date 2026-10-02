import { expect, test } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });

test('original Meshy cargo and both pallet models remain in the Three scene across equipment changes', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  const loadedModels: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.ok() && /\.obj(?:\?|$)/.test(response.url())) loadedModels.push(response.url()); });
  await page.goto('/comparison.html');
  const viewer = page.locator('.three-comparison-viewer');
  await expect(viewer).toHaveAttribute('data-three-applied', 'true', { timeout: 60_000 });
  await expect(viewer).toHaveAttribute('data-three-count', '16');
  await expect(viewer).toHaveAttribute('data-three-supports', '2');
  const modelCount = Number(await viewer.getAttribute('data-three-model-count'));
  expect(modelCount).toBeGreaterThanOrEqual(19); // 16 cartons, two pallets, one shell, plus securing.
  expect(loadedModels.length).toBeGreaterThanOrEqual(4); // Original carton, both pallets, shell.
  const canvas = await viewer.locator('canvas').elementHandle();
  expect(canvas).not.toBeNull();
  await page.getByRole('button', { name: '트럭 캡 OFF', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-three-applied', 'true');
  await expect(viewer).toHaveAttribute('data-three-count', '16');
  await expect(viewer).toHaveAttribute('data-three-supports', '2');
  await viewer.locator('canvas').screenshot({ path: test.info().outputPath('meshy-truck.png') });
  await page.getByRole('button', { name: '트럭 캡 ON', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-three-applied', 'true');
  await expect(viewer).toHaveAttribute('data-three-model-count', String(modelCount));
  await viewer.locator('canvas').screenshot({ path: test.info().outputPath('meshy-container.png') });
  await page.getByRole('button', { name: '박스 1200개', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-three-applied', 'true', { timeout: 60_000 });
  await expect(viewer).toHaveAttribute('data-three-count', '1200');
  await expect(viewer).toHaveAttribute('data-three-model-count', '1201');
  await expect(viewer).toHaveAttribute('data-three-supports', '0');
  await viewer.locator('canvas').screenshot({ path: test.info().outputPath('meshy-1200-boxes.png') });
  expect(await canvas!.evaluate(element => element === document.querySelector('.three-comparison-viewer canvas'))).toBe(true);
  expect(errors).toEqual([]);
});
