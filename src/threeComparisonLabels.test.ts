import { afterEach, describe, expect, it, vi } from 'vitest';
import { Texture } from 'three';
import { unityPlan } from './unityProtocol';
import { acquireComparisonLabels } from './threeComparisonLabels';

function plan() {
  return unityPlan({ length: 2, width: 1, height: 1, maxPayloadKg: 1000 }, {
    placements: [
      { cargoId: 'A', x: 0, y: 0, z: 0, length: .5, width: .4, height: .3, weightKg: 12.5 },
      { cargoId: 'B', x: .5, y: 0, z: 0, length: .5, width: .4, height: .3, weightKg: 10 },
    ], remaining: [], validationIssues: [], loadedWeightKg: 22.5, usedVolumeM3: .12,
  }, 1, [{ id: 'A', name: '화물', productName: '정밀 부품', boxId: 'BOX-42', unitsPerPackage: 24 }]);
}
function context() {
  return { fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn(), measureText: (text: string) => ({ width: text.length * 10 }) };
}
afterEach(() => { vi.restoreAllMocks(); });

describe('comparison printed labels', () => {
  it('matches the Unity host raster content and shares textures until the last viewer releases them', async () => {
    const ctx = context(); vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
    const first = await acquireComparisonLabels(plan()), second = await acquireComparisonLabels(plan());
    expect(ctx.fillText.mock.calls).toContainEqual(['BOX-42', 30, 52, 454]);
    expect(ctx.fillText.mock.calls).toContainEqual(['정밀 부품', 30, 103, 454]);
    expect(ctx.fillText.mock.calls).toContainEqual(['24 EA · 12.5 kg', 30, 165, 454]);
    expect(ctx.fillText.mock.calls).toContainEqual(['500 × 400 × 300 mm', 30, 213, 454]);
    expect(first.materials.get('A')).toBe(second.materials.get('A'));
    expect((first.materials.get('A')!.map!.image as HTMLCanvasElement).width).toBe(512);
    expect((first.materials.get('A')!.map!.image as HTMLCanvasElement).height).toBe(256);
    let disposed = false;
    first.materials.get('A')!.map!.addEventListener('dispose', () => { disposed = true; });
    first.release(); expect(disposed).toBe(false); second.release(); expect(disposed).toBe(true);
  });

  it('releases textures already acquired if a later label canvas fails', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValueOnce(context() as never).mockReturnValueOnce(null);
    const dispose = vi.spyOn(Texture.prototype, 'dispose');
    await expect(acquireComparisonLabels(plan())).rejects.toThrow('Carton label canvas is unavailable');
    expect(dispose).toHaveBeenCalledOnce();
  });
});
