import { expect, test } from '@playwright/test';
import { expectGlobalBackgroundControl, expectThreeOnly } from './helpers/viewer';

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });

test('pallet workflow stacks cartons and keeps run instructions outside the canvas', async ({ page, context, baseURL }) => {
  test.setTimeout(180_000);
  // This isolated guest fixture never contacts account/data services.
  // Only the app origin and public 3D font assets are needed for the story.
  const appOrigin = new URL(baseURL!).origin;
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === appOrigin) return route.continue();
    if (route.request().method() === 'GET' && url.href.startsWith('https://cdn.jsdelivr.net/gh/lojjic/unicode-font-resolver@v1.0.1/packages/data/')) {
      return route.continue({ headers: { accept: '*/*' } });
    }
    return route.abort('blockedbyclient');
  });
  await page.goto('/');
  await expect(page.locator('.guided-step-list button')).toHaveCount(6);
  await page.evaluate(() => {
    const container = { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 };
    localStorage.setItem('container-loading-product-packaging-v1:guest', JSON.stringify({
      container,
      products: [{ id: 'E2E-STACK', name: '적층 확인 제품', length: 0.5, width: 0.5, height: 0.3, weightKg: 1, quantity: 20, requiresBoxPackaging: true }],
      boxes: [{ id: 'E2E-STACK-BOX', name: '적층 가능 박스', innerLength: 0.51, innerWidth: 0.51, innerHeight: 0.31, outerLength: 0.55, outerWidth: 0.55, outerHeight: 0.35, tareWeightKg: 0.2, maxGrossWeightKg: 20, maxTopLoadKg: 100 }],
      settings: { allowCustom: false },
    }));
    window.dispatchEvent(new Event('container-loading:enterprise-packaging-planner-updated'));
  });
  await page.getByRole('button', { name: /다음: 제품 선택/ }).click();
  await page.getByPlaceholder('제품명 또는 제품코드 검색').fill('E2E-STACK');
  await page.locator('.guided-product-table article').filter({ hasText: 'E2E-STACK' }).locator('input[type="number"]').fill('20');
  await page.getByRole('button', { name: /다음: 제품 포장/ }).click();
  await expect(page.getByText('포장안 준비 완료')).toBeVisible();
  await page.getByRole('button', { name: /포장 확정 · 다음: 적재 방식 선택/ }).click();
  await page.getByRole('radio', { name: /파렛트 적재/ }).click();
  await page.getByRole('radio', { name: /공간효율 우선/ }).click();
  await page.getByText('품목별 착지 번호 · 같은 배송지는 같은 번호', {exact:true}).click();
  await page.getByRole('spinbutton', { name: /하역 순서/ }).fill('3');
  await expect(page.getByRole('spinbutton', { name: /하역 순서/ })).toHaveValue('3');
  await page.getByRole('button', { name: /다음 단계/ }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('container-loading-simulator-v1')!).cargo[0].unloadPriority)).toBe(3);

  const summary = page.locator('.guided-job-summary');
  if (await summary.getAttribute('open') === null) await summary.locator('summary').click();
  const confirmation = summary.locator('.guided-loading-run-confirmation');
  await expect(confirmation).toBeVisible();
  await expect(page.locator('.viewer-host .guided-loading-run-confirmation')).toHaveCount(0);
  await page.getByRole('button', { name: /최종 적재 진행/ }).click();
  await expect(page.locator('.guided-bottom-bar').getByRole('button', { name: /^결과 확인/ })).toBeEnabled({ timeout: 60_000 });
  await expect.poll(() => page.evaluate(() => (window as any).__containerLoadingPalletSnapshot?.result.optimization?.strategy)).toBe('capacity');
  await expect(page.locator('.viewer-host .three-comparison-viewer')).toHaveAttribute('data-three-applied', 'true', { timeout: 100_000 });
  await expect(page.locator('.viewer-host .three-comparison-viewer')).toHaveAttribute('data-three-supports', '1');
  await expect(summary.locator('dl > div').filter({ hasText: '사용 파렛트' }).locator('dd')).toHaveText(/(^| · )1개$/);
  const viewer = page.locator('.viewer-host .three-comparison-viewer');
  const canvas = await viewer.locator('canvas').elementHandle();
  expect(canvas).not.toBeNull();
  const revision = await viewer.getAttribute('data-three-plan-revision');
  const camera = await viewer.getAttribute('data-three-camera-pose');
  const target = await page.evaluate(() => JSON.stringify((window as any).__containerLoadingPhysicsTarget));
  await expectThreeOnly(page);
  const background = await expectGlobalBackgroundControl(page);
  await background.selectOption('forest');
  await expect(viewer).toHaveAttribute('data-three-environment', 'forest');
  await expect(viewer).toHaveAttribute('data-three-environment-applied', 'true');
  await page.evaluate(() => window.dispatchEvent(new Event('container-loading:open-inertia-test')));
  const motion = page.getByRole('region', { name: '관성 애니메이션 테스트' });
  const timeline = motion.getByRole('slider', { name: '관성 테스트 재생 위치' });
  await expect(motion).toBeVisible();
  await expect(timeline).toBeVisible({ timeout: 60_000 });
  await expect(viewer.locator('.viewer-bottom-info')).toBeHidden();
  await expect(viewer).toHaveAttribute('data-three-applied', 'true');
  await timeline.fill('0');
  await motion.getByRole('button', { name: '처음부터', exact: true }).click();
  await expect.poll(async () => Number(await viewer.getAttribute('data-three-frame-step'))).toBeGreaterThan(3);
  await motion.getByRole('button', { name: '일시정지', exact: true }).click();
  // Applying real pallet/body poses never reconstructs the scene or invalidates its result.
  await expect(viewer).toHaveAttribute('data-three-plan-revision', revision!);
  await expect(viewer).toHaveAttribute('data-three-camera-pose', camera!);
  await expect(viewer).toHaveAttribute('data-three-frame-rejected', 'false');
  await timeline.fill('60');
  await expect(viewer).toHaveAttribute('data-three-frame-step', '120');
  const pausedCg = await viewer.getAttribute('data-three-cg-position');
  await background.selectOption('beach');
  await expect(viewer).toHaveAttribute('data-three-environment', 'beach');
  await expect(viewer).toHaveAttribute('data-three-environment-applied', 'true');
  await expect(viewer).toHaveAttribute('data-three-frame-step', '120');
  await expect(viewer).toHaveAttribute('data-three-cg-position', pausedCg!);
  await expectGlobalBackgroundControl(page, 'beach');
  await expect(viewer).toHaveAttribute('data-three-plan-revision', revision!);
  await expect(viewer).toHaveAttribute('data-three-supports', '1');
  await motion.getByRole('button', { name: '관성 테스트 닫기' }).click();
  await expect(viewer).toHaveAttribute('data-three-frame-step', '');
  await expect(viewer.locator('.viewer-bottom-info')).toBeVisible();
  await expect(viewer).toHaveAttribute('data-three-plan-revision', revision!);
  await expect(viewer).toHaveAttribute('data-three-camera-pose', camera!);
  expect(await canvas!.evaluate(element => element === document.querySelector('.viewer-host canvas'))).toBe(true);
  expect(await page.evaluate(() => JSON.stringify((window as any).__containerLoadingPhysicsTarget))).toBe(target);
  await expect(page.locator('.viewer-host iframe')).toHaveCount(0);
  const snapshot = await page.evaluate(() => (window as typeof window & {
    __containerLoadingPalletSnapshot?: { result: { palletCount: number; placements: Array<{ z: number }> } };
  }).__containerLoadingPalletSnapshot?.result);
  expect(snapshot?.placements).toHaveLength(20);
  expect(new Set(snapshot?.placements.map(item => item.z)).size).toBe(5);

  const visibleClearance = page.locator('.viewer-card .reference-clearance-strip');
  await expect(visibleClearance).toBeVisible({ timeout: 15_000 });
  await visibleClearance.scrollIntoViewIfNeeded();
  await expect(visibleClearance).toBeVisible();
  const bounds = await visibleClearance.boundingBox();
  const notice = await page.locator('.guided-bottom-bar:visible').boundingBox();
  expect(bounds).not.toBeNull();
  expect(notice).not.toBeNull();
  expect(notice!.x).toBeGreaterThanOrEqual(0);
  expect(notice!.x + notice!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  expect(bounds!.x + bounds!.width <= notice!.x || notice!.x + notice!.width <= bounds!.x || bounds!.y + bounds!.height <= notice!.y || notice!.y + notice!.height <= bounds!.y).toBe(true);
  const clearanceHit = await visibleClearance.evaluate(element => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return { visible: element.contains(hit), box: box.toJSON(), coveringElement: hit?.outerHTML.slice(0, 400) };
  });
  expect(clearanceHit.visible, JSON.stringify(clearanceHit)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('pallet-canvas.png'), fullPage: true });

  await expect(page.locator('.guided-loading-run-confirmation')).toHaveCount(0);
  await expect(summary.locator('dl > div').filter({ hasText: '사용 파렛트' }).locator('dd')).toHaveText(/(^| · )1개$/);
});
