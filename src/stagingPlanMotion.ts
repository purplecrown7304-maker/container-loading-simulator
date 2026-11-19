/** Sent when an accepted plan is about to be replaced by another accepted plan of the same
 * input without the cargo passing through the yard: a manual move, a group move, its undo,
 * or an adopted alternative layout. The staging view then shows the units that change
 * place hopping to it instead of jumping. Display only: nothing is validated, counted or
 * saved because of this request, and it lapses if no plan follows. */
export const STAGING_PLAN_MOTION_EVENT = 'container-loading:staging-plan-motion';

/** How long a request waits for the replacing plan before it is forgotten. */
export const STAGING_PLAN_MOTION_WAIT_MS = 1500;

/** Call after the replacing plan has been handed over, in the same task. */
export function requestStagingPlanMotion(): void {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  window.dispatchEvent(new CustomEvent(STAGING_PLAN_MOTION_EVENT));
}
