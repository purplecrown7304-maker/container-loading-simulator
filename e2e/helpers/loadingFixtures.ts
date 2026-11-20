// Real floor-supported fixtures exercise loading and certification without mocks.
// The light fixtures also run through loadContainer and real Rapier in
// src/guidedLoadingFixtures.test.ts. Tiny cartons now pass proportional CG;
// use the heavy inner-wall fixture to exercise the CG choice gate.
export type DirectLoadingFixture = { length: number; width: number; height: number; weightKg: number; quantity: number };

export const directLoadingFixtures = {
  threeBox40ft: { length: 4, width: 2.3, height: 0.2, weightKg: 2, quantity: 3 },
  sixBox20ft: { length: 0.98, width: 2.3, height: 0.1, weightKg: 1, quantity: 6 },
  twelveBox40ft: { length: 1, width: 2.3, height: 0.5, weightKg: 1, quantity: 12 },
  unstableTwoBox20ft: { length: 5.6, width: 0.08, height: 2, weightKg: 1, quantity: 2 },
  // Historical name retained for the source regression: this small load passes CG.
  blockedSmallLoad: { length: 0.2, width: 0.15, height: 0.1, weightKg: 1, quantity: 3 },
  // 1,217 kg/m² stays below the 1,500 floor limit. Two boxes fail proportional
  // longitudinal CG; one passes for both the 26,500 and 28,600 kg 40FT defaults.
  blockedHeavyInnerLoad: { length: 1, width: 2.3, height: 0.2, weightKg: 2800, quantity: 2 },
  // Direct products load in one layer: twelve of these slabs cover the 40FT floor and the rest
  // wait. Divided over two vehicles (AGENTS.md 2L) every slab stands on a floor and both pass:
  // 21 slabs give unequal shares (11 + 10), 20 slabs two identical ones (10 + 10).
  overflowTwentyOneBox40ft: { length: 1, width: 2.3, height: 0.5, weightKg: 1, quantity: 21 },
  overflowTwentyBox40ft: { length: 1, width: 2.3, height: 0.5, weightKg: 1, quantity: 20 },
} as const;
