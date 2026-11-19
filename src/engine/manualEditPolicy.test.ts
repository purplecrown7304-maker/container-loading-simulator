import { describe, expect, it } from 'vitest';
import { MANUAL_MOVE_VERDICT_CODES, manualEditRegressionReasons, manualMoveBalanceCautions } from './manualEditPolicy';
import type { LoadingResult, OperationalRuleFinding } from './types';

const finding = (code: string, value?: number, limit?: number, severity: OperationalRuleFinding['severity'] = 'error'): OperationalRuleFinding =>
  ({ code, severity, message: `${code} message`, placementIndexes: [], value, limit });
const plan = (...operationalFindings: OperationalRuleFinding[]): LoadingResult =>
  ({ placements: [], remaining: [], loadedWeightKg: 0, usedVolumeM3: 0, validationIssues: [], operationalFindings });

describe('what refuses an edit made by hand', () => {
  it('refuses a new or worse centre-of-gravity error unless the caller treats balance as a verdict', () => {
    const before = plan(), after = plan(finding('CG_LATERAL', .18, .12));
    expect(manualEditRegressionReasons(before, after)).toEqual(['새 운영 오류가 발생합니다: CG_LATERAL · CG_LATERAL message']);
    expect(manualEditRegressionReasons(before, after, { balanceIsVerdict: false })).toHaveLength(1);
    expect(manualEditRegressionReasons(before, after, { balanceIsVerdict: true })).toEqual([]);
    const worse = plan(finding('CG_LONGITUDINAL', .9, .3));
    expect(manualEditRegressionReasons(plan(finding('CG_LONGITUDINAL', .5, .3)), worse).join()).toContain('기존 운영 오류가 악화됩니다');
    expect(manualEditRegressionReasons(plan(finding('CG_LONGITUDINAL', .5, .3)), worse, { balanceIsVerdict: true })).toEqual([]);
  });

  it('keeps refusing every other new error, also beside a balance error', () => {
    const after = plan(finding('CG_LATERAL', .18, .12), finding('FLOOR_LOAD_LIMIT', 1800, 1500), finding('INSUFFICIENT_SUPPORT', .6, .8));
    const reasons = manualEditRegressionReasons(plan(), after, { balanceIsVerdict: true });
    expect(reasons).toHaveLength(2); expect(reasons.join()).toContain('FLOOR_LOAD_LIMIT'); expect(reasons.join()).toContain('INSUFFICIENT_SUPPORT'); expect(reasons.join()).not.toContain('CG_LATERAL');
    // Only the two vehicle centre-of-gravity verdicts are carried; a unit's own support is not one of them.
    expect([...MANUAL_MOVE_VERDICT_CODES].sort()).toEqual(['CG_LATERAL', 'CG_LONGITUDINAL']);
    expect(manualEditRegressionReasons(plan(), plan(finding('CG_OUTSIDE_SUPPORT')), { balanceIsVerdict: true })).toHaveLength(1);
    // A blocking validation issue is never a verdict.
    const blocked = { ...plan(), validationIssues: [{ type: 'PAYLOAD' as const, message: '총중량 초과', placementIndexes: [] }] };
    expect(manualEditRegressionReasons(plan(), blocked, { balanceIsVerdict: true })).toHaveLength(1);
  });

  it('tells the operator about a balance error only when the edit made it or made it worse', () => {
    const lateral = finding('CG_LATERAL', .18, .12);
    expect(manualMoveBalanceCautions(plan(), plan(lateral))).toEqual([lateral]);
    // Unchanged or improved: nothing new to say.
    expect(manualMoveBalanceCautions(plan(finding('CG_LATERAL', .18, .12)), plan(lateral))).toEqual([]);
    expect(manualMoveBalanceCautions(plan(finding('CG_LATERAL', .3, .12)), plan(lateral))).toEqual([]);
    const worse = finding('CG_LATERAL', .25, .12);
    expect(manualMoveBalanceCautions(plan(lateral), plan(worse))).toEqual([worse]);
    // A second kind beside an existing one is new; warnings and other codes never are.
    const longitudinal = finding('CG_LONGITUDINAL', .9, .3);
    expect(manualMoveBalanceCautions(plan(lateral), plan(lateral, longitudinal))).toEqual([longitudinal]);
    expect(manualMoveBalanceCautions(plan(), plan(finding('CG_LATERAL', .18, .12, 'warning'), finding('FLOOR_LOAD_LIMIT', 1800, 1500)))).toEqual([]);
  });
});
