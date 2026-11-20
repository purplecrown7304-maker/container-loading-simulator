import { readGuidedLoadingUnit } from './guidedLoadingUnitState';
import { readLoadingRuleset } from './loadingRulesPreference';
import { readStoredState } from './storage';
import { readTransportEquipment } from './transportEquipment';

/**
 * What a "run loading" request was made for: the rule set, the loading type, the selected
 * equipment and the stored job (container and cargo).
 *
 * Two guards hold a run request back for a couple of frames and issue it again once the stored
 * job has reached the app. If the operator changes the rules or the job in that gap, the request
 * belongs to an input that no longer exists: issuing it again would plan and verify the new
 * input although nobody asked for that. A guard compares this key before it replays.
 *
 * A stored plan or staging record is not part of the key: the app saves those on its own while a
 * request is held, and they do not change what is asked for.
 */
export function loadingRunContextKey(): string {
  const stored = readStoredState();
  const equipment = readTransportEquipment();
  return JSON.stringify({
    ruleset: readLoadingRuleset(),
    unit: readGuidedLoadingUnit(),
    equipment: [equipment.id, equipment.length, equipment.width, equipment.height, equipment.maxPayloadKg, equipment.floorLoadLimitKgPerM2],
    container: stored?.container ?? null,
    cargo: stored?.cargo ?? null,
  });
}
