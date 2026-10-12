import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import InspectionStatusPanel from './InspectionStatusPanel';
import { buildSecuringUsage, clearLatestInertiaCertification, createPhysicsTargetSignature, INERTIA_CERTIFICATION_EVENT, type InertiaCertification } from './inertiaCertification';
import { clearPhysicsTarget, publishPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { clearPhysicsFixture, publishPhysicsFixture, withSecuredPhysicsFixture } from './testFixtures/physicsVerification';

const target: PhysicsTarget = { mode: 'boxes', container: { length: 3, width: 2, height: 2, maxPayloadKg: 100 }, cargo: [], result: { placements: [{ cargoId: 'A', x: 0, y: 0, z: 0, length: .3, width: .3, height: .3, weightKg: 1 }], remaining: [], loadedWeightKg: 1, usedVolumeM3: .027, validationIssues: [] } };
function cert(): InertiaCertification {
  return withSecuredPhysicsFixture(target, { status: 'passed', mode: 'boxes', targetSignature: createPhysicsTargetSignature(target), testedAt: '', securing: buildSecuringUsage(target, 3), testedScenarios: 3, passedScenarios: 3, failedScenarios: [], payloadWithinLimit: true, maxHorizontalShiftM: .001, maxTiltDeg: .1, results: Object.fromEntries(['acceleration', 'braking', 'cornering'].map(scenario => [scenario, { scenario, fps: 30, simulatedSeconds: 4, cargoCount: 1, supportCount: 0, frames: [], maxHorizontalShiftM: .001, maxTiltDeg: .1 }])) });
}
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); host.innerHTML = '<div id="mount"></div><div class="dashboard-right"></div>'; document.body.append(host);
  root = createRoot(host.querySelector('#mount')!);
  publishPhysicsTarget(target);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); clearPhysicsTarget(); clearPhysicsFixture(); clearLatestInertiaCertification(); vi.unstubAllGlobals(); });
async function render(certification: InertiaCertification) {
  (window as Window & { __containerLoadingLatestCertification?: InertiaCertification }).__containerLoadingLatestCertification = certification;
  await act(async () => root.render(<InspectionStatusPanel />));
}
const row = (step: number) => host.querySelectorAll('tbody tr')[step - 1];

it('separates an unstable unsecured baseline from a matching secured PASS', async () => {
  const baseline = publishPhysicsFixture(target);
  baseline.score = 5; baseline.stableCount = 0; baseline.unstableCount = 1; baseline.settled = false;
  await render(cert());
  expect(row(3).textContent).toContain('무보강');
  expect(row(3).className).toBe('tone-warning');
  expect(row(4).textContent).toContain('보강 물리 4종 완료');
  expect(row(5).textContent).toContain('보강 조건부 발급');
});

it.each(['missing', 'stale', 'unstable', 'residual'])('does not advertise safe issuance for %s secured physics', async kind => {
  publishPhysicsFixture(target);
  const certification = cert();
  if (kind === 'missing') delete certification.physicsValidation;
  if (kind === 'stale') certification.securing.loadBars += 1;
  if (kind === 'unstable') { const physics = certification.physicsValidation!; physics.stableCount = 0; physics.unstableCount = 1; physics.placements[0].severity = 'unstable'; physics.placements[0].outOfBounds = true; }
  if (kind === 'residual') { const row = certification.physicsValidation!.scenarios[2]; row.settled = false; row.maxLinearSpeedMps = .06; row.placements[0].linearSpeedMps = .06; row.placements[0].severity = 'warning'; row.stableCount = 0; row.warningCount = 1; }
  await render(certification);
  expect(row(5).textContent).toContain('검토용만 가능');
  expect(row(5).textContent).toContain('출고 차단');
  expect(row(5).textContent).not.toContain('보강 조건부 발급');
  expect(row(5).className).not.toBe('tone-pass');
});

it('clears a previously ready state when a later certificate has no final physical evidence', async () => {
  await render(cert());
  expect(row(5).textContent).toContain('보강 조건부 발급');
  const legacy = cert(); delete legacy.physicsValidation;
  await act(async () => window.dispatchEvent(new CustomEvent(INERTIA_CERTIFICATION_EVENT, { detail: legacy })));
  expect(row(5).textContent).toContain('검토용만 가능');
});
