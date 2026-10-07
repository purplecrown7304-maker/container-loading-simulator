import { expect, it } from 'vitest';
import { voidFillDiagnosticPayloads } from './diagnosticExportV2';
import type { LoadingResult } from './engine/types';
import { VOID_FILL_DISCLAIMER } from './voidFillPresentation';

const result: LoadingResult = {
  placements: [],
  remaining: [],
  loadedWeightKg: 0,
  usedVolumeM3: 0,
  validationIssues: [],
  voidFillPlan: {
    fills: [{
      id: 'fill-side', kind: 'side-gap', material: 'dunnage-airbag',
      quantity: 3, weightKg: 1.77, fixedSupportEligible: true,
      gapM: .2, voidVolumeM3: .6,
      x: 1.2, y: 0, z: 0, length: .6, width: .2, height: 1,
    }],
    sideGapM: .2, rearGapM: 0, volumeM3: .6, weightKg: 1.77, unresolvedCount: 0,
  },
};

it('serializes void-fill location material quantity weight and disclaimer to JSON and CSV', () => {
  const payloads = voidFillDiagnosticPayloads(result);
  const json = JSON.parse(payloads.json);
  expect(json.plan.fills[0]).toMatchObject({
    id: 'fill-side', material: 'dunnage-airbag', quantity: 3, weightKg: 1.77,
    x: 1.2, y: 0, z: 0,
  });
  expect(json.disclaimer).toBe(VOID_FILL_DISCLAIMER);
  expect(payloads.csv).toContain('측면 틈');
  expect(payloads.csv).toContain('던니지 에어백');
  expect(payloads.csv).toContain('1.77');
  expect(payloads.csv).toContain(VOID_FILL_DISCLAIMER);
});
