import { expect, test } from '@playwright/test';
import { expectSecuredPhysicsEvidence } from './helpers/certification';

// The 2026-10-12 uploaded 1-ton truck case: 3,000 products in 73 full + 1 partial carton.
// Exercise the actual worker -> failed certification -> recovery -> published UI target path.
test('recovers the 74-carton truck load with allowed rotation and no invented load bars', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await page.evaluate(() => {
    const full = { id: 'PKG-GST-002', name: 'GST-002', length: .23500000000000001, width: .13, height: .265,
      weightKg: 1.42, quantity: 73, maxTopLoadKg: 34.3, allowRotation: true };
    const state = {
      container: { length: 2.83, width: 1.67, height: 1.58, maxPayloadKg: 1000, floorLoadLimitKgPerM2: 220,
        floorLoadWarningMultiplier: 3, unloadingPolicy: 'strict', ceilingClearanceM: .05 },
      cargo: [full, { ...full, id: 'PKG-GST-002-PARTIAL', weightKg: .7399999999999999, quantity: 1 }],
    };
    localStorage.setItem('container-loading-simulator-v1', JSON.stringify(state));
    localStorage.setItem('container-loading:guided-loading-strategy', 'capacity');
    localStorage.setItem('container-loading:guided-loading-unit', 'boxes');
    localStorage.setItem('container-loading-strategy', 'capacity');
    (window as any).__orientationRecoveryStatuses = [];
    window.addEventListener('container-loading:inertia-certification-result', (event: Event) => {
      const cert = (event as CustomEvent).detail;
      if (cert) (window as any).__orientationRecoveryStatuses.push(cert.status);
    });
    window.dispatchEvent(new CustomEvent('container-loading-simulator:storage-updated', { detail: state }));
    window.dispatchEvent(new CustomEvent('container-loading:guided-loading-strategy-updated', { detail: 'capacity' }));
    window.dispatchEvent(new CustomEvent('container-loading:guided-loading-unit-updated', { detail: 'boxes' }));
  });
  await expect.poll(() => page.evaluate(() => (window as any).__containerLoadingLatestResult?.cargo?.[0]?.id)).toBe('PKG-GST-002');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('container-loading:app-action', { detail: { action: 'run-loading' } })));
  await expect.poll(() => page.evaluate(() => (window as any).__containerLoadingLatestCertification?.status), { timeout: 60_000 }).toBe('passed');
  await expectSecuredPhysicsEvidence(page, true);
  const actual = await page.evaluate(() => {
    const target = (window as any).__containerLoadingPhysicsTarget;
    const cert = (window as any).__containerLoadingLatestCertification;
    return { statuses: (window as any).__orientationRecoveryStatuses,
      placements: target.result.placements, remaining: target.result.remaining,
      quantity: target.cargo.reduce((sum: number, c: any) => sum + c.quantity, 0),
      validationIssues: target.result.validationIssues, warnings: target.result.operationalFindings,
      voidFillPlan: target.result.voidFillPlan, bars: cert.securing.loadBars, level: cert.securing.level,
      model: JSON.parse(cert.targetSignature).physicsModel, shift: cert.maxHorizontalShiftM, tilt: cert.maxTiltDeg };
  });
  expect(actual.statuses).toContain('failed');
  expect(actual.statuses.at(-1)).toBe('passed');
  expect(actual.placements).toHaveLength(74);
  expect(actual.quantity).toBe(74);
  expect(actual.remaining).toEqual([]);
  expect(actual.validationIssues).toEqual([]);
  expect(actual.placements.every((p: any) => !p.rotated && Math.abs(p.length - .235) < 1e-8)).toBe(true);
  expect(actual.bars).toBe(0);
  expect(actual.level).toBe(1);
  expect(actual.shift).toBeLessThanOrEqual(.012);
  expect(actual.tilt).toBeLessThanOrEqual(1.8);
  expect(actual.model).toBe('restraint-v6-explicit-supports');
  expect(actual.voidFillPlan.fills.find((f: any) => f.kind === 'door-face')?.material).toBe('unresolved');
  expect(actual.warnings.some((f: any) => f.code === 'VOID_FILL_REQUIRED')).toBe(true);
});
