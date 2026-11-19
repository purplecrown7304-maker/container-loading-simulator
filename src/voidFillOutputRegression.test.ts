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

  it('keeps a void without a material in every output and only leaves its 3D drawing out', () => {
    // Owner decision 2026-11-19. A gap of more than a metre beside the cargo is outside every
    // material range: it used to be drawn as a red wire box.
    const narrow: CargoItem[] = [{ ...cargo[0], id: 'VOID-B', name: 'VOID-B', width: 1.2 }];
    const result = loadContainer(container, narrow, { strategy: 'capacity', publish: false });
    const fills = result.voidFillPlan!.fills;
    const open = fills.filter(fill => fill.material === 'unresolved');
    const planned = fills.filter(fill => fill.material !== 'unresolved');
    expect(open.length).toBeGreaterThan(0); expect(planned.length).toBeGreaterThan(0);
    expect(open.every(fill => !fill.fixedSupportEligible)).toBe(true);
    expect(result.voidFillPlan!.unresolvedCount).toBe(open.length);
    expect(result.operationalFindings).toContainEqual(expect.objectContaining({
      code: 'VOID_FILL_REQUIRED', message: expect.stringContaining(`적용범위 밖 ${open.length}곳`),
    }));

    const scene = viewerPlan(container, result, 1, narrow);
    const at = (fill: typeof fills[number]) => expect.objectContaining({
      x: fill.x, y: fill.y, z: fill.z, length: fill.length, width: fill.width, height: fill.height,
    });
    for (const fill of planned) expect(scene.decorations).toContainEqual(at(fill));
    for (const fill of open) expect(scene.decorations).not.toContainEqual(at(fill));
    expect(scene.decorations).toHaveLength(planned.length);
    expect(scene.decorations.some(item => item.wire || item.color === '#dc2626')).toBe(false);

    const rows = voidFillRows(result);
    expect(rows.filter(row => row.fixedSupportEligible === 'N').map(row => row.id)).toEqual(open.map(fill => fill.id));
    expect(rows.filter(row => row.material === '적용 자재 미확정')).toHaveLength(open.length);
    expect(buildLoadingReportHtml(container, narrow, result)).toContain('적용 자재 미확정');
  });

  it('draws no marker over the lower door-end columns of the shipment reported on 2026-11-19', () => {
    // 3,375 cartons of one size in a 40 ft high cube. The columns at the floor-load limit end
    // one carton lower at the door end; nothing can be loaded or wedged above them, and the
    // owner asked for the red wire boxes drawn there to go.
    const space = { length: 12.032, width: 2.35, height: 2.7, ceilingClearanceM: .05, maxPayloadKg: 28600,
      floorLoadLimitKgPerM2: 1500, floorLoadWarningMultiplier: 3, unloadingPolicy: 'strict' } as ContainerSpec;
    const carton = (id: string, quantity: number, weightKg: number): CargoItem =>
      ({ id, name: id, quantity, length: .235, width: .13, height: .265, weightKg, maxTopLoadKg: 34.3, strengthUnverified: false, allowRotation: true } as CargoItem);
    const shipment = [carton('HEAVY', 934, 22), carton('HEAVY-PART', 1, 12.8), carton('LIGHT', 2439, 1.42), carton('LIGHT-PART', 1, .62)];
    const result = loadContainer(space, shipment, { strategy: 'stability', publish: false });
    expect(result.placements).toHaveLength(3375);
    const fills = result.voidFillPlan!.fills;
    const open = fills.filter(fill => fill.material === 'unresolved');
    // The space above the lower columns: at the door end, one carton high, no material applies.
    // (A step when the row reaches a side wall, a top void when the load is centred off it.)
    const above = open.filter(fill => fill.kind === 'height-step' || fill.kind === 'top-void');
    expect(above.length).toBeGreaterThan(0);
    for (const fill of above) { expect(fill.x).toBeGreaterThan(10); expect(fill.height).toBeCloseTo(.265, 6); }
    expect(result.voidFillPlan!.unresolvedCount).toBe(open.length);

    const drawn = viewerPlan(space, result, 1, shipment).decorations;
    expect(drawn).toHaveLength(fills.length - open.length);
    expect(drawn.some(item => item.wire || item.color === '#dc2626')).toBe(false);
    // The planned materials are still there: an air bag beside the last row, load bars at the door faces.
    expect(drawn.filter(item => item.modelKey === 'dunnage-airbag').length).toBe(fills.filter(fill => fill.material === 'dunnage-airbag').length);
    expect(drawn.filter(item => item.color === '#e87924').length).toBe(fills.filter(fill => fill.material === 'load-bar').length);
    expect(fills.filter(fill => fill.material === 'load-bar').length).toBeGreaterThan(0);
    // And the result still says how many places are outside the plan.
    expect(result.operationalFindings).toContainEqual(expect.objectContaining({
      code: 'VOID_FILL_REQUIRED', message: expect.stringContaining(`적용범위 밖 ${open.length}곳`),
    }));
  }, 60_000);
});
