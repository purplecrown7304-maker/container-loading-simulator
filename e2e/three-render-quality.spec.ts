import { expect, test } from '@playwright/test';

const requestedHardware = process.env.STAGING_RENDER_HARDWARE === '1';
test.use({ launchOptions: { args: requestedHardware ? ['--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });

test('three quality profiles render the same original pallet and transparent film scene', async ({ page }, info) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /THREE|WebGL|shader|GL_INVALID/.test(message.text())) errors.push(message.text()); });
  await page.goto('/comparison.html');
  const viewer = page.locator('.three-comparison-viewer');
  await expect(viewer).toHaveAttribute('data-three-applied', 'true', { timeout: 60000 });
  const graphics = await viewer.locator('canvas').evaluate(canvas => {
    const gl = (canvas as HTMLCanvasElement).getContext('webgl2')!;
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return { browser: navigator.userAgent, dpr: devicePixelRatio, version: gl.getParameter(gl.VERSION),
      renderer: gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) };
  });
  await viewer.getByRole('button', { name: '외벽 숨기기', exact: true }).click();
  const revision = await viewer.getAttribute('data-three-plan-revision');
  const samples = [];
  const comparisonCamera = await viewer.getAttribute('data-three-camera-pose');
  for (const quality of ['performance', 'standard', 'high']) {
    await viewer.getByLabel('3D 품질', { exact: true }).selectOption(quality);
    await expect(viewer).toHaveAttribute('data-three-render-path', quality === 'performance' ? 'direct' : 'gtao');
    await viewer.getByRole('button', { name: '입체', exact: true }).click();
    await expect(viewer).toHaveAttribute('data-three-camera-pose', comparisonCamera!);
    const camera = await viewer.getAttribute('data-three-camera-pose');
    await page.screenshot({ path: info.outputPath(`pallet-contact-${quality}-1920.png`), fullPage: true });
    await expect(viewer).toHaveAttribute('data-three-count', '16');
    await expect(viewer).toHaveAttribute('data-three-supports', '2');
    await expect(viewer).toHaveAttribute('data-three-plan-revision', revision!);
    await viewer.getByRole('button', { name: '5초 회전 측정', exact: true }).click();
    await expect(viewer).toHaveAttribute('data-three-benchmark', /sampleCount/, { timeout: 45000 });
    samples.push({ quality, initialCamera: camera, viewport: { width: 1920, height: 1080 }, cargo: 16, pallets: 2,
      renderPath: await viewer.getAttribute('data-three-render-path'), benchmark: JSON.parse((await viewer.getAttribute('data-three-benchmark'))!),
      msaaSamples: await viewer.getAttribute('data-three-msaa-samples'), beautyWidth: await viewer.getAttribute('data-three-render-width'), beautyHeight: await viewer.getAttribute('data-three-render-height'),
      aoWidth: await viewer.getAttribute('data-three-ao-width'), aoHeight: await viewer.getAttribute('data-three-ao-height') });
  }
  await viewer.getByRole('button', { name: '입체', exact: true }).click();
  await viewer.getByLabel('접촉 음영', { exact: true }).uncheck();
  await expect(viewer).toHaveAttribute('data-three-render-path', 'direct');
  await page.screenshot({ path: info.outputPath('pallet-contact-ao-off-1920.png'), fullPage: true });
  const settledResources = [];
  for (let cycle = 0; cycle < 3; cycle++) {
    await viewer.getByLabel('3D 품질', { exact: true }).selectOption('high');
    await viewer.getByLabel('접촉 음영', { exact: true }).check();
    await expect(viewer).toHaveAttribute('data-three-render-path', 'gtao');
    await viewer.getByLabel('3D 품질', { exact: true }).selectOption('performance');
    await expect(viewer).toHaveAttribute('data-three-render-path', 'direct');
    settledResources.push({ geometries: await viewer.getAttribute('data-three-geometries'), textures: await viewer.getAttribute('data-three-textures') });
  }
  await info.attach('same-scene-quality-measurements', { body: JSON.stringify({ environment: `Playwright Chromium, ${process.platform}; ${requestedHardware ? 'default ANGLE requested; actual device reported below' : 'SwiftShader requested'}; five-second orbit samples.`, graphics, samples, settledResources }, null, 2), contentType: 'application/json' });
  // R3F may finish an unmounted shadow resource after the previous paint.
  // A falling counter is cleanup; repeated quality changes must not grow it.
  expect(Number(settledResources[2].geometries)).toBeLessThanOrEqual(Number(settledResources[1].geometries));
  expect(Number(settledResources[2].textures)).toBeLessThanOrEqual(Number(settledResources[1].textures));
  await page.setViewportSize({ width: 1366, height: 768 });
  await viewer.getByLabel('3D 품질', { exact: true }).selectOption('high');
  await viewer.getByLabel('접촉 음영', { exact: true }).check();
  await expect(viewer).toHaveAttribute('data-three-render-path', 'gtao');
  await expect(viewer).toHaveAttribute('data-three-count', '16');
  await expect(viewer).toHaveAttribute('data-three-plan-revision', revision!);
  expect(errors).toEqual([]);
});
