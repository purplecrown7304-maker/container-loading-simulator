import { auditLoading } from './loadingAudit';
import { preflightCargoInput } from './inputPreflight';
import { validateOperationalLoading } from './operationalValidator';
import { boxSecuringRequirements } from './securingBudget';
import { gapSecuringPlan } from './gapSecuring';
import { usesHeavyInnerLoading, heavyInnerConflictFindings } from './heavyInnerPolicy';
import { decorateLimitReview } from './limitReview';
import { readSecuringMaterialSettings } from '../securingMaterialSettings';
import type { CargoItem, ContainerSpec, LoadingResult, OperationalRuleFinding, Placement, ValidationIssue } from './types';

const EPS = 1e-6;

function validationKey(issue: ValidationIssue) {
  const code = issue.message.match(/^([A-Z_]+):/)?.[1] ?? '';
  return `${issue.type}|${code}`;
}

function findingMagnitude(finding: OperationalRuleFinding) {
  if (!Number.isFinite(finding.value) || !Number.isFinite(finding.limit)) return null;
  const value = finding.value as number;
  const limit = finding.limit as number;
  if (finding.code === 'INSUFFICIENT_SUPPORT') return Math.max(0, limit - value);
  return Math.max(0, value - limit);
}

function operationalRegressionReasons(before: OperationalRuleFinding[], after: OperationalRuleFinding[]) {
  const reasons: string[] = [];
  const beforeErrors = before.filter(f => f.severity === 'error');
  const afterErrors = after.filter(f => f.severity === 'error');
  const beforeByCode = new Map<string, OperationalRuleFinding[]>();
  for (const finding of beforeErrors) {
    const list = beforeByCode.get(finding.code) ?? [];
    list.push(finding);
    beforeByCode.set(finding.code, list);
  }

  for (const finding of afterErrors) {
    const previous = beforeByCode.get(finding.code) ?? [];
    if (!previous.length) {
      reasons.push(`새 운영 오류가 발생합니다: ${finding.code} · ${finding.message}`);
      continue;
    }
    const nextMagnitude = findingMagnitude(finding);
    const previousMagnitudes = previous.map(findingMagnitude).filter((value): value is number => value !== null);
    if (nextMagnitude !== null && previousMagnitudes.length) {
      if (nextMagnitude > Math.max(...previousMagnitudes) + EPS) {
        reasons.push(`기존 운영 오류가 악화됩니다: ${finding.code} · ${finding.message}`);
      }
      continue;
    }
    const previousAffected = new Set(previous.flatMap(row => row.placementIndexes));
    const addsAffected = finding.placementIndexes.some(index => !previousAffected.has(index));
    if (addsAffected || previous.length < afterErrors.filter(row => row.code === finding.code).length) {
      reasons.push(`기존 운영 오류의 영향 범위가 커집니다: ${finding.code} · ${finding.message}`);
    }
  }
  return [...new Set(reasons)];
}

function validationRegressionReasons(before: ValidationIssue[], after: ValidationIssue[], beforeTransportKg: number, afterTransportKg: number) {
  const reasons: string[] = [];
  const beforeByKey = new Map<string, ValidationIssue[]>();
  for (const issue of before) {
    const key = validationKey(issue);
    const list = beforeByKey.get(key) ?? [];
    list.push(issue);
    beforeByKey.set(key, list);
  }
  for (const issue of after) {
    const key = validationKey(issue);
    const previous = beforeByKey.get(key) ?? [];
    if (!previous.length) {
      reasons.push(`새 안전 차단 오류가 발생합니다: ${issue.message}`);
      continue;
    }
    if (issue.type === 'PAYLOAD' && afterTransportKg > beforeTransportKg + EPS) {
      reasons.push(`기존 총중량 초과가 악화됩니다: ${issue.message}`);
      continue;
    }
    const previousAffected = new Set(previous.flatMap(row => row.placementIndexes));
    if (issue.placementIndexes.some(index => !previousAffected.has(index))
      || previous.length < after.filter(row => validationKey(row) === key).length) {
      reasons.push(`기존 안전 오류의 영향 범위가 커집니다: ${issue.message}`);
    }
  }
  return [...new Set(reasons)];
}

export function recomputeManualEditResult(
  container: ContainerSpec,
  cargo: CargoItem[],
  source: LoadingResult,
  placements: Placement[],
  conflictStrategy: 'capacity' | 'unloading',
) {
  const preflight = preflightCargoInput(cargo);
  const approvedDirectBox = usesHeavyInnerLoading(container, preflight.cargo);
  const level = source.securingBudget?.level ?? 1;
  const materials = readSecuringMaterialSettings();
  const countWeightKg = boxSecuringRequirements(placements.length, level, materials).weightKg;
  const voidFillPlan = approvedDirectBox ? gapSecuringPlan(container, placements, materials) : undefined;
  const requiredWeightKg = Math.max(countWeightKg, voidFillPlan?.weightKg ?? 0);
  const loadedWeightKg = placements.reduce((sum, placement) => sum + placement.weightKg, 0);
  const validationIssues = auditLoading(
    container,
    container.limitReview === undefined ? cargo : preflight.cargo,
    placements,
  );
  if (loadedWeightKg + requiredWeightKg > container.maxPayloadKg + EPS
    && !validationIssues.some(issue => issue.type === 'PAYLOAD')) {
    validationIssues.push({
      type: 'PAYLOAD',
      message: '화물과 필수 고정·메움재 합계가 원래 허용 적재 중량을 초과합니다.',
      placementIndexes: [],
    });
  }
  const operationalFindings = [
    ...validateOperationalLoading(container, cargo, placements, [], { approvedDirectBox }),
    ...heavyInnerConflictFindings(container, cargo, placements, conflictStrategy),
  ];
  const result: LoadingResult = decorateLimitReview(container, cargo, {
    ...source,
    placements,
    validationIssues,
    operationalFindings,
    loadedWeightKg,
    voidFillPlan,
    securingBudget: {
      level,
      reservedWeightKg: Math.max(source.securingBudget?.reservedWeightKg ?? 0, requiredWeightKg),
      requiredWeightKg,
      totalTransportWeightKg: loadedWeightKg + requiredWeightKg,
    },
  });
  return result;
}

export function manualEditRegressionReasons(before: LoadingResult, after: LoadingResult) {
  return [
    ...validationRegressionReasons(
      before.validationIssues,
      after.validationIssues,
      before.securingBudget?.totalTransportWeightKg ?? before.loadedWeightKg,
      after.securingBudget?.totalTransportWeightKg ?? after.loadedWeightKg,
    ),
    ...operationalRegressionReasons(before.operationalFindings ?? [], after.operationalFindings ?? []),
  ];
}
