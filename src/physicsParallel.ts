import {
  combinePhysicsValidationResults,
  PHYSICS_SUITE_SCENARIOS,
  type PhysicsScenario,
  type PhysicsSupport,
  type PhysicsValidationSuite,
} from './engine/physicsValidation';
import type { ContainerSpec, Placement } from './engine/types';
import { runPhysicsScenarioPooled } from './physicsWorkerPool';

/**
 * Same result as `runPhysicsValidationSuite`: the four scenarios are independent worlds, run
 * concurrently on the worker pool and combined in the fixed scenario order.
 */
export async function runPhysicsValidationSuiteParallel(
  container: ContainerSpec,
  placements: Placement[],
  onProgress?: (progress: number, scenario: PhysicsScenario) => void,
  supports: PhysicsSupport[] = [],
  signal?: AbortSignal,
): Promise<PhysicsValidationSuite> {
  const scenarios = PHYSICS_SUITE_SCENARIOS;
  const progress = scenarios.map(() => 0);
  const report = () => {
    const total = progress.reduce((sum, value) => sum + value, 0) / scenarios.length;
    const active = scenarios[progress.findIndex(value => value < 1)] ?? scenarios[scenarios.length - 1];
    onProgress?.(total, active);
  };
  const controller = new AbortController();
  const forward = () => controller.abort();
  signal?.addEventListener('abort', forward, { once: true });
  try {
    report();
    const results = await Promise.all(scenarios.map((scenario, index) => runPhysicsScenarioPooled(
      { kind: 'physics', container, placements, scenario, supports },
      value => { progress[index] = Math.max(progress[index], value); report(); },
      controller.signal,
    ).catch(error => { controller.abort(); throw error; })));
    progress.fill(1);
    report();
    return combinePhysicsValidationResults(placements, supports, results);
  } finally {
    signal?.removeEventListener('abort', forward);
  }
}
