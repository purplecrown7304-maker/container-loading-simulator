import { expect, test } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });
test('manual checks use the real loaded plan, cancel safely and invalidate edited inputs', async ({ page, context, baseURL }) => {
  test.setTimeout(180_000);
  // Disposable browser data only; no company data reads/writes during local QA.
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL!).origin ? route.continue() : route.abort());
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  const openChecks = async () => {
    await page.locator('.header-menu-button').click();
    await page.getByRole('button', { name: /적재 결과 점검/ }).click();
  };
  await openChecks();
  const checks = page.getByRole('dialog', { name: '점검', exact: true });
  await expect(checks.getByRole('button', { name: '관성 테스트 실행', exact: true })).toBeDisabled();
  await checks.getByRole('button', { name: '닫기', exact: true }).click();
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
  await page.screenshot({ path: test.info().outputPath('three-default-loaded.png'), fullPage: true });
  await openChecks();
  for (const name of ['경계·충돌 점검', '무게중심 점검', '총중량·바닥 하중 추정']) {
    await expect(checks.getByRole('button', { name: name + ' 실행', exact: true })).toBeEnabled({ timeout: 10_000 });
    await checks.getByRole('button', { name: name + ' 실행', exact: true }).click();
    await expect(checks.getByRole('button', { name: name + ' 다시 실행', exact: true })).toBeEnabled({ timeout: 20_000 });
  }
  await checks.getByRole('button', { name: '관성 테스트 실행', exact: true }).click();
  await checks.getByRole('button', { name: '실행 취소', exact: true }).click();
  await expect(checks.getByText('취소됨 · 결과 없음')).toBeVisible();
  await checks.getByRole('button', { name: '관성 테스트 실행', exact: true }).click();
  await expect(checks.getByText('관성 시나리오 3종 계산 완료')).toBeVisible({ timeout: 60_000 });
  await expect(checks.getByText(/출발 0.30g · .*최대 수평 이동/)).toBeVisible();
  await expect(checks.getByText(/격자 평균/)).toBeVisible();
  await expect(checks.getByText(/계산 결과는 실제 운송 안전 인증이 아닙니다/)).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('manual-checks-complete.png'), fullPage: true });
  await checks.locator('.safety-center-grid').evaluate(el => { el.scrollTop = 0; });
  await page.screenshot({ path: test.info().outputPath('manual-checks-overview.png'), fullPage: true });
  expect(await checks.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await checks.getByRole('button', { name: '닫기', exact: true }).click();
  // Renderer round-trip preserves the computed target.
  const before = await page.evaluate(() => JSON.stringify((window as any).__containerLoadingPhysicsTarget));
  const engine = page.locator('.viewer-card').getByRole('group', { name: '3D 엔진 선택' });
  await engine.getByRole('button', { name: 'Unity', exact: true }).click();
  await expect(page.locator('.viewer-card .unity-viewer')).toHaveAttribute('data-unity-applied', 'true', { timeout: 100_000 });
  await engine.getByRole('button', { name: 'Three.js · 기존 모델', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-three-applied', 'true', { timeout: 30_000 });
  expect(await page.evaluate(() => JSON.stringify((window as any).__containerLoadingPhysicsTarget))).toBe(before);
  await page.getByRole('button', { name: '이전 단계', exact: true }).click();
  await page.getByRole('button', { name: '이전 단계', exact: true }).click();
  await page.getByRole('button', { name: '이전 단계', exact: true }).click();
  await page.locator('.guided-product-table article').filter({ hasText: 'INSPECTION' }).locator('input[type=number]').fill('4');
  await openChecks();
  await expect(checks.getByRole('button', { name: '관성 테스트 실행', exact: true })).toBeDisabled();
  await expect(checks.getByText('관성 시나리오 3종 계산 완료')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('manual-checks-stale-blocked.png'), fullPage: true });
  expect(errors).toEqual([]);
});
