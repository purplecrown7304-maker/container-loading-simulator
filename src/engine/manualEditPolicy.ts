import { auditLoading } from './loadingAudit';
import { preflightCargoInput } from './inputPreflight';
import { validateOperationalLoading } from './operationalValidator';
import { boxSecuringRequirements } from './securingBudget';
import { gapSecuringPlan } from './gapSecuring';
import { usesHeavyInnerLoading, heavyInnerConflictFindings } from './heavyInnerPolicy';
import { decorateLimitReview } from './limitReview';
import { readSecuringMaterialSettings, type SecuringMaterialSettings } from '../securingMaterialSettings';
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

/** Owner decision 2026-11-19 (LOADING_RULES section 7B): for cargo moved by hand in the
 * staging view, the vehicle's centre of gravity is a verdict the plan carries, not a
 * reason to refuse the move. Such a move is applied and the error stays on the plan,
 * which cannot pass transport verification or be dispatched while it stands. */
export const MANUAL_MOVE_VERDICT_CODES: ReadonlySet<string> = new Set(['CG_LONGITUDINAL', 'CG_LATERAL']);
const NO_VERDICT_CODES: ReadonlySet<string> = new Set();

/** Errors of `codes` that `after` has and `before` did not, or had smaller. */
function newOrWorse(before: OperationalRuleFinding[], after: OperationalRuleFinding[], codes: ReadonlySet<string>) {
  const previous = before.filter(f => f.severity === 'error' && codes.has(f.code));
  return after.filter(finding => {
    if (finding.severity !== 'error' || !codes.has(finding.code)) return false;
    const same = previous.filter(row => row.code === finding.code);
    if (!same.length) return true;
    const magnitude = findingMagnitude(finding), earlier = same.map(findingMagnitude).filter((value): value is number => value !== null);
    return magnitude !== null && earlier.length > 0 && magnitude > Math.max(...earlier) + EPS;
  });
}

function operationalRegressionReasons(before: OperationalRuleFinding[], after: OperationalRuleFinding[], verdictCodes: ReadonlySet<string> = NO_VERDICT_CODES) {
  const reasons: string[] = [];
  const beforeErrors = before.filter(f => f.severity === 'error' && !verdictCodes.has(f.code));
  const afterErrors = after.filter(f => f.severity === 'error' && !verdictCodes.has(f.code));
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
  materials: SecuringMaterialSettings = readSecuringMaterialSettings(),
) {
  const preflight = preflightCargoInput(cargo);
  const approvedDirectBox = usesHeavyInnerLoading(container, preflight.cargo);
  const level = source.securingBudget?.level ?? 1;
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
  if (voidFillPlan?.fills.length) {
    operationalFindings.push({
      code: 'VOID_FILL_REQUIRED',
      severity: 'warning',
      placementIndexes: [],
      value: voidFillPlan.volumeM3,
      message: `빈 공간 ${voidFillPlan.fills.length}곳(${voidFillPlan.volumeM3.toFixed(2)}m³)에 메움·버팀 계획이 필요합니다. 자재 ${voidFillPlan.weightKg.toFixed(2)}kg, 적용범위 밖 ${voidFillPlan.unresolvedCount}곳. 앱 기본값이며 현장 자재로 확인 필요합니다.`,
    });
  }
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

/** `balanceIsVerdict` leaves the centre-of-gravity errors out of the reasons to refuse
 * an edit; `manualMoveBalanceCautions` reports them instead. Every other new, worsened
 * or widened error refuses the edit exactly as before. */
export function manualEditRegressionReasons(before: LoadingResult, after: LoadingResult, options: { balanceIsVerdict?: boolean } = {}) {
  return [
    ...validationRegressionReasons(
      before.validationIssues,
      after.validationIssues,
      before.securingBudget?.totalTransportWeightKg ?? before.loadedWeightKg,
      after.securingBudget?.totalTransportWeightKg ?? after.loadedWeightKg,
    ),
    ...operationalRegressionReasons(before.operationalFindings ?? [], after.operationalFindings ?? [],
      options.balanceIsVerdict ? MANUAL_MOVE_VERDICT_CODES : NO_VERDICT_CODES),
  ];
}

/** The centre-of-gravity errors an edit would leave on the plan that were not there, or
 * were smaller, before it. They do not refuse the edit; they are what the operator is told. */
export function manualMoveBalanceCautions(before: LoadingResult, after: LoadingResult): OperationalRuleFinding[] {
  return newOrWorse(before.operationalFindings ?? [], after.operationalFindings ?? [], MANUAL_MOVE_VERDICT_CODES);
}
