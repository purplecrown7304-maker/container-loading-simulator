import { expect, test } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });
test('manual checks use the real loaded plan, cancel safely and invalidate edited inputs', async ({ page, context, baseURL }) => {
  test.setTimeout(180_000);
  // Disposable browser data only; no company data reads/writes during local QA.
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL!).origin ? route.continue() : route.abort());
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  const openCheck = async (name: string) => {
    const workspace = page.locator('.workspace-modal');
    if (await workspace.isVisible()) await workspace.getByRole('button', { name: '설정 닫기', exact: true }).click();
    await page.locator('.header-menu-button').click();
    const inspections = page.locator('section[aria-label="점검 메뉴"]');
    await expect(inspections.getByRole('button')).toHaveCount(4);
    await expect(page.getByRole('button', { name: /적재 결과 점검/ })).toHaveCount(0);
    await inspections.getByRole('button', { name, exact: true }).click();
  };
  await openCheck('경계·충돌 점검');
  const checks = page.locator('.safety-center-dialog');
  await expect(checks.getByRole('button', { name: '경계·충돌 점검 실행', exact: true })).toBeDisabled();
  await checks.getByRole('button', { name: '닫기', exact: true }).click();
  await openCheck('관성 테스트');
  const motion = page.locator('[aria-labelledby="inertia-title"]');
  const timeline = motion.getByRole('slider', { name: '관성 테스트 재생 위치' });
  await expect(timeline).toHaveCount(0);
  await expect(motion.getByText(/먼저 자동 적재/)).toBeVisible();
  await motion.getByRole('button', { name: '관성 테스트 닫기' }).click();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('container-loading:open-product-tool', { detail: 'products' })));
  const product = page.getByRole('dialog', { name: '회사 제품 관리' });
  await product.getByLabel('제품코드').fill('INSPECTION');
  await product.getByLabel('제품명').fill('점검용 샘플');
  await product.getByLabel('길이 mm').fill('400'); await product.getByLabel('폭 mm').fill('300'); await product.getByLabel('높이 mm').fill('200');
  await product.getByLabel('중량 kg').fill('2'); await product.getByLabel('박스 적재').selectOption('no');
  await product.getByRole('button', { name: '제품 등록' }).click(); await product.locator('header button').click();
  await page.getByRole('button', { name: /다음: 제품 선택/ }).click();
  await page.getByPlaceholder('제품명 또는 제품코드 검색').fill('INSPECTION');
  await page.locator('.guided-product-table article').filter({ hasText: 'INSPECTION' }).locator('input[type=number]').fill('3');
  await page.getByRole('button', { name: /다음: 제품 포장/ }).click();
  await expect(page.getByText('포장안 준비 완료')).toBeVisible();
  await page.getByRole('button', { name: /포장 확정 · 다음: 적재 방식 선택/ }).click();
  await page.getByRole('radio', { name: /공간효율·적재량 우선형/ }).click();
  await page.getByRole('button', { name: /선택 완료 · 다음: 자동 적재/ }).click();
  await page.getByRole('button', { name: /최종 적재 진행/ }).click();
  const viewer = page.locator('.viewer-card .three-comparison-viewer');
  await expect(viewer).toHaveAttribute('data-three-count', '3', { timeout: 60_000 });
  await expect(viewer).toHaveAttribute('data-three-applied', 'true', { timeout: 60_000 });
  await expect.poll(() => page.evaluate(() => Boolean((window as any).__containerLoadingPhysicsTarget && !(window as any).__containerLoadingFinalPhysicsRunning)), { timeout: 60_000 }).toBe(true);
  // The first physics target precedes final-result publication. Start preservation
  // checks only after the workflow confirms that completed result is usable.
  await expect(page.locator('.guided-primary-cta:visible')).toContainText('결과 확인', { timeout: 60_000 });
  await expect(page.locator('.guided-primary-cta:visible')).toBeEnabled();
  await expect(viewer).toHaveAttribute('data-three-applied', 'true');
  await page.screenshot({ path: test.info().outputPath('three-default-loaded.png'), fullPage: true });
  const loadedTarget = await page.evaluate(() => JSON.stringify((window as any).__containerLoadingPhysicsTarget));
  expect(JSON.parse(loadedTarget).container.length).toBeCloseTo(12.032, 3);
  const loadedRevision = await viewer.getAttribute('data-three-plan-revision');
  const loadedCg = await viewer.getAttribute('data-three-cg-position');
  const loadedCamera = await viewer.getAttribute('data-three-camera-pose');
  const loadedCanvas = await viewer.locator('canvas').elementHandle();
  expect(loadedCanvas).not.toBeNull();
  for (const shot of [
    { environment: 'warehouse', view: '측면', file: 'background-40ft-warehouse-side.png' },
    { environment: 'forest', view: '측면', file: 'background-40ft-forest-side.png' },
    { environment: 'space', view: '입체', file: 'background-40ft-space.png' },
  ]) {
    await page.getByRole('combobox', { name: '3D 배경', exact: true }).selectOption(shot.environment);
    await viewer.getByRole('button', { name: shot.view, exact: true }).click();
    await expect(viewer).toHaveAttribute('data-three-environment', shot.environment);
    await expect(viewer).toHaveAttribute('data-three-environment-applied', 'true');
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(viewer).toHaveAttribute('data-three-plan-revision', loadedRevision!);
    await expect(viewer).toHaveAttribute('data-three-cg-position', loadedCg!);
    expect(await page.evaluate(() => JSON.stringify((window as any).__containerLoadingPhysicsTarget))).toBe(loadedTarget);
    expect(await loadedCanvas!.evaluate(element => element === document.querySelector('.viewer-card canvas'))).toBe(true);
    await page.screenshot({ path: test.info().outputPath(shot.file), fullPage: true });
  }
  await page.getByRole('combobox', { name: '3D 배경', exact: true }).selectOption('warehouse');
  await viewer.getByRole('button', { name: '입체', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-three-environment-applied', 'true');
  await expect(viewer).toHaveAttribute('data-three-camera-pose', loadedCamera!);
  await page.locator('.header-menu-button').click();
  await page.locator('section[aria-label="점검 메뉴"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('four-inspection-menu.png'), fullPage: true });
  await page.locator('.header-menu-button').click();
  for (const name of ['경계·충돌 점검', '무게중심 점검', '총중량·바닥 하중 추정']) {
    await openCheck(name);
    await expect(checks.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(checks.locator('article')).toHaveCount(1);
    await expect(checks.getByRole('button', { name: name + ' 실행', exact: true })).toBeEnabled({ timeout: 10_000 });
    await checks.getByRole('button', { name: name + ' 실행', exact: true }).click();
    await expect(checks.getByRole('button', { name: name + ' 다시 실행', exact: true })).toBeEnabled({ timeout: 20_000 });
    await expect(checks.getByText(/계산 결과는 실제 운송 안전 인증이 아닙니다/)).toBeVisible();
    expect(await checks.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`direct-check-${name}.png`), fullPage: true });
    await checks.getByRole('button', { name: '닫기', exact: true }).click();
  }
  await page.evaluate(() => { (window as any).__mainInertiaCanvas = document.querySelector('.viewer-card canvas'); });
  await viewer.getByRole('slider', { name: 'Three.js 높이 단면', exact: true }).fill('25');
  await viewer.getByRole('slider', { name: 'Three.js 적재 순서', exact: true }).fill('1');
  await openCheck('관성 테스트');
  await expect(motion).toHaveAttribute('role', 'region');
  await expect(page.locator('.inertia-modal-backdrop')).toHaveCount(0);
  await expect(timeline).toBeVisible({ timeout: 60_000 });
  await expect(viewer).toHaveAttribute('data-three-applied', 'true', { timeout: 60_000 });
  await expect(viewer).toHaveAttribute('data-three-frame-step', '0');
  await expect(viewer.locator('.viewer-bottom-info')).toBeHidden();
  await expect(viewer).toHaveAttribute('data-three-cut', '100');
  await expect(viewer).toHaveAttribute('data-three-step', '3');
  await expect(timeline).toHaveValue('0');
  await timeline.fill('0');
  await motion.getByRole('button', { name: '재생', exact: true }).click();
  await expect.poll(async () => Number(await timeline.inputValue())).toBeGreaterThan(5);
  await motion.getByRole('button', { name: '일시정지', exact: true }).click();
  await motion.getByRole('button', { name: '0.5배', exact: true }).click();
  await expect(motion.getByRole('button', { name: '0.5배', exact: true })).toHaveClass(/active/);
  for (const name of ['급정거', '급회전']) {
    await motion.getByRole('tab', { name: new RegExp(name) }).click();
    await expect(motion.getByRole('tab', { name: new RegExp(name) })).toHaveAttribute('aria-selected', 'true');
    await expect(timeline).toBeVisible({ timeout: 60_000 });
  }
  await timeline.fill('60');
  await expect(viewer).toHaveAttribute('data-three-frame-step', '120');
  // A background change must leave this paused, real simulation pose and its
  // authoritative loading target intact, then allow playback to resume.
  const pausedAttributes = ['data-three-plan-revision', 'data-three-camera-pose', 'data-three-cg-position', 'data-three-count', 'data-three-supports', 'data-three-frame-step', 'data-three-cut', 'data-three-step'];
  const pausedState = await viewer.evaluate((element, attributes) => Object.fromEntries(attributes.map(name => [name, element.getAttribute(name)])), pausedAttributes);
  const targetBeforeBackground = await page.evaluate(() => JSON.stringify((window as any).__containerLoadingPhysicsTarget));
  await page.getByRole('combobox', { name: '3D 배경', exact: true }).selectOption('beach');
  await expect(viewer).toHaveAttribute('data-three-environment', 'beach');
  await expect(viewer).toHaveAttribute('data-three-environment-applied', 'true');
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await viewer.evaluate((element, attributes) => Object.fromEntries(attributes.map(name => [name, element.getAttribute(name)])), pausedAttributes)).toEqual(pausedState);
  expect(await page.evaluate(() => JSON.stringify((window as any).__containerLoadingPhysicsTarget))).toBe(targetBeforeBackground);
  expect(await page.evaluate(() => (window as any).__mainInertiaCanvas === document.querySelector('.viewer-card canvas'))).toBe(true);
  await expect(timeline).toHaveValue('60');
  await page.screenshot({ path: test.info().outputPath('inertia-animation.png'), fullPage: true });
  await motion.getByRole('button', { name: '재생', exact: true }).click();
  await expect.poll(async () => Number(await timeline.inputValue())).toBeGreaterThan(60);
  await motion.getByRole('button', { name: '일시정지', exact: true }).click();
  await motion.getByRole('button', { name: '관성 테스트 닫기' }).click();
  await expect(viewer).toHaveAttribute('data-three-frame-step', '');
  await expect(viewer.locator('.viewer-bottom-info')).toBeVisible();
  await expect(viewer).toHaveAttribute('data-three-cut', '25');
  await expect(viewer).toHaveAttribute('data-three-step', '1');
  expect(await page.evaluate(() => (window as any).__mainInertiaCanvas === document.querySelector('.viewer-card canvas'))).toBe(true);
  await viewer.getByRole('slider', { name: 'Three.js 높이 단면', exact: true }).fill('100');
  // A completed real simulation stays authoritative with the sole Three renderer.
  await expect(page.getByRole('group', { name: '3D 엔진 선택' })).toHaveCount(0);
  await expect(page.locator('iframe[src*="unity-viewer"]')).toHaveCount(0);
  await expect(page.getByText('3D 엔진 · 동일 적재 결과', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.stringify((window as any).__containerLoadingPhysicsTarget))).toBe(targetBeforeBackground);
  await page.getByRole('button', { name: '이전 단계', exact: true }).click();
  await page.getByRole('button', { name: '이전 단계', exact: true }).click();
  await page.getByRole('button', { name: '이전 단계', exact: true }).click();
  await page.locator('.guided-product-table article').filter({ hasText: 'INSPECTION' }).locator('input[type=number]').fill('4');
  await openCheck('경계·충돌 점검');
  await expect(checks.getByRole('button', { name: '경계·충돌 점검 실행', exact: true })).toBeDisabled();
  await expect(checks.getByText('관성 시나리오 3종 계산 완료')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('manual-checks-stale-blocked.png'), fullPage: true });
  await checks.getByRole('button', { name: '닫기', exact: true }).click();
  await openCheck('관성 테스트');
  await expect(timeline).toHaveCount(0);
  await expect(motion.getByText(/먼저 자동 적재/)).toBeVisible();
  expect(errors).toEqual([]);
});
