import { describe, expect, it } from 'vitest';
import { runInertiaCertification, hasUnsecuredTransportPass, hasCompletedSecuringSequence, type InertiaScenario } from './inertiaCertification';
import type { PhysicsTarget } from './physicsTarget';

// Synthetic physical fixtures: real Rapier, no mocked scenario results or adjusted limits.
function target(mode: PhysicsTarget['mode'], stable: boolean): PhysicsTarget {
  const size = stable ? 1.1 : 3;
  const length = stable ? 1.1 : .3;
  const height = stable ? .2 : 2;
  const xy = stable ? 0 : 1.35;
  const z = mode === 'pallets' ? .15 : 0;
  const placement = { cargoId: 'SYNTHETIC', x: xy, y: xy, z, length, width: length, height, weightKg: 20 };
  return {
    mode,
    container: { length: size, width: size, height: 3, maxPayloadKg: 1000 },
    cargo: [{ id: 'SYNTHETIC', name: 'Synthetic transport fixture', length, width: length, height, weightKg: 20, quantity: 1 }],
    result: { placements: [placement], remaining: [], loadedWeightKg: mode === 'pallets' ? 45 : 20, usedVolumeM3: length * length * height, validationIssues: [] },
    supports: mode === 'pallets' ? [{ id: 'SYNTHETIC-P', x: stable ? 0 : .95, y: stable ? 0 : .95, z: 0, length: 1.1, width: 1.1, height: .15, weightKg: 25, dynamic: true }] : [],
  };
}
const scenarios = ['acceleration', 'braking', 'cornering'];
describe('real Rapier unsecured transport before finishing', () => {
  for (const mode of ['boxes', 'pallets'] as const) {
    it(`${mode}: low full-footprint cargo passes naked scenarios before secured scenarios`, async () => {
      const input = target(mode, true); const before = structuredClone(input);
      const calls: Array<{ level: number; scenario: InertiaScenario }> = [];
      const result = await runInertiaCertification(input, undefined, (value, level) => calls.push({ level, scenario: value.scenario as InertiaScenario }));
      console.log(JSON.stringify({ fixture: `${mode}-low`, status: result.status, attempts: result.attempts }));
      expect(input).toEqual(before);
      expect(result.status).toBe('passed');
      expect(hasUnsecuredTransportPass(result)).toBe(true);
      expect(hasCompletedSecuringSequence(result)).toBe(true);
      expect(calls.slice(0, 3)).toEqual(scenarios.map(scenario => ({ level: 0, scenario })));
      expect(calls.slice(3, 6)).toEqual(scenarios.map(scenario => ({ level: 1, scenario })));
      expect(result.attempts?.map(a => a.phase)).toEqual(['unsecured', 'secured']);
      expect(result.results.braking?.cargoCount).toBe(1);
    });
    it(`${mode}: tall unrestrained cargo failing transport receives no finishing attempt`, async () => {
      const input = target(mode, false); const before = structuredClone(input);
      const calls: Array<{ level: number; scenario: InertiaScenario }> = [];
      const result = await runInertiaCertification(input, undefined, (value, level) => calls.push({ level, scenario: value.scenario as InertiaScenario }));
      console.log(JSON.stringify({ fixture: `${mode}-tall`, status: result.status, attempts: result.attempts }));
      expect(input).toEqual(before);
      expect(result.status).toBe('failed');
      expect(hasUnsecuredTransportPass(result)).toBe(false);
      expect(hasCompletedSecuringSequence(result)).toBe(false);
      expect(calls).toEqual(scenarios.map(scenario => ({ level: 0, scenario })));
      expect(result.attempts).toHaveLength(1);
      expect(result.securing.level).toBe(0);
      expect(result.securing.bandingStraps + result.securing.cornerGuards + result.securing.wrappingLengthM + result.securing.antiSlipMats + result.securing.dunnageBlocks + result.securing.loadBars).toBe(0);
      expect(result.failedScenarios.length).toBeGreaterThan(0);
    });
  }
});
