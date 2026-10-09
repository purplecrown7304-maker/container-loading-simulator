import { expect, it } from 'vitest';
import { AUTOMATIC_ALTERNATIVE_BODY_BUDGET, automaticAlternativeLimit } from './finalResultOptimization';

it('keeps the automatic alternative count for ordinary loads and shrinks it deterministically for large loads', () => {
  expect(AUTOMATIC_ALTERNATIVE_BODY_BUDGET).toBe(12_000);
  expect(automaticAlternativeLimit(7, 0)).toBe(7);
  expect(automaticAlternativeLimit(7, 300)).toBe(7);
  expect(automaticAlternativeLimit(7, 1_714)).toBe(7);
  expect(automaticAlternativeLimit(7, 1_715)).toBe(6);
  expect(automaticAlternativeLimit(7, 1_562)).toBe(7);
  expect(automaticAlternativeLimit(7, 4_000)).toBe(3);
  expect(automaticAlternativeLimit(7, 9_200)).toBe(1);
  expect(automaticAlternativeLimit(7, 12_000)).toBe(1);
  expect(automaticAlternativeLimit(7, 12_001)).toBe(0);
  // Same input, same answer: no timing or device dependence.
  expect(automaticAlternativeLimit(7, 9_200)).toBe(automaticAlternativeLimit(7, 9_200));
});
