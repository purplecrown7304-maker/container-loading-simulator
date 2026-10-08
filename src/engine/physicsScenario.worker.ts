import { runPhysicsScenarioJob, type PhysicsScenarioJob } from './physicsScenarioJob';

/** Runs one Rapier scenario off the UI thread. The pool sends one job at a time per worker. */
self.onmessage = async (event: MessageEvent<{ id: number; job: PhysicsScenarioJob }>) => {
  const { id, job } = event.data;
  try {
    let last = -1;
    const result = await runPhysicsScenarioJob(job, value => {
      // Coalesce progress messages to whole percents.
      const percent = Math.floor(value * 100);
      if (percent === last) return;
      last = percent;
      self.postMessage({ id, progress: value });
    });
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : '물리 시나리오 계산에 실패했습니다.' });
  }
};
