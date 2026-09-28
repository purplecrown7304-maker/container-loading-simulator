import { expect, test } from '@playwright/test';
import { createPhysicsTargetSignature } from '../src/inertiaCertification';
import { normalizeSecuringMaterialSettings } from '../src/securingMaterialSettings';

test('registered stacking updates without reload and bulk packaging advances before loading', async ({ page, context, baseURL }) => {
  // The real 1,562-body naked transport pass takes about 100 seconds on this runner.
  test.setTimeout(300_000);
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(30_000);
  const appOrigin = new URL(baseURL!).origin;
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === appOrigin) return route.continue();
    if (route.request().method() === 'GET' && url.href.startsWith('https://cdn.jsdelivr.net/gh/lojjic/unicode-font-resolver@v1.0.1/packages/data/')) return route.continue({ headers: { accept: '*/*' } });
    return route.abort('blockedbyclient');
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '적재공간 선택' })).toBeVisible();
  // Synthetic account data lives only in this isolated browser; all external data services are blocked.
  await page.evaluate(() => {
    const operator = { id: 'stack-regression', name: '적층 테스트' };
    sessionStorage.setItem('container-loading-local-operator-v1', JSON.stringify(operator));
    const quantities = [1000, 2000, 3000, 4000, 50000, 50000];
    const sizes = [[0.055, 0.03, 0.04], [0.055, 0.03, 0.05], [0.055, 0.03, 0.05], [0.03, 0.06, 0.05], [0.031, 0.06, 0.05], [0.032, 0.06, 0.05]];
    const products = quantities.map((quantity, i) => ({ id: `STACK-${i + 1}`, name: `적층 제품 ${i + 1}`, length: sizes[i][0], width: sizes[i][1], height: sizes[i][2], weightKg: 0.1, quantity, requiresBoxPackaging: true }));
    const box = { id: 'REC-235X130X265', name: '범용 등록 박스', innerLength: 0.227, innerWidth: 0.122, innerHeight: 0.257, outerLength: 0.235, outerWidth: 0.13, outerHeight: 0.265, tareWeightKg: 0.6, maxGrossWeightKg: 22, maxTopLoadKg: 0, recommendationRegistration: 'explicit' };
    localStorage.setItem('container-loading-product-packaging-v1:stack-regression', JSON.stringify({ container: { length: 5.9, width: 2.352, height: 2.395, maxPayloadKg: 28130 }, products, boxes: [box], settings: { allowCustom: false } }));
    localStorage.setItem('container-loading-user-box-catalog-v1:stack-regression', JSON.stringify([{ id: box.id, name: box.name, length: box.outerLength, width: box.outerWidth, height: box.outerHeight, weightKg: 22, quantity: 0, maxStackLayers: 1, maxTopLoadKg: 100, catalogOrigin: 'recommendation', recommendationRegistration: 'explicit' }]));
    window.dispatchEvent(new CustomEvent('container-loading:local-operator-updated', { detail: operator }));
  });
  await page.getByRole('button', { name: '선택한 장비 변경', exact: true }).click();
  await page.getByRole('dialog', { name: '컨테이너 및 트럭 유형' }).locator('[data-equipment-id="20-standard"]').click();
  await page.getByRole('button', { name: /다음: 제품 선택/ }).click();
  await page.getByPlaceholder('제품명 또는 제품코드 검색').fill('STACK-');
  const quantities = [1000, 2000, 3000, 4000, 50000, 50000];
  for (let i = 0; i < quantities.length; i++) await page.locator('.guided-product-table article').filter({ hasText: `STACK-${i + 1}` }).locator('input[type="number"]').fill(String(quantities[i]));
  await page.getByRole('button', { name: /다음: 제품 포장/ }).click();
  await expect(page.getByText('자동 적재 최대 1단', { exact: false })).toHaveCount(6);
  await expect(page.locator('.product-packaging-preview-head')).toContainText('1,562');

  await page.getByRole('button', { name: /메뉴$/ }).click();
  await page.getByRole('button', { name: /박스 관리/ }).click();
  const modal = page.locator('.box-selector-modal');
  await modal.locator('tbody tr').filter({ hasText: 'REC-235X130X265' }).getByRole('button', { name: '수정', exact: true }).click();
  await modal.getByLabel('최대적층단', { exact: true }).fill('10');
  await modal.getByRole('button', { name: '저장', exact: true }).click();
  await modal.getByRole('button', { name: '닫기', exact: true }).click();
  // 265 mm cartons fit at most nine layers inside this 20 FT container.
  await expect(page.getByText('자동 적재 최대 9단', { exact: false })).toHaveCount(6);
  await page.getByRole('button', { name: /포장 확정 · 다음: 적재 방식 선택/ }).click({ timeout: 10_000 });
  await expect(page.getByRole('heading', { name: '적재 방식 선택' })).toBeVisible({ timeout: 5000 });
  const prepared = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('container-loading-simulator-v1')!);
    const latest = (window as any).__containerLoadingLatestResult;
    return { cargo: saved.cargo, placed: latest.result.placements.length, remaining: latest.result.remaining.length };
  });
  expect(prepared.cargo.reduce((sum: number, item: any) => sum + item.quantity, 0)).toBe(1562);
  expect(prepared.cargo.every((item: any) => item.maxStackLayers === 9 && item.maxTopLoadKg === 100 && item.boxId === 'REC-235X130X265')).toBe(true);
  expect(prepared.placed).toBe(0);
  expect(prepared.remaining).toBe(0);
  console.log('bulk packaging confirmed: 1562 cartons, 9 layers, no hidden loading');

  await page.getByRole('radio', { name: /공간효율·적재량 우선형/ }).click();
  await page.getByRole('button', { name: /선택 완료 · 다음: 자동 적재/ }).click();
  const workerStarted = page.waitForEvent('worker', { predicate: worker => /loading\.worker-/.test(worker.url()), timeout: 15_000 });
  await page.getByRole('button', { name: /최종 적재 진행/ }).click();
  await workerStarted;
  console.log('bulk packing worker started');
  await expect(page.locator('.guided-primary-cta')).toContainText('검사 중');
  // UI actions remain usable while the real packing worker is calculating.
  await page.getByRole('button', { name: /메뉴$/ }).click({ timeout: 5000 });
  await expect(page.getByRole('navigation', { name: '적재 작업 전체 메뉴' })).toBeVisible();
  await page.getByRole('button', { name: /메뉴$/ }).click();
  console.log('bulk packing UI remains responsive');
  await expect.poll(async () => page.evaluate(() => (window as any).__containerLoadingLatestResult?.result.placements.length ?? 0), { timeout: 180_000 }).toBeGreaterThan(452);
  const loaded = await page.evaluate(() => {
    const { result, cargo } = (window as any).__containerLoadingLatestResult;
    return { count: result.placements.length, left: result.remaining.reduce((sum: number, item: any) => sum + item.quantity, 0), maxZ: Math.max(...result.placements.map((item: any) => item.z)), issues: result.validationIssues, cargo };
  });
  expect(loaded.count + loaded.left).toBe(1562);
  expect(loaded.maxZ).toBeGreaterThan(0.265);
  expect(loaded.issues).toEqual([]);
  console.log('bulk stacking result', { count: loaded.count, remaining: loaded.left, maxZ: loaded.maxZ });
  // Same bulk input and physical limits: failed naked transport cannot be
  // converted to completion by finishing materials or reference-report access.
  try {
    await expect.poll(() => page.evaluate(() => Boolean((window as any).__containerLoadingLatestCertification)), { timeout: 180_000 }).toBe(true);
  } catch (error) {
    const diagnostic = await page.evaluate(() => {
      const runtime = window as any;
      const physics = runtime.__containerLoadingFinalPhysicsResult;
      const target = runtime.__containerLoadingPhysicsTarget;
      const cert = runtime.__containerLoadingLatestCertification;
      return {
        finalPhysicsRunning: runtime.__containerLoadingFinalPhysicsRunning ?? null,
        finalPhysicsSignaturePresent: Boolean(runtime.__containerLoadingFinalPhysicsSignature),
        finalPhysicsResult: physics ? { status: physics.status, scenario: physics.scenario, passed: physics.passed, testedScenarios: physics.testedScenarios, passedScenarios: physics.passedScenarios, maxHorizontalShiftM: physics.maxHorizontalShiftM, maxTiltDeg: physics.maxTiltDeg, keys: Object.keys(physics) } : null,
        liveTarget: target ? { mode: target.mode, count: target.result?.placements?.length } : null,
        certificationPresent: Boolean(cert),
        certification: cert ? { status: cert.status, attempts: cert.attempts, securing: cert.securing } : null,
        bodyTail: document.body.innerText.slice(-2000),
      };
    });
    console.log('bulk certification timeout diagnostic', JSON.stringify(diagnostic));
    await test.info().attach('bulk-certification-timeout.json', { body: JSON.stringify(diagnostic, null, 2), contentType: 'application/json' });
    throw error;
  }
  const evidence = await page.evaluate(() => ({
    certification: (window as any).__containerLoadingLatestCertification,
    target: (window as any).__containerLoadingPhysicsTarget,
    materials: JSON.parse(localStorage.getItem('container-loading-securing-material-settings') || 'null'),
  }));
  let matchesLiveTarget = false;
  if (evidence.target) {
    const signature = JSON.parse(createPhysicsTargetSignature(evidence.target));
    signature.materialUnitWeights = normalizeSecuringMaterialSettings(evidence.materials);
    matchesLiveTarget = JSON.stringify(signature) === evidence.certification.targetSignature;
  }
  console.log('bulk certification before failure UI wait', JSON.stringify({ status: evidence.certification.status, attempts: evidence.certification.attempts, securing: evidence.certification.securing, liveTargetPresent: Boolean(evidence.target), matchesLiveTarget }));
  const failure = page.getByRole('dialog', { name: '작업지시서 전 상자 안전 후보 비교' });
  expect(matchesLiveTarget).toBe(true);
  const certification = evidence.certification;
  expect(certification.status).toBe('failed');
  console.log('bulk final transport certification', JSON.stringify({ status: certification.status, mode: certification.mode, attempts: certification.attempts, securing: certification.securing }));
  expect(certification.mode).toBe('boxes');
  expect(certification.attempts).toHaveLength(1);
  expect(certification.attempts[0]).toMatchObject({ phase: 'unsecured', level: 0, passed: false });
  expect(certification.attempts[0].scenarios.map((item: any) => item.scenario)).toEqual(['acceleration', 'braking', 'cornering']);
  expect(certification.attempts[0].scenarios.some((item: any) => item.passed === false)).toBe(true);
  expect(certification.securing).toMatchObject({ level: 0, bandingStraps: 0, bandingLengthM: 0, cornerGuards: 0, cornerGuardLengthM: 0, wrappingLengthM: 0, antiSlipMats: 0, dunnageBlocks: 0, loadBars: 0, estimatedAddedWeightKg: 0 });
  const finalResult = await page.evaluate(() => (window as any).__containerLoadingLatestResult.result);
  expect(finalResult.placements).toHaveLength(1562);
  expect(finalResult.remaining.reduce((sum: number, item: any) => sum + item.quantity, 0)).toBe(0);
  for (const item of prepared.cargo) {
    const placed = finalResult.placements.filter((row: any) => row.cargoId === item.id).length;
    const waiting = finalResult.remaining.filter((row: any) => row.cargoId === item.id).reduce((sum: number, row: any) => sum + row.quantity, 0);
    expect(placed + waiting).toBe(item.quantity);
  }
  await expect(page.locator('.dashboard-card.viewer-card .unity-viewer').first()).toHaveAttribute('data-unity-count', '1562');
  await expect(page.locator('.guided-step-list button').nth(5)).toBeDisabled();
  await expect(page.locator('.guided-bottom-bar').getByRole('button', { name: /^결과 확인/ })).toHaveCount(0);
  await expect(failure).toBeVisible();
  const reportPromise = page.waitForEvent('popup');
  // Explicit operator stop of optional candidate search: this does not certify completion.
  await expect(failure.getByRole('button', { name: '계산 취소', exact: true })).toBeVisible();
  await failure.getByRole('button', { name: '비교 중단하고 현재 검증 결과로 발급', exact: true }).click();
  const report = await reportPromise;
  await expect(report.getByRole('heading', { name: /통합 출하·적재 작업지시서/ })).toBeVisible();
  await expect(report.locator('.summary')).toContainText('1562 EA');
  await expect(report.locator('.watermark')).toHaveText('검증 미완료 · 재배치 검토용');
  await expect(report.locator('.materials')).toContainText('마무리 포장');
  await expect(report.locator('.materials')).toContainText('적용 대기');
  await expect(report.locator('body')).toContainText('위험');
  await expect.poll(() => page.evaluate(() => (window as any).__containerLoadingLatestCertification?.searchNotice)).toContain('추가 후보 비교를 중단');
  await expect(report.locator('body')).toContainText('추가 후보 비교를 중단');
  await expect(page.locator('.guided-step-list button').nth(5)).toBeDisabled();
  expect(await page.evaluate(() => (window as any).__containerLoadingLatestCertification.status)).toBe('failed');
  expect(await page.evaluate(() => (window as any).__containerLoadingLatestResult.result.placements.length)).toBe(1562);
  console.log('bulk operator stopped optional comparison; reference report retains failed certification and 1562 cartons');
  await page.screenshot({ path: test.info().outputPath('registered-stacking.png'), fullPage: true });
});
