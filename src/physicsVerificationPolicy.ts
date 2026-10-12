import { describePhysicsMotion, isPhysicsMotionSettled, isCompleteSecuredPhysicsDuration } from './engine/physicsValidation';
import type { PhysicsSupport, PhysicsValidationResult, PhysicsValidationSuite } from './engine/physicsValidation';
import { buildInertiaSimulationSupports, createPhysicsTargetSignature, securingProfileForUsage, type InertiaCertification } from './inertiaCertification';
import { createSecuredPhysicsSignature } from './securedPhysicsCertification';
import type { PhysicsTarget } from './physicsTarget';

const SCENARIOS = ['settle', 'acceleration', 'braking', 'cornering'] as const;
export type PhysicsVerificationState = {
  status: 'missing' | 'stale' | 'incomplete' | 'failed' | 'passed';
  reasons: string[];
};

function completeResult(result: PhysicsValidationSuite | PhysicsValidationResult, target: PhysicsTarget, supports: PhysicsSupport[]): boolean {
  if (!result || typeof result !== 'object') return false;
  const cargoCount = target.result.placements.length, supportCount = supports.length;
  const counts = [result.stableCount, result.warningCount, result.unstableCount,
    result.supportStableCount, result.supportWarningCount, result.supportUnstableCount];
  const metrics = [result.score, result.maxHorizontalShiftM, result.maxVerticalShiftM,
    result.maxTiltDeg, result.maxLinearSpeedMps, result.maxAngularSpeedRadps];
  return result.engine === 'Rapier 3D' && typeof result.settled === 'boolean'
    && counts.every(value => Number.isInteger(value) && value >= 0)
    && counts.slice(0, 3).reduce((sum, value) => sum + value, 0) === cargoCount
    && counts.slice(3).reduce((sum, value) => sum + value, 0) === supportCount
    && metrics.every(value => Number.isFinite(value) && value >= 0) && result.score <= 100
    && Array.isArray(result.placements) && result.placements.length === cargoCount
    && Array.isArray(result.supports) && result.supports.length === supportCount
    && result.placements.every((item, index) => item != null && item.index === index && item.cargoId === target.result.placements[index].cargoId)
    && result.supports.every((item, index) => item != null && item.index === index && item.id === supports[index].id)
    && ['stable', 'warning', 'unstable'].every((severity, index) =>
      result.placements.filter(item => item.severity === severity).length === counts[index]
      && result.supports.filter(item => item.severity === severity).length === counts[index + 3])
    && [...result.placements, ...result.supports].every(item =>
      ['stable', 'warning', 'unstable'].includes(item.severity) && typeof item.outOfBounds === 'boolean'
      && [item.horizontalShiftM, item.verticalShiftM, item.tiltDeg, item.linearSpeedMps, item.angularSpeedRadps].every(Number.isFinite)
      && [item.horizontalShiftM, item.tiltDeg, item.linearSpeedMps, item.angularSpeedRadps].every(value => value >= 0)
      && describePhysicsMotion(item).severity === item.severity
      && result.maxHorizontalShiftM >= item.horizontalShiftM
      && result.maxVerticalShiftM >= Math.abs(item.verticalShiftM)
      && result.maxTiltDeg >= item.tiltDeg
      && result.maxLinearSpeedMps >= item.linearSpeedMps
      && result.maxAngularSpeedRadps >= item.angularSpeedRadps)
    && result.settled === isPhysicsMotionSettled(result.maxLinearSpeedMps, result.maxAngularSpeedRadps)
    && describePhysicsMotion({ horizontalShiftM: result.maxHorizontalShiftM, verticalShiftM: result.maxVerticalShiftM,
      tiltDeg: result.maxTiltDeg, linearSpeedMps: result.maxLinearSpeedMps, angularSpeedRadps: result.maxAngularSpeedRadps,
      outOfBounds: [...result.placements, ...result.supports].some(item => item.outOfBounds) }).severity
      === (result.unstableCount + result.supportUnstableCount > 0 ? 'unstable' : result.warningCount + result.supportWarningCount > 0 ? 'warning' : 'stable');
}

/** Only full-motion evidence from the selected secured world may approve the final plan. */
export function assessPhysicsVerification(target: PhysicsTarget, certification: InertiaCertification | undefined): PhysicsVerificationState {
  const result = certification?.physicsValidation;
  if (!result) return { status: 'missing', reasons: ['현재 보강 조건의 최종 물리검증 결과가 없습니다. 현재 적재안으로 다시 검사하세요.'] };
  if (certification.mode !== target.mode || certification.targetSignature !== createPhysicsTargetSignature(target)
    || certification.physicsValidationSignature !== createSecuredPhysicsSignature(target, certification.securing)
    || JSON.stringify(result.securingProfile) !== JSON.stringify(securingProfileForUsage(target.mode, certification.securing))) {
    return { status: 'stale', reasons: ['최종 물리검증이 현재 적재안·보강 조건과 일치하지 않습니다. 다시 검사하세요.'] };
  }
  const cargoCount = target.result.placements.length;
  const supports = buildInertiaSimulationSupports(target, certification.securing);
  const supportCount = supports.length;
  if (!completeResult(result, target, supports) || !Array.isArray(result.scenarios)
    || result.scenarios.length !== SCENARIOS.length
    || !SCENARIOS.every(scenario => result.scenarios.filter(row => row?.scenario === scenario).length === 1)
    || !result.scenarios.every(row => row != null && JSON.stringify(row.securingProfile) === JSON.stringify(result.securingProfile)
      && completeResult(row, target, supports)
      && row.simulatedCount === cargoCount && row.supportCount === supportCount
      && isCompleteSecuredPhysicsDuration(cargoCount + supportCount, row.steps, row.simulatedSeconds))) {
    return { status: 'incomplete', reasons: ['최종 보강 물리검증 근거가 누락되었거나 유효하지 않습니다. 4종 시나리오를 다시 검사하세요.'] };
  }
  const rows = [result, ...result.scenarios];
  const unstable = Math.max(...rows.map(row => row.unstableCount + row.supportUnstableCount));
  const unstableDetails = rows.some(row => [...row.placements, ...row.supports].some(item => item.severity === 'unstable' || item.outOfBounds));
  const reasons: string[] = [];
  if (unstable > 0 || unstableDetails) reasons.push(`최종 보강 물리검증에서 불안정 화물/지지대 ${unstable || '상세'}건이 감지되었습니다.`);
  if (rows.some(row => !row.settled)) reasons.push('최종 보강 물리검증에서 잔류 움직임이 감지되었습니다.');
  return reasons.length ? { status: 'failed', reasons } : { status: 'passed', reasons: [] };
}
