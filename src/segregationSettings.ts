import type { CargoItem, ContainerSpec } from './engine/types';

/**
 * LOADING_RULES R-6 input (대표 결정 2026-10-08). Class and zone names are stored as the labels
 * shown to the worker, so validation messages read the same as the screen. Nothing is forbidden
 * until the user registers a pair; the recommended pairs are an explicit, optional action.
 */
export const SEGREGATION_CLASSES = ['일반', '식품', '화학품', '위험물', '악취·오염'] as const;
export const TEMP_ZONES = ['상온', '냉장', '냉동'] as const;
export const RECOMMENDED_INCOMPATIBLE_PAIRS: ReadonlyArray<[string, string]> = [
  ['식품', '화학품'], ['식품', '위험물'], ['식품', '악취·오염'],
];

type Pair = [string, string];
const pairKey = (a: string, b: string) => [a, b].sort().join('\u0000');

/** Trimmed, de-duplicated, order-independent pairs; self pairs and blanks are dropped. */
export function normalizeIncompatiblePairs(pairs: ContainerSpec['incompatiblePairs']): Pair[] {
  const seen = new Set<string>();
  const out: Pair[] = [];
  for (const pair of pairs ?? []) {
    const a = pair?.[0]?.trim(), b = pair?.[1]?.trim();
    if (!a || !b || a === b) continue;
    const key = pairKey(a, b);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([a, b]);
  }
  return out;
}

export function addIncompatiblePair(pairs: ContainerSpec['incompatiblePairs'], a: string, b: string): Pair[] {
  return normalizeIncompatiblePairs([...(pairs ?? []), [a, b]]);
}

export function removeIncompatiblePair(pairs: ContainerSpec['incompatiblePairs'], a: string, b: string): Pair[] {
  const key = pairKey(a.trim(), b.trim());
  return normalizeIncompatiblePairs(pairs).filter(pair => pairKey(pair[0], pair[1]) !== key);
}

export function addRecommendedPairs(pairs: ContainerSpec['incompatiblePairs']): Pair[] {
  return normalizeIncompatiblePairs([...(pairs ?? []), ...RECOMMENDED_INCOMPATIBLE_PAIRS]);
}

/** What the current input would trip, for an on-screen notice before loading runs. */
export function segregationPreview(container: Pick<ContainerSpec, 'incompatiblePairs'>, cargo: Array<Pick<CargoItem, 'quantity' | 'segregationClass' | 'tempZone'>>) {
  const active = cargo.filter(item => item.quantity > 0);
  const classes = new Set(active.map(item => item.segregationClass?.trim()).filter((value): value is string => Boolean(value)));
  const zones = [...new Set(active.map(item => item.tempZone?.trim()).filter((value): value is string => Boolean(value)))].sort();
  const conflicts = normalizeIncompatiblePairs(container.incompatiblePairs).filter(([a, b]) => classes.has(a) && classes.has(b));
  return { conflicts, mixedZones: zones.length > 1 ? zones : [] };
}
