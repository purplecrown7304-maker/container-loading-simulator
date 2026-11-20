import { expect, test } from '@playwright/test';
import { expectVerifiedLoading } from './helpers/certification';

/**
 * Automatic final loading certifies the plan on screen and then compares it with alternative
 * layouts. The verdict used to be published for the first plan while that comparison was still
 * running: the workflow read 검증 통과 and opened the results, and when the comparison ended it
 * published again, which reset the status, sent an operator on STEP 06 back to STEP 05, and
 * could replace the plan they were looking at. Ten slabs in a 40FT reproduce the worst case:
 * the comparison selects another layout than the first one.
 */
test('the verdict of a final loading is published once, for the plan that stays', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    const state = { verdicts: [] as Array<{ status: string; plan: string }>, notes: [] as string[], steps: [] as string[], recording: false };
    (window as any).__verdictTrace = state;
    const plan = (placements: Array<{ x: number; y: number; z: number; rotated?: boolean }> = []) => placements.map(p => [p.x, p.y, p.z, p.rotated === true].join(',')).join('|');
    window.addEventListener('container-loading:inertia-certification-result', event => {
      const certification = (event as CustomEvent).detail;
      if (!state.recording || !certification) return;
      state.verdicts.push({ status: certification.status, plan: plan((window as any).__containerLoadingPhysicsTarget?.result.placements) });
    });
    window.addEventListener('container-loading:verification-stage', event => {
      if (state.recording) state.notes.push((event as CustomEvent).detail.note);
    });
    (window as any).__planOnScreen = () => plan((window as any).__containerLoadingLatestResult?.result.placements);
  });
  await page.goto('/');
  await page.evaluate(() => { window.dispatchEvent(new CustomEvent('container-loading:open-product-tool', { detail: 'products' })); });
  const dialog = page.getByRole('dialog', { name: '회사 제품 관리' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('제품코드', { exact: true }).fill('E2E-VERDICT');
  await dialog.getByLabel('제품명', { exact: true }).fill('판정 안정 제품');
  await dialog.getByLabel('길이 mm').fill('1000');
  await dialog.getByLabel('폭 mm').fill('2300');
  await dialog.getByLabel('높이 mm').fill('500');
  await dialog.getByLabel('중량 kg').fill('1');
  await dialog.getByLabel('박스 적재').selectOption('no');
  await dialog.getByRole('button', { name: '제품 등록' }).click();
  await dialog.locator('header button').click();
  await page.getByRole('button', { name: /다음: 제품 선택/ }).click();
  await page.getByPlaceholder('제품명 또는 제품코드 검색').fill('E2E-VERDICT');
  await page.locator('.guided-product-table article').filter({ hasText: 'E2E-VERDICT' }).locator('input[type="number"]').fill('10');
  await page.getByRole('button', { name: /다음: 제품 포장/ }).click();
  await expect(page.getByText('포장안 준비 완료')).toBeVisible();
  await page.getByRole('button', { name: /포장 확정 · 다음: 적재 방식 선택/ }).click();
  await page.getByRole('button', { name: /다음 단계/ }).click();

  await page.evaluate(() => { (window as any).__verdictTrace.recording = true; });
  await page.getByRole('button', { name: /최종 적재 진행/ }).click();
  const status = page.locator('.guided-status-row');
  // While the comparison runs the workflow says what it is doing and keeps the results locked.
  await expect(status).toHaveAttribute('data-verification-status', 'running');
  await expect(page.locator('.guided-step-list button').nth(5)).toBeDisabled();

  await expectVerifiedLoading(page);
  const verifiedPlan = await page.evaluate(() => (window as any).__planOnScreen());
  // An operator goes on to the results the moment the load reads 검증 통과.
  await page.locator('.guided-bottom-bar').getByRole('button', { name: /^결과 확인/ }).click();
  await expect(page.getByRole('dialog', { name: '결과 확인 설정' })).toBeVisible();
  const currentStep = page.locator('.guided-step-list button[aria-current="step"]');
  await expect(currentStep).toHaveAttribute('data-workspace-step', '6');

  // Give a late publication every chance to arrive: nothing may follow the verdict.
  await page.waitForTimeout(6000);
  const trace = await page.evaluate(() => (window as any).__verdictTrace);
  expect(trace.verdicts.map((verdict: { status: string }) => verdict.status)).toEqual(['passed']);
  expect(trace.verdicts[0].plan).toBe(verifiedPlan);
  expect(await page.evaluate(() => (window as any).__planOnScreen())).toBe(verifiedPlan);
  await expect(status).toHaveAttribute('data-verification-status', 'passed');
  await expect(currentStep).toHaveAttribute('data-workspace-step', '6');
  await expect(page.getByRole('dialog', { name: '결과 확인 설정' })).toBeVisible();
  await expect(page.getByRole('button', { name: /통합 출하·적재 작업지시서 보기/ })).toBeEnabled();
  // The wait was explained: the baseline and at least one alternative were named.
  expect(trace.notes[0]).toContain('관성 3종과 안전 후보를 자동 검증');
  expect(trace.notes.some((note: string) => /최종 적재 자동검증 \d+\/\d+ · 현재 적재안/.test(note))).toBe(true);
  expect(trace.notes).toContain('동일 수량을 유지하는 안전 재배치 후보를 계산 중입니다.');
  await expect(page.locator('.guided-job-summary [data-verification-note]')).toHaveCount(0);

  // The work order opens from the footer for the plan that was verified.
  const popup = page.waitForEvent('popup', { timeout: 60_000 });
  await page.getByRole('button', { name: /통합 출하·적재 작업지시서 보기/ }).click();
  const order = await popup;
  await expect(order.getByRole('heading', { name: /통합 출하·적재 작업지시서/ })).toBeVisible();
  await expect(order.locator('.summary')).toContainText('10 EA');
  await expect(order.locator('.footer')).toContainText('완료 · PASS');
  await expect(order.locator('.watermark')).toHaveCount(0);
});
