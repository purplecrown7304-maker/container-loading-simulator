export const PLACEMENT_SELECT_EVENT = 'container-loading:placement-select';

export type PlacementSelectDetail = { index: number | null };

export function selectPlacement(index: number | null) {
  window.dispatchEvent(new CustomEvent<PlacementSelectDetail>(PLACEMENT_SELECT_EVENT, { detail: { index } }));
}
