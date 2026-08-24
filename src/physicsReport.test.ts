import { describe, expect, it } from 'vitest';
import { buildPhysicsReportHtml } from './physicsReport';
import type { PhysicsValidationSuite } from './engine/physicsValidation';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';

const container: ContainerSpec = { length: 2, width: 2, height: 2, maxPayloadKg: 1000 };
const cargo: CargoItem[] = [{ id: '<BOX>', name: '<위험>', length: 1, width: 1, height: .4, weightKg: 20, quantity: 1 }];
const loading: LoadingResult = {
  placements: [{ cargoId: '<BOX>', x: 0, y: 0, z: 0, length: 1, width: 1, height: .4, weightKg: 20 }],
  remaining: [], loadedWeightKg: 20, usedVolumeM3: .4, validationIssues: [],
};
const scenarioBase = { engine: 'Rapier 3D' as const, simulatedSeconds: 4, steps: 240, simulatedCount: 1, supportCount: 0, supportStableCount: 0, supportWarningCount: 0, supportUnstableCount: 0, supports: [] };
const physics: PhysicsValidationSuite = {
  engine: 'Rapier 3D', score: 82, stableCount: 0, warningCount: 1, unstableCount: 0,
  supportStableCount: 0, supportWarningCount: 0, supportUnstableCount: 0,
  worstScenario: 'braking', maxHorizontalShiftM: .02, maxVerticalShiftM: .003, maxTiltDeg: 2.1,
  maxLinearSpeedMps: .01, maxAngularSpeedRadps: .02, settled: true,
  placements: [{ index: 0, cargoId: '<BOX>', severity: 'warning', horizontalShiftM: .02, verticalShiftM: -.003, tiltDeg: 2.1, linearSpeedMps: .01, angularSpeedRadps: .02, outOfBounds: false, reason: '<주의>' }],
  supports: [],
  scenarios: [
    { ...scenarioBase, scenario: 'settle', stableCount: 1, warningCount: 0, unstableCount: 0, score: 100, settled: true, maxHorizontalShiftM: 0, maxVerticalShiftM: .002, maxTiltDeg: 0, maxLinearSpeedMps: 0, maxAngularSpeedRadps: 0, placements: [], summary: 'ok' },
    { ...scenarioBase, scenario: 'braking', stableCount: 0, warningCount: 1, unstableCount: 0, score: 82, settled: true, maxHorizontalShiftM: .02, maxVerticalShiftM: .003, maxTiltDeg: 2.1, maxLinearSpeedMps: .01, maxAngularSpeedRadps: .02, placements: [], summary: 'warn' },
    { ...scenarioBase, scenario: 'cornering', stableCount: 1, warningCount: 0, unstableCount: 0, score: 100, settled: true, maxHorizontalShiftM: .005, maxVerticalShiftM: .002, maxTiltDeg: .4, maxLinearSpeedMps: 0, maxAngularSpeedRadps: 0, placements: [], summary: 'ok' },
  ],
  summary: 'warn',
};

describe('physics report', () => {
  it('renders scenario summary and escapes user cargo text', () => {
    const html = buildPhysicsReportHtml(container, cargo, loading, physics);
    expect(html).toContain('급제동 0.5g');
    expect(html).toContain('82/100');
    expect(html).toContain('&lt;BOX&gt;');
    expect(html).toContain('&lt;위험&gt;');
    expect(html).not.toContain('<위험>');
  });
});
