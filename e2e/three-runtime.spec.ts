import { expect, test } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });

test('Three applies cargo and pallet poses without replacing the plan, camera or canvas', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/comparison.html');
  const viewer = page.locator('.three-comparison-viewer');
  await expect(viewer).toHaveAttribute('data-three-applied', 'true', { timeout: 60_000 });
  await expect(viewer).toHaveAttribute('data-three-count', '16');
  await expect(viewer).toHaveAttribute('data-three-supports', '2');
  const canvas = await viewer.locator('canvas').elementHandle();
  expect(canvas).not.toBeNull();
  const revision = await viewer.getAttribute('data-three-plan-revision');
  const camera = await viewer.getAttribute('data-three-camera-pose');
  const cg = await viewer.getAttribute('data-three-cg-position');
  await viewer.getByRole('slider', { name: 'Three.js 높이 단면', exact: true }).fill('35');
  await viewer.getByRole('slider', { name: 'Three.js 적재 순서', exact: true }).fill('4');
  for (let cycle = 0; cycle < 2; cycle++) {
    await page.getByRole('button', { name: '합성 자세 재생 시작', exact: true }).click();
    await expect(viewer).toHaveAttribute('data-three-frame-step', /-?\d+/);
    await expect(viewer).toHaveAttribute('data-three-frame-rejected', 'false');
    await expect(viewer).not.toHaveAttribute('data-three-cg-position', cg!);
    await expect(viewer).toHaveAttribute('data-three-cut', '100');
    await expect(viewer).toHaveAttribute('data-three-step', '16');
    await expect(viewer).toHaveAttribute('data-three-plan-revision', revision!);
    await expect(viewer).toHaveAttribute('data-three-camera-pose', camera!);
    const frame = await viewer.getAttribute('data-three-frame-step');
    await expect(viewer).not.toHaveAttribute('data-three-frame-step', frame!);
    await page.getByRole('button', { name: '합성 자세 재생 중지', exact: true }).click();
    await expect(viewer).toHaveAttribute('data-three-frame-step', '');
    await expect(viewer).toHaveAttribute('data-three-cg-position', cg!);
    await expect(viewer).toHaveAttribute('data-three-cut', '35');
    await expect(viewer).toHaveAttribute('data-three-step', '4');
    await expect(viewer).toHaveAttribute('data-three-plan-revision', revision!);
    expect(await canvas!.evaluate(element => element === document.querySelector('.three-comparison-viewer canvas'))).toBe(true);
  }
  // Atomic stale/malformed frame rejection lives in threeComparisonScene.test.ts;
  // there is deliberately no browser postMessage bridge after the Unity removal.
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(errors).toEqual([]);
});
