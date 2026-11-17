import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebGLRenderer } from 'three';
import { createStudioEnvironmentResources } from './ThreeSceneLighting';

const state = vi.hoisted(() => ({ texture: {}, targetDispose: vi.fn(), generatorDispose: vi.fn(), roomDispose: vi.fn(), fromScene: vi.fn() }));
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');
  return { ...actual, PMREMGenerator: class { fromScene = state.fromScene; dispose = state.generatorDispose; } };
});
vi.mock('three/addons/environments/RoomEnvironment.js', () => ({ RoomEnvironment: class { dispose = state.roomDispose; } }));
beforeEach(() => { vi.clearAllMocks(); state.fromScene.mockReturnValue({ texture: state.texture, dispose: state.targetDispose }); });

describe('studio room environment ownership', () => {
  it('bakes once, frees temporary room/generator immediately and retains its PMREM until owner disposal', () => {
    const resources = createStudioEnvironmentResources({} as WebGLRenderer);
    expect(state.fromScene).toHaveBeenCalledExactlyOnceWith(expect.anything(), .04, .1, 100, { size: 256 });
    expect(state.roomDispose).toHaveBeenCalledOnce(); expect(state.generatorDispose).toHaveBeenCalledOnce(); expect(state.targetDispose).not.toHaveBeenCalled();
    expect(resources.texture).toBe(state.texture); resources.dispose(); resources.dispose(); expect(state.targetDispose).toHaveBeenCalledOnce();
  });
  it('cleans temporary GPU/room resources when baking fails without publishing an environment', () => {
    state.fromScene.mockImplementationOnce(() => { throw new Error('GPU unavailable'); });
    expect(() => createStudioEnvironmentResources({} as WebGLRenderer)).toThrow('GPU unavailable');
    expect(state.roomDispose).toHaveBeenCalledOnce(); expect(state.generatorDispose).toHaveBeenCalledOnce(); expect(state.targetDispose).not.toHaveBeenCalled();
  });
});
