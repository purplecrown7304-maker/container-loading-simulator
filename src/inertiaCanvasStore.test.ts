import { afterEach, describe, expect, it } from 'vitest';
import { clearPhysicsTarget, publishPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { buildSecuringUsage } from './inertiaCertification';
import { clearInertiaCanvasPlayback, inertiaHostMatchesTarget, nextInertiaCanvasRunId, publishInertiaCanvasPlayback, readInertiaCanvasHost, readInertiaCanvasPlayback, registerInertiaCanvasHost, type InertiaCanvasHost } from './inertiaCanvasStore';

const fixture: PhysicsTarget = {
  mode: 'pallets', container: { length: 3, width: 2, height: 2, maxPayloadKg: 100 }, cargo: [],
  result: { placements: [{ cargoId: 'A', x: 0, y: 0, z: 0.1, length: 1, width: 1, height: 1, weightKg: 1 }], remaining: [], loadedWeightKg: 2, usedVolumeM3: 1, validationIssues: [] },
  supports: [{ id: 'PALLET-01', x: 0, y: 0, z: 0, length: 1, width: 1, height: .1, weightKg: 1 }],
};
const hostFor = (target = fixture): InertiaCanvasHost => ({ element: document.createElement('div'), ...target });
const dataFor = (target = fixture) => ({ runId: nextInertiaCanvasRunId(), target, securing: buildSecuringUsage(target, 0) });
let cleanups: Array<() => void> = [];
const register = (host: InertiaCanvasHost) => { const cleanup = registerInertiaCanvasHost(host); cleanups.push(cleanup); return cleanup; };
afterEach(() => { cleanups.forEach(cleanup => cleanup()); cleanups = []; clearInertiaCanvasPlayback(); clearPhysicsTarget(); });

describe('primary inertia canvas ownership', () => {
  it('accepts full ordered placement clones and requires finite equal container geometry', () => {
    const host = hostFor();
    expect(inertiaHostMatchesTarget(host, fixture)).toBe(true);
    expect(inertiaHostMatchesTarget({ ...host, result: { ...fixture.result, placements: fixture.result.placements.map(p => ({ ...p })) } }, fixture)).toBe(true);
    expect(inertiaHostMatchesTarget({ ...host, container: { ...host.container, width: 4 } }, fixture)).toBe(false);
    expect(inertiaHostMatchesTarget({ ...host, container: { ...host.container, length: Infinity } }, { ...fixture, container: { ...fixture.container, length: Infinity } })).toBe(false);
  });
  it('rejects changed placement identity, rotation, pose, mass and order', () => {
    const host = hostFor(); const placement = host.result.placements[0];
    for (const field of ['x', 'y', 'z', 'length', 'width', 'height', 'weightKg'] as const) {
      expect(inertiaHostMatchesTarget({ ...host, result: { ...host.result, placements: [{ ...placement, [field]: placement[field] + 1 }] } }, fixture)).toBe(false);
    }
    for (const changed of [{ ...placement, cargoId: 'OTHER' }, { ...placement, rotated: true }, { ...placement, x: NaN }]) {
      expect(inertiaHostMatchesTarget({ ...host, result: { ...host.result, placements: [changed] } }, fixture)).toBe(false);
    }
    const placements = [placement, { ...placement, x: 1 }];
    expect(inertiaHostMatchesTarget({ ...host, result: { ...host.result, placements } }, { ...fixture, result: { ...fixture.result, placements: [...placements].reverse() } })).toBe(false);
  });
  it('accepts equivalent pallet support IDs but rejects changed support geometry/order/mass', () => {
    const host = { ...hostFor(), supports: fixture.supports!.map(s => ({ ...s, id: 'PALLET-1' })) };
    expect(inertiaHostMatchesTarget(host, fixture)).toBe(true);
    for (const field of ['x', 'y', 'z', 'length', 'width', 'height', 'weightKg'] as const) {
      expect(inertiaHostMatchesTarget({ ...host, supports: [{ ...host.supports[0], [field]: host.supports[0][field] + 1 }] }, fixture)).toBe(false);
    }
    expect(inertiaHostMatchesTarget({ ...host, supports: [] }, fixture)).toBe(false);
    expect(inertiaHostMatchesTarget({ ...host, supports: [{ ...host.supports[0], weightKg: NaN }] }, fixture)).toBe(false);
  });
  it('rejects stale authority and unrelated canvases before publishing', () => {
    const data = dataFor(); register(hostFor());
    expect(publishInertiaCanvasPlayback(data)).toBe(false);
    publishPhysicsTarget(fixture); expect(publishInertiaCanvasPlayback(data)).toBe(true);
    const unrelated = { ...fixture, result: { ...fixture.result, placements: fixture.result.placements.map(p => ({ ...p, weightKg: p.weightKg + 1 })) } };
    register(hostFor(unrelated)); expect(readInertiaCanvasPlayback()).toBeNull();
    expect(publishInertiaCanvasPlayback({ ...dataFor(), target: fixture })).toBe(false);
  });
  it('retires closed sessions so delayed frames cannot reactivate the canvas', () => {
    register(hostFor()); publishPhysicsTarget(fixture); const old = dataFor();
    expect(publishInertiaCanvasPlayback(old)).toBe(true); clearInertiaCanvasPlayback();
    expect(publishInertiaCanvasPlayback(old)).toBe(false);
    const next = dataFor(); expect(publishInertiaCanvasPlayback(next)).toBe(true);
    expect(publishInertiaCanvasPlayback(old)).toBe(false); expect(readInertiaCanvasPlayback()).toBe(next);
    clearPhysicsTarget(); expect(publishInertiaCanvasPlayback({ ...next, runId: nextInertiaCanvasRunId() })).toBe(false);
  });
  it('keeps a replacement host registered when an older host unmounts', () => {
    const removeOld = register(hostFor()); const replacement = hostFor(); register(replacement);
    publishPhysicsTarget(fixture); const data = dataFor(); expect(publishInertiaCanvasPlayback(data)).toBe(true);
    removeOld(); expect(readInertiaCanvasHost()).toBe(replacement); expect(readInertiaCanvasPlayback()).toBe(data);
    cleanups.at(-1)!(); expect(readInertiaCanvasHost()).toBeNull(); expect(readInertiaCanvasPlayback()).toBeNull();
    expect(publishInertiaCanvasPlayback(data)).toBe(false);
  });
});
