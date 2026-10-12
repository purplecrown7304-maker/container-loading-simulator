import { runPhysicsValidationSuiteParallel } from './physicsParallel';
import { buildInertiaSimulationSupports, createPhysicsTargetSignature, securingProfileForUsage, type CertificationProgress, type InertiaCertification, type SecuringUsage } from './inertiaCertification';
import type { PhysicsTarget } from './physicsTarget';

/** Changing the plan, material quantities or the resulting profile invalidates this evidence. */
export function createSecuredPhysicsSignature(target: PhysicsTarget, usage: SecuringUsage): string {
  return JSON.stringify({ target: createPhysicsTargetSignature(target), usage,
    profile: securingProfileForUsage(target.mode, usage), supports: buildInertiaSimulationSupports(target, usage) });
}

/** Final full-motion checks run in exactly the world used by the selected inertia configuration. */
export async function completeSecuredPhysicsValidation(
  target: PhysicsTarget,
  certification: InertiaCertification,
  onProgress?: (progress: CertificationProgress) => void,
  shouldCancel?: () => boolean,
): Promise<InertiaCertification> {
  if (!certification.payloadWithinLimit || certification.testedScenarios !== 3) return certification;
  const signature = createSecuredPhysicsSignature(target, certification.securing);
  if (certification.physicsValidation && certification.physicsValidationSignature === signature) return certification;
  const controller = new AbortController();
  const checkCancelled = () => {
    if (shouldCancel?.()) { controller.abort(); throw new Error('INERTIA_CERTIFICATION_CANCELLED'); }
  };
  checkCancelled();
  const result = await runPhysicsValidationSuiteParallel(target.container, target.result.placements, (progress, scenario) => {
    checkCancelled();
    onProgress?.({ level: certification.securing.level, levelLabel: `${certification.securing.levelLabel} · 최종 보강 물리검증`,
      scenario, scenarioIndex: ['settle', 'acceleration', 'braking', 'cornering'].indexOf(scenario) + 1, scenarioCount: 4,
      physicsProgress: progress, stage: 'secured-physics' });
  }, buildInertiaSimulationSupports(target, certification.securing), controller.signal,
  securingProfileForUsage(target.mode, certification.securing));
  checkCancelled();
  return { ...certification, physicsValidation: result, physicsValidationSignature: signature };
}
