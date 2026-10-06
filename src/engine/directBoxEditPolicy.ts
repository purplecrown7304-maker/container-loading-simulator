import { gapSecuringPlan } from './gapSecuring';
import { usesHeavyInnerLoading } from './heavyInnerPolicy';
import { boxSecuringRequirements, type BoxSecuringLevel } from './securingBudget';
import type { SecuringMaterialSettings } from '../securingMaterialSettings';
import type { CargoItem, ContainerSpec, LoadingResult, OperationalRuleFinding, Placement, ValidationIssue } from './types';

const EPS = 1e-6;

export function editedSecuringEvidence(
  container: ContainerSpec,
  cargo: CargoItem[],
  placements: Placement[],
  level: BoxSecuringLevel,
  materials: SecuringMaterialSettings,
) {
  const requiredWeightKg = boxSecuringRequirements(placements.length, level, materials).weightKg;
  const voidFillPlan = usesHeavyInnerLoading(container, cargo) ? gapSecuringPlan(container, placements, materials) : undefined;
  const voidFillWeightKg = voidFillPlan?.weightKg ?? 0;
  const transportSecuringWeightKg = Math.max(requiredWeightKg, voidFillWeightKg);
  const loadedWeightKg = placements.reduce((sum, placement) => sum + placement.weightKg, 0);
  return {
    requiredWeightKg,
    voidFillPlan,
    voidFillWeightKg,
    transportSecuringWeightKg,
    totalTransportWeightKg: loadedWeightKg + transportSecuringWeightKg,
  };
}

type ErrorSignature = { count: number; maxExcess: number; maxAffected: number };

function validationSignatures(issues: ValidationIssue[]) {
  const map = new Map<string, ErrorSignature>();
  for (const issue of issues) {
    const row = map.get(issue.type) ?? { count: 0, maxExcess: 0, maxAffected: 0 };
    row.count += 1;
    row.maxAffected = Math.max(row.maxAffected, issue.placementIndexes.length);
    map.set(issue.type, row);
  }
  return map;
}

function operationalSignatures(findings: OperationalRuleFinding[]) {
  const map = new Map<string, ErrorSignature>();
  for (const finding of findings.filter(row => row.severity === 'error')) {
    const row = map.get(finding.code) ?? { count: 0, maxExcess: 0, maxAffected: 0 };
    row.count += 1;
    row.maxAffected = Math.max(row.maxAffected, finding.placementIndexes.length);
    if (Number.isFinite(finding.value) && Number.isFinite(finding.limit)) {
      row.maxExcess = Math.max(row.maxExcess, Math.max(0, finding.value! - finding.limit!));
    }
    map.set(finding.code, row);
  }
  return map;
}

function regressionReasons(
  before: Map<string, ErrorSignature>,
  after: Map<string, ErrorSignature>,
  label: (code: string) => string,
) {
  const reasons: string[] = [];
  for (const [code, next] of after) {
    const previous = before.get(code);
    if (!previous) {
      reasons.push(`새 차단/오류가 발생했습니다: ${label(code)}`);
      continue;
    }
    if (next.count > previous.count
      || next.maxExcess > previous.maxExcess + EPS
      || (next.maxExcess <= EPS && previous.maxExcess <= EPS && next.maxAffected > previous.maxAffected)) {
      reasons.push(`기존 오류가 악화되었습니다: ${label(code)}`);
    }
  }
  return reasons;
}

/**
 * Manual/group edits may keep an existing error only when they do not make it worse.
 * They never erase the finding from the result, so an unsafe layout cannot become PASS.
 */
export function editRegressionReasons(source: LoadingResult, candidate: LoadingResult) {
  return [
    ...regressionReasons(
      validationSignatures(source.validationIssues ?? []),
      validationSignatures(candidate.validationIssues ?? []),
      code => code,
    ),
    ...regressionReasons(
      operationalSignatures(source.operationalFindings ?? []),
      operationalSignatures(candidate.operationalFindings ?? []),
      code => code,
    ),
  ];
}
