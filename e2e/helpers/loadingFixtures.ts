// Real floor-supported fixtures span the equipment's length under heavy-inner
// loading. A handful of tiny cartons at X=0 correctly fails the retained CG gate.
// These exact dimensions are exercised with loadContainer and real Rapier in
// src/guidedLoadingFixtures.test.ts; never replace certification with a mock.
export type DirectLoadingFixture = { length: number; width: number; height: number; weightKg: number };

export const directLoadingFixtures = {
  threeBox40ft: { length: 4, width: 2.3, height: 0.2, weightKg: 2, quantity: 3 },
  sixBox20ft: { length: 0.98, width: 2.3, height: 0.1, weightKg: 1, quantity: 6 },
  twelveBox40ft: { length: 1, width: 2.3, height: 0.5, weightKg: 1, quantity: 12 },
  unstableTwoBox20ft: { length: 5.6, width: 0.08, height: 2, weightKg: 1, quantity: 2 },
  blockedSmallLoad: { length: 0.2, width: 0.15, height: 0.1, weightKg: 1, quantity: 3 },
} as const;
