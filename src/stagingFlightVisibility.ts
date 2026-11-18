import { createExternalStore } from './store/externalStore';
import { STAGING_FLIGHT_PROFILE } from './stagingFlights';

/**
 * True only while a yard-to-vehicle flight is on screen. Display state: it carries no plan,
 * result or certification data, and nothing but the timing of an overlay may depend on it.
 */
const store = createExternalStore(false);
let release: ReturnType<typeof setTimeout> | undefined;

/**
 * Longest one flight sequence can last (preparation, stagger across the batch, travel) plus
 * a margin for a slow first frame. A hidden or failed viewer never reports completion, so
 * the flag is dropped after this long whatever happens.
 */
export const STAGING_FLIGHT_MAX_VISIBLE_MS = STAGING_FLIGHT_PROFILE.prepareDurationMs + STAGING_FLIGHT_PROFILE.maxStaggerMs
  + STAGING_FLIGHT_PROFILE.durationMs + 800;

export function setStagingFlightVisible(visible: boolean) {
  if (release !== undefined) { clearTimeout(release); release = undefined; }
  store.setSnapshot(visible);
  if (visible) release = setTimeout(() => { release = undefined; store.setSnapshot(false); }, STAGING_FLIGHT_MAX_VISIBLE_MS);
}

export const readStagingFlightVisible = store.getSnapshot;
export const useStagingFlightVisible = store.useSnapshot;
