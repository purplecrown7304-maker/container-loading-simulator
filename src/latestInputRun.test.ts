import { expect, it } from 'vitest';
import { createLatestInputRun } from './latestInputRun';

it('new input cancels the previous run and old completion cannot finish the new run', () => {
  const requests = createLatestInputRun();
  const first = requests.start();
  requests.cancel();
  const second = requests.start();
  expect(first.signal.aborted).toBe(true);
  expect(requests.owns(first)).toBe(false);
  expect(requests.finish(first)).toBe(false);
  expect(requests.owns(second)).toBe(true);
  expect(requests.finish(second)).toBe(true);
  expect(requests.owns(second)).toBe(false);
});

it('starting a newer run cancels an earlier run even without a separate invalidation', () => {
  const requests = createLatestInputRun();
  const first = requests.start();
  const second = requests.start();
  expect(first.signal.aborted).toBe(true);
  expect(requests.owns(second)).toBe(true);
});
