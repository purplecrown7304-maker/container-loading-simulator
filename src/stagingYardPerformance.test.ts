/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Mesh, ShaderMaterial, Texture } from 'three';
import { buildStagingInventory } from './stagingInventory';
import { buildStagingYardLayout } from './stagingYardLayout';
import { createStagingYardResources } from './ThreeStagingYard';
import { parseMeshyGeometry, type MeshyModel } from './threeComparisonModels';

const container = { length: 12.03, width: 2.35, height: 2.7, maxPayloadKg: 28600 };
type Sample = { inventoryMs: number; layoutMs: number; stableLayoutMs: number; zoneSliceMs: number; renderPreparationMs: number };
const summary = (samples: Sample[], key: keyof Sample) => {
  const values = samples.map(sample => sample[key]).sort((a, b) => a - b);
  return { median: Number(values[Math.floor(values.length / 2)].toFixed(3)), min: Number(values[0].toFixed(3)), max: Number(values.at(-1)!.toFixed(3)) };
};

/** Reproducible CPU preparation measurements, not FPS or a GPU benchmark.
 * One SKU, 5 measured runs after a warmup, all inventory retained, four zones
 * (1024 boxes) displayed. Original normalized carton geometry is shared; texture
 * loading, canvas labels and WebGL submission are intentionally outside timing.
 * No timing threshold can weaken loading/validation or make this test flaky.
 */
describe('large staging yard CPU preparation measurements', () => {
  it.each([5000, 10000])('preserves %i loose boxes while paging rendering to four zones', quantity => {
    const parsed = parseMeshyGeometry(readFileSync(resolve(process.cwd(), 'src/assets/Meshy/carton/model.obj'), 'utf8'));
    const texture = new Texture(), material = new ShaderMaterial();
    const model: MeshyModel = { key: 'carton', bounds: parsed.bounds, triangleCount: parsed.geometries.reduce((sum, geometry) => sum + (geometry.index?.count ?? geometry.getAttribute('position').count) / 3, 0),
      parts: parsed.geometries.map(geometry => ({ geometry, texture, material })) };
    const input = { scopeKey: 'performance-fixture', mode: 'boxes' as const, container,
      cargo: [{ id: 'BOX-A', name: 'Measured loose carton', length: .6, width: .4, height: .3, weightKg: 2.5, quantity, allowRotation: false }] };
    const samples: Sample[] = [];
    let zoneCount = 0, displayed = 0, instanceCount = 0, displayCartonTriangles = 0, displayGeometryReferences = 0, displayMaterialReferences = 0;
    try {
      for (let iteration = -1; iteration < 5; iteration++) {
        const beforeInventory = performance.now(), inventory = buildStagingInventory(input), afterInventory = performance.now();
        const layout = buildStagingYardLayout(inventory.yardUnits, { container, vehicleRig: 'articulated' }), afterLayout = performance.now();
        const stable = buildStagingYardLayout(inventory.yardUnits, { container, vehicleRig: 'articulated', previous: layout }), afterStable = performance.now();
        const page = Math.floor(layout.zones.length / 8), ids = layout.zones.slice(page * 4, page * 4 + 4).map(zone => zone.id), idSet = new Set(ids);
        const beforeSlicing = performance.now();
        for (let repeat = 0; repeat < 100; repeat++) {
          const slots = layout.slots.filter(slot => idSet.has(slot.zoneId));
          const units = new Set(slots.map(slot => slot.unitId));
          displayed = inventory.yardUnits.filter(unit => units.has(unit.id)).length;
        }
        const afterSlicing = performance.now();
        const resources = createStagingYardResources(inventory.yardUnits, layout, { carton: model }, { visibleZoneIds: ids, labelsEnabled: false });
        const afterResources = performance.now();
        zoneCount = layout.zones.length; instanceCount = resources.instanceCount;
        const carton = resources.root.getObjectByName('Yard carton') as Mesh;
        displayCartonTriangles = (carton.geometry.index?.count ?? carton.geometry.getAttribute('position').count) / 3;
        const geometries = new Set(), materials = new Set();
        resources.root.traverse(object => { if ('geometry' in object && 'material' in object) { const drawable = object as Mesh; geometries.add(drawable.geometry); (Array.isArray(drawable.material) ? drawable.material : [drawable.material]).forEach(item => materials.add(item)); } });
        displayGeometryReferences = geometries.size; displayMaterialReferences = materials.size;
        expect(inventory.summary.total.looseBoxes).toBe(quantity); expect(inventory.summary.yard.boxes).toBe(quantity);
        expect(layout.slots).toHaveLength(quantity); expect(stable.slots).toHaveLength(quantity);
        expect(displayed).toBe(1024); expect(resources.renderedUnitIds).toHaveLength(1024); expect(instanceCount).toBe(1024);
        expect(zoneCount).toBe(Math.ceil(quantity / 256));
        expect(new Set(stable.slots.map(slot => slot.unitId)).size).toBe(quantity);
        resources.dispose();
        if (iteration >= 0) samples.push({ inventoryMs: afterInventory - beforeInventory, layoutMs: afterLayout - afterInventory,
          stableLayoutMs: afterStable - afterLayout, zoneSliceMs: (afterSlicing - beforeSlicing) / 100, renderPreparationMs: afterResources - afterSlicing });
      }
      console.info('STAGING_CPU_MEASURE', JSON.stringify({ quantity, skuCount: 1, runs: samples.length, zoneCount, displayedUnits: displayed, visualInstances: instanceCount,
        originalCartonTriangles: model.triangleCount, displayCartonTriangles, visibleCartonTriangles: displayCartonTriangles * instanceCount,
        displayGeometryReferences, displayMaterialReferences, measurementsMs: Object.fromEntries((['inventoryMs', 'layoutMs', 'stableLayoutMs', 'zoneSliceMs', 'renderPreparationMs'] as const).map(key => [key, summary(samples, key)])) }));
    } finally { parsed.geometries.forEach(geometry => geometry.dispose()); texture.dispose(); material.dispose(); }
  });
});
