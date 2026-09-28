import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import CertificationResultSummary from './CertificationResultSummary';
import { buildSecuringUsage, type InertiaCertification, type InertiaReinforcementAttempt } from './inertiaCertification';
import type { PhysicsTarget } from './physicsTarget';

const target: PhysicsTarget = {
  mode: 'boxes', container: { length: 3, width: 2, height: 2, maxPayloadKg: 100 },
  cargo: [{ id: 'A', name: 'A', length: 0.3, width: 0.3, height: 0.3, weightKg: 1, quantity: 1 }],
  result: { placements: [], remaining: [], loadedWeightKg: 1, usedVolumeM3: 0, validationIssues: [] },
};
function attempt(level: 0 | 1): InertiaReinforcementAttempt {
  return { level, phase: level === 0 ? 'unsecured' : 'secured', levelLabel: level === 0 ? '무포장' : '마무리 포장', payloadWithinLimit: true, passed: true,
    scenarios: (['acceleration', 'braking', 'cornering'] as const).map(scenario => ({ scenario, passed: true, maxHorizontalShiftM: 0, maxTiltDeg: 0 })) };
}
function certification(): InertiaCertification {
  return { status: 'passed', mode: 'boxes', targetSignature: 'synthetic-summary-fixture', testedAt: '', securing: buildSecuringUsage(target, 1), testedScenarios: 3, passedScenarios: 3, failedScenarios: [], maxHorizontalShiftM: 0, maxTiltDeg: 0, results: Object.fromEntries((['acceleration', 'braking', 'cornering'] as const).map(scenario => [scenario, { scenario, fps: 0, simulatedSeconds: 4, cargoCount: 1, supportCount: 0, frames: [], maxHorizontalShiftM: 0, maxTiltDeg: 0 } ])), payloadWithinLimit: true, attempts: [attempt(0), attempt(1)] };
}
function render(cert: InertiaCertification) {
  return renderToStaticMarkup(<CertificationResultSummary detail={{ container: target.container, cargo: target.cargo, result: target.result, certification: cert }} />);
}
describe('certification result summary sequence gate', () => {
  it('does not display a legacy PASS without a raw load validation record', () => {
    const cert = certification(); delete cert.attempts;
    expect(render(cert)).toBe('');
  });
  it('does not promote failed raw loading after successful finishing', () => {
    const cert = certification(); cert.attempts![0].passed = false;
    expect(render(cert)).toBe('');
  });
  it('requires finishing revalidation even after all raw load scenarios pass', () => {
    const cert = certification(); cert.securing = buildSecuringUsage(target, 0); cert.attempts = [attempt(0)];
    expect(render(cert)).toBe('');
  });
  it('rejects incomplete finishing scenarios', () => {
    const cert = certification(); cert.attempts![1].scenarios.pop();
    expect(render(cert)).toBe('');
  });
  it('shows both verified phases and finishing materials only for the completed sequence', () => {
    const html = render(certification());
    expect(html).toContain('무포장 3종 통과 · 마무리 포장 후 3종 재검증 통과');
    expect(html).toContain('무포장 적재안 · 출발/제동/회전');
    expect(html).toContain('마무리 포장 후 재검증');
    expect(html).not.toContain('보강 전후');
  });
});
