import { expect, type Page } from '@playwright/test';

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
}
