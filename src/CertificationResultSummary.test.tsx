import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it } from 'vitest';
import CertificationResultSummary from './CertificationResultSummary';
import { buildSecuringUsage, createPhysicsTargetSignature, type InertiaCertification } from './inertiaCertification';
import { clearPhysicsTarget, publishPhysicsTarget, type PhysicsTarget } from './physicsTarget';

const target: PhysicsTarget = { mode: 'boxes', container: { length: 3, width: 2, height: 2, maxPayloadKg: 100 }, cargo: [], result: { placements: [{ cargoId: 'A', x: 0, y: 0, z: 0, length: .3, width: .3, height: .3, weightKg: 1 }], remaining: [], loadedWeightKg: 1, usedVolumeM3: .027, validationIssues: [] } };
const certification: InertiaCertification = { mode: 'boxes', status: 'passed', targetSignature: createPhysicsTargetSignature(target), securing: buildSecuringUsage(target, 0), testedAt: '', testedScenarios: 3, passedScenarios: 3, failedScenarios: [], payloadWithinLimit: true, maxHorizontalShiftM: .005, maxTiltDeg: .5, results: Object.fromEntries(['acceleration', 'braking', 'cornering'].map(scenario => [scenario, { scenario, fps: 30, simulatedSeconds: 4, cargoCount: 1, supportCount: 0, frames: [], maxHorizontalShiftM: .005, maxTiltDeg: .5 }])) };
afterEach(() => clearPhysicsTarget());
it('shows the PASS card only for the exact accepted current detail', () => {
  publishPhysicsTarget(target);
  expect(renderToStaticMarkup(<CertificationResultSummary detail={{ ...target, certification }} />)).toContain('<strong>PASS</strong>');
});
it.each(['incomplete', 'static-failure', 'stale-detail'])('suppresses misleading PASS for %s evidence', reason => {
  const current = reason === 'static-failure' ? { ...target, result: { ...target.result, operationalFindings: [{ code: 'CG_LONGITUDINAL', severity: 'error' as const, message: '무게중심 초과', placementIndexes: [] }] } } : target;
  publishPhysicsTarget(current);
  const cert = reason === 'incomplete' ? { ...certification, results: {} } : certification;
  const detail = reason === 'stale-detail' ? { ...target, result: { ...target.result, placements: [{ ...target.result.placements[0], x: .5 }] } } : current;
  expect(renderToStaticMarkup(<CertificationResultSummary detail={{ ...detail, certification: cert }} />)).toBe('');
});
