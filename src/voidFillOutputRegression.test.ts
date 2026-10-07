import { afterEach, describe, expect, it } from 'vitest';
import { loadContainer, restoreLoadingResult } from './engine/loadingEngine';
import { clearManualOverride, writeManualOverride } from './engine/manualOverride';
import type { CargoItem, ContainerSpec } from './engine/types';
import { buildLoadingReportHtml } from './report';
import { viewerPlan } from './viewerSceneProtocol';
import { VOID_FILL_DISCLAIMER, voidFillRows } from './voidFillPresentation';

const container: ContainerSpec = { length: 4, width: 2.35, height: 2, maxPayloadKg: 2000, floorLoadLimitKgPerM2: 1500 };
const cargo: CargoItem[] = [{
  id: 'VOID-A', name: 'VOID-A', length: .6, width: 2.35, height: .8,
  weightKg: 120, quantity: 1, maxStackLayers: 1, maxTopLoadKg: 0, allowRotation: false,
}];

afterEach(() => clearManualOverride());

describe('void-fill output wiring', () => {
  it('keeps one structured plan across result, 3D, HTML and restore', () => {
    const result = loadContainer(container, cargo, { strategy: 'capacity', publish: false });
    expect(result.operationalFindings).toContainEqual(expect.objectContaining({ code: 'VOID_FILL_REQUIRED' }));
    expect(result.voidFillPlan?.fills.length).toBeGreaterThan(0);

    const door = result.voidFillPlan!.fills.find(fill => fill.kind === 'door-face');
    expect(door).toBeDefined();
    expect(door?.material).toBe('load-bar');
    expect(door?.quantity).toBeGreaterThan(0);
    expect(door?.weightKg).toBeGreaterThan(0);

    const rows = voidFillRows(result);
    expect(rows.find(row => row.id === door!.id)).toMatchObject({
      gapType: '문쪽 끝단',
      material: '카고 로드바',
      quantity: door!.quantity,
      weightKg: Number(door!.weightKg.toFixed(3)),
    });

    const scene = viewerPlan(container, result, 1, cargo);
    expect(scene.decorations).toContainEqual(expect.objectContaining({
      x: door!.x, y: door!.y, z: door!.z,
      length: door!.length, width: door!.width, height: door!.height,
    }));

    const html = buildLoadingReportHtml(container, cargo, result);
    expect(html).toContain('메움재 상세');
    expect(html).toContain('카고 로드바');
    expect(html).toContain(VOID_FILL_DISCLAIMER);

    writeManualOverride(container, cargo, result);
    const restored = restoreLoadingResult(container, cargo);
    expect(restored.voidFillPlan).toEqual(result.voidFillPlan);
    expect(restored.securingBudget?.requiredWeightKg).toBe(result.securingBudget?.requiredWeightKg);
  });
});
