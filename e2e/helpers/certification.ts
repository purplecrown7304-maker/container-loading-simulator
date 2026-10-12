import { expect, type Page } from '@playwright/test';

/** Inspect actual full-motion evidence, including review-only completed runs. */
export async function expectSecuredPhysicsEvidence(page: Page, passed = false) {
  const evidence = await page.evaluate(() => {
    const state = window as any;
    const certification = state.__containerLoadingLatestCertification;
    const target = state.__containerLoadingPhysicsTarget;
    const suite = certification?.physicsValidation;
    if (!suite || !certification.physicsValidationSignature || !target) return null;
    const bound = JSON.parse(certification.physicsValidationSignature);
    const supports = bound.supports;
    const cargo = target.result.placements;
    const rows = [suite, ...suite.scenarios].map((row: any) => ({
      scenario: row.scenario ?? 'aggregate',
      profileMatches: JSON.stringify(row.securingProfile) === JSON.stringify(bound.profile),
      cargoMatches: row.placements.length === cargo.length && row.placements.every((body: any, index: number) =>
        body.index === index && body.cargoId === cargo[index].cargoId),
      supportsMatch: row.supports.length === supports.length && row.supports.every((body: any, index: number) =>
        body.index === index && body.id === supports[index].id),
      countsMatch: row.stableCount + row.warningCount + row.unstableCount === cargo.length
        && row.supportStableCount + row.supportWarningCount + row.supportUnstableCount === supports.length,
      finite: [row.score, row.maxHorizontalShiftM, row.maxVerticalShiftM, row.maxTiltDeg,
        row.maxLinearSpeedMps, row.maxAngularSpeedRadps, ...[...row.placements, ...row.supports].flatMap((body: any) =>
          [body.horizontalShiftM, body.verticalShiftM, body.tiltDeg, body.linearSpeedMps, body.angularSpeedRadps])].every(Number.isFinite),
      unstable: row.unstableCount + row.supportUnstableCount,
      outOfBounds: [...row.placements, ...row.supports].some((body: any) => body.outOfBounds),
      settled: row.settled,
      steps: row.steps,
      seconds: row.simulatedSeconds,
    }));
    return { engine: suite.engine, targetMatches: bound.target === certification.targetSignature,
      materialsMatch: JSON.stringify(bound.usage) === JSON.stringify(certification.securing), rows };
  });
  expect(evidence, 'The selected securing configuration needs real four-scenario physics evidence').not.toBeNull();
  expect(evidence).toMatchObject({ engine: 'Rapier 3D', targetMatches: true, materialsMatch: true });
  expect(evidence!.rows.map(row => row.scenario)).toEqual(['aggregate', 'settle', 'acceleration', 'braking', 'cornering']);
  for (const row of evidence!.rows) {
    expect(row).toMatchObject({ profileMatches: true, cargoMatches: true, supportsMatch: true, countsMatch: true, finite: true });
    if (row.scenario !== 'aggregate') {
      expect(row.steps).toBeGreaterThan(0);
      expect(row.seconds).toBe(row.steps / 60);
    }
    if (passed) expect(row).toMatchObject({ unstable: 0, outOfBounds: false, settled: true });
  }
}

/** Wait for an honest verified result, not merely a published/visible layout. */
export async function expectVerifiedLoading(page: Page) {
  await expect(page.locator('.guided-status-row')).toHaveAttribute('data-verification-status', 'passed', { timeout: 60_000 });
  const verification = await page.evaluate(() => {
    const state = window as any;
    const certification = state.__containerLoadingLatestCertification;
    const target = state.__containerLoadingPhysicsTarget;
    return {
      status: certification?.status,
      tested: certification?.testedScenarios,
      passed: certification?.passedScenarios,
      failures: certification?.failedScenarios,
      payloadWithinLimit: certification?.payloadWithinLimit,
      review: Boolean(certification?.limitReview || target?.container.limitReview),
      staticErrors: target?.result.validationIssues?.length,
      operationalErrors: target?.result.operationalFindings?.filter((finding: any) => finding.severity === 'error').length ?? 0,
    };
  });
  expect(verification).toEqual({ status: 'passed', tested: 3, passed: 3, failures: [], payloadWithinLimit: true, review: false, staticErrors: 0, operationalErrors: 0 });
  await expectSecuredPhysicsEvidence(page, true);
}
