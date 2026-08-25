import { describe, expect, it } from 'vitest';
import { runInertiaAnimation } from './inertiaSimulation';
import type { ContainerSpec, Placement } from './types';

const container: ContainerSpec = { length: 2, width: 2, height: 2, maxPayloadKg: 1000 };

const floatingBox: Placement = {
  cargoId: 'BOX-A',
  x: 0.5,
  y: 0.5,
  z: 0.9,
  length: 0.5,
  width: 0.5,
  height: 0.4,
  weightKg: 20,
};

describe('inertia animation frames', () => {
  it('records actual Rapier motion frames for visual playback', async () => {
    const result = await runInertiaAnimation(container, [floatingBox], 'acceleration');
    expect(result.frames.length).toBeGreaterThan(20);
    expect(result.cargoCount).toBe(1);
    expect(result.scenario).toBe('acceleration');
    const firstY = result.frames[0].cargo[1];
    const lastY = result.frames[result.frames.length - 1].cargo[1];
    expect(lastY).toBeLessThan(firstY - 0.5);
    expect(result.frames.some(frame => frame.phase === 'force')).toBe(true);
    expect(result.frames.some(frame => frame.phase === 'coast')).toBe(true);
  }, 20_000);
});
