import { describe, expect, it } from 'vitest';
import { CAMERA_VIEW_TRANSITION_MS, cameraFitAction, cameraMotionEase, createCameraMotion, sampleCameraMotion } from './cameraMotion';

describe('display-only explicit camera motion', () => {
  it('eases position and orbit target together without changing its source poses', () => {
    const from = { position: [0, 2, 4] as [number, number, number], target: [0, 0, 0] as [number, number, number] };
    const to = { position: [8, 6, 12] as [number, number, number], target: [4, 2, 4] as [number, number, number] };
    const before = JSON.stringify({ from, to }), motion = createCameraMotion(from, to, 100);
    expect(motion.durationMs).toBe(375); expect(CAMERA_VIEW_TRANSITION_MS).toBe(375);
    expect(sampleCameraMotion(motion, 0)).toMatchObject(from);
    const quarter = sampleCameraMotion(motion, 100 + 375 / 4);
    expect(quarter.position[0]).toBe(.5); expect(quarter.target[0]).toBe(.25); expect(quarter.complete).toBe(false);
    expect(sampleCameraMotion(motion, 100 + 375 / 2)).toMatchObject({ position: [4, 4, 8], target: [2, 1, 2], progress: .5, complete: false });
    expect(cameraMotionEase(.25)).toBeLessThan(.25); expect(cameraMotionEase(.75)).toBeGreaterThan(.75);
    expect(JSON.stringify({ from, to })).toBe(before);
    from.position[0] = 99; expect(motion.from.position[0]).toBe(0);
  });
  it('finishes at the exact requested endpoint after a delayed frame and has bounded easing', () => {
    const motion = createCameraMotion({ position: [0, 0, 0], target: [1, 1, 1] }, { position: [.1, .2, .3], target: [8, 9, 10] }, 0);
    expect(sampleCameraMotion(motion, 375)).toEqual({ position: [.1, .2, .3], target: [8, 9, 10], progress: 1, complete: true });
    expect(sampleCameraMotion(motion, 99999)).toMatchObject(motion.to);
    expect(cameraMotionEase(-1)).toBe(0); expect(cameraMotionEase(2)).toBe(1);
  });
  it('animates explicit main requests while initial, physical changes, reduced motion and diagnostics fit instantly', () => {
    const previous = { physical: 'truck-A', request: 'all:0' }, next = { physical: 'truck-A', request: 'yard:1' };
    const options = { staging: true, reducedMotion: false, instant: false };
    expect(cameraFitAction(previous, previous, options)).toBe('skip');
    expect(cameraFitAction(previous, next, options)).toBe('animate');
    expect(cameraFitAction(null, next, options)).toBe('instant');
    expect(cameraFitAction(previous, { ...next, physical: 'truck-B' }, options)).toBe('instant');
    for (const changes of [{ staging: false }, { reducedMotion: true }, { instant: true }]) expect(cameraFitAction(previous, next, { ...options, ...changes })).toBe('instant');
    expect(() => createCameraMotion({ position: [NaN, 0, 0], target: [0, 0, 0] }, { position: [1, 1, 1], target: [0, 0, 0] }, 0)).toThrow();
  });
});
