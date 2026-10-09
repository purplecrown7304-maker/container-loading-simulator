import { runInertiaAnimation, type InertiaAnimationResult, type InertiaSecuringProfile } from './inertiaSimulation';
import { runPhysicsValidation, type PhysicsScenario, type PhysicsSupport, type PhysicsValidationResult } from './physicsValidation';
import type { ContainerSpec, Placement } from './types';

/**
 * One independent Rapier scenario. Every scenario builds its own world from these inputs only,
 * so running it on the UI thread or in any worker gives the same deterministic result.
 */
export type PhysicsScenarioJob =
  | { kind: 'physics'; container: ContainerSpec; placements: Placement[]; scenario: PhysicsScenario; supports: PhysicsSupport[] }
  | { kind: 'inertia'; container: ContainerSpec; placements: Placement[]; scenario: PhysicsScenario; supports: PhysicsSupport[]; securing?: InertiaSecuringProfile };

export type PhysicsScenarioJobResult<J extends PhysicsScenarioJob> =
  J extends { kind: 'physics' } ? PhysicsValidationResult : InertiaAnimationResult;

export function runPhysicsScenarioJob<J extends PhysicsScenarioJob>(
  job: J,
  onProgress?: (value: number) => void,
  shouldCancel?: () => boolean,
): Promise<PhysicsScenarioJobResult<J>> {
  if (job.kind === 'physics') {
    return runPhysicsValidation(job.container, job.placements, onProgress, job.scenario, job.supports) as Promise<PhysicsScenarioJobResult<J>>;
  }
  // Certification only needs motion metrics; frames are never transferred.
  return runInertiaAnimation(job.container, job.placements, job.scenario, job.supports, onProgress, job.securing,
    { captureFrames: false, shouldCancel }) as Promise<PhysicsScenarioJobResult<J>>;
}
