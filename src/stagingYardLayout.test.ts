import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildStagingYardLayout, stagingYardFrame, stagingYardWorldPoint, type StagingLayoutUnit } from './stagingYardLayout';
import { vehicleLayout, type VehicleRigKind } from './threeVehicleLayout';
import { createStagingPreviewResources, createStagingYardResources, stagingUnitParts } from './ThreeStagingYard';
import type { StagingUnit } from './stagingInventory';
import type { MeshyModel, ModelKey } from './threeComparisonModels';

const container = { length: 12.03, width: 2.35, height: 2.7 };
const options = { container, vehicleRig: 'articulated' as const };
const box = (id: string, patch: Partial<StagingLayoutUnit> = {}): StagingLayoutUnit => ({ id, kind: 'box', cargoId: 'SKU-A', length: .6, width: .4, height: .3, ...patch });
const unit = (id: string, patch: Partial<StagingUnit> = {}): StagingUnit => ({ ...box(id), name: id, cargoIds: ['SKU-A'], weightKg: 4, boxCount: 1, unloadPriorities: [], location: 'yard', verdict: 'pending', reasons: [], boxUnits: [{ id: `${id}:box`, stableId: `${id}:box`, cargoId: 'SKU-A' }], ...patch });
const fixtureModels = () => {
  const geometry = new THREE.BoxGeometry(1, 1, 1), texture = new THREE.Texture(), material = new THREE.ShaderMaterial();
  const model = (key: ModelKey): MeshyModel => ({ key, parts: [{ geometry, texture, material }], bounds: new THREE.Box3(new THREE.Vector3(-.5, -.5, -.5), new THREE.Vector3(.5, .5, .5)), triangleCount: 12 });
  return { models: { carton: model('carton'), 'wood-pallet': model('wood-pallet'), 'plastic-pallet': model('plastic-pallet'), 'corner-guard': model('corner-guard') }, geometry, texture, material };
};
const palletUnit = (patch: Partial<StagingUnit> = {}): StagingUnit => {
  const placements = [0, .6].map((x, index) => ({ unitId: `inner-${index}`, cargoId: 'SKU-A', x, y: 0, z: .15, length: .6, width: .8, height: .5, weightKg: 4, rotated: false }));
  return unit('pallet-1', { kind: 'pallet', length: 1.2, width: .8, height: .65, boxCount: 2, weightKg: 28,
    pallet: { palletIndex: 1, x: 7, y: 1, z: 0, stackColumn: 1, stackLevel: 1, length: 1.2, width: .8, height: .15, cargoPlacements: placements.map(p => ({ ...p, x: p.x + 7, y: p.y + 1 })), cargoWeightKg: 8, packagingWeightKg: 0, packagingExtraHeightM: 0, cornerGuardsUsed: false, wrappingUsed: false, totalWeightKg: 28, centerOfGravity: { x: 7.6, y: 1.4, z: .3 } },
    localPlacements: placements, packaging: { wrapping: false, cornerGuards: false, bandingStraps: 0 }, ...patch });
};

describe('vehicle rear staging display layout', () => {
  it('keeps a base ground and empty aisle when there is no cargo', () => {
    const layout = buildStagingYardLayout([], options);
    expect(layout.slots).toEqual([]); expect(layout.zones).toEqual([]);
    expect(layout.ground.end).toBeGreaterThan(layout.settings.doorClearance);
    expect(layout.aisle.minLateral).toBe(-layout.settings.aisleWidth / 2);
    expect(layout.bounds.min[1]).toBe(vehicleLayout('articulated', container).groundY);
  });
  it('places all 20 real-size boxes on ground, outside the rear and the central aisle, without overlap', () => {
    const units = Array.from({ length: 20 }, (_, i) => box(`box-${i}`));
    const layout = buildStagingYardLayout(units, options);
    expect(layout.slots).toHaveLength(20); expect(new Set(layout.slots.map(slot => slot.unitId)).size).toBe(20);
    expect(layout.zones.length).toBeGreaterThan(1);
    for (const slot of layout.slots) {
      expect(slot.center[1]).toBe(layout.frame.groundY);
      expect(slot.localCenter[0] - slot.length / 2).toBeGreaterThanOrEqual(layout.settings.doorClearance);
      expect(Math.abs(slot.localCenter[1]) - slot.width / 2).toBeGreaterThan(layout.settings.aisleWidth / 2);
      expect([slot.length, slot.width, slot.height]).toEqual([.6, .4, .3]);
      for (const other of layout.slots) if (other.unitId !== slot.unitId) {
        const xOverlap = Math.min(slot.localCenter[0] + slot.length / 2, other.localCenter[0] + other.length / 2) - Math.max(slot.localCenter[0] - slot.length / 2, other.localCenter[0] - other.length / 2);
        const zOverlap = Math.min(slot.localCenter[1] + slot.width / 2, other.localCenter[1] + other.width / 2) - Math.max(slot.localCenter[1] - slot.width / 2, other.localCenter[1] - other.width / 2);
        expect(xOverlap <= 0 || zOverlap <= 0).toBe(true);
      }
    }
  });
  it.each<VehicleRigKind>(['none', 'articulated', 'rigid', 'medium-rigid', 'heavy-rigid', 'multi-axle-rigid'])('uses the measured %s ground and existing rear-door conversion', rig => {
    const frame = stagingYardFrame(container, rig);
    expect(frame.rearCenter).toEqual([container.length / 2, 0, 0]);
    expect(frame.groundY).toBe(vehicleLayout(rig, container).groundY);
    expect(stagingYardWorldPoint(frame, 2, 0)[0]).toBe(container.length / 2 + 2);
  });
  it('follows an explicit rotated vehicle frame, independent of camera orientation', () => {
    const layout = buildStagingYardLayout([box('one')], { ...options, frame: { rearCenter: [8, 0, 3], groundY: -1.2, outward: [0, 1] } });
    const slot = layout.slots[0];
    expect(slot.center).toEqual([8 - slot.localCenter[1], -1.2, 3 + slot.localCenter[0]]);
    expect(slot.rotationY).toBeCloseTo(-Math.PI / 2);
    expect(layout.bounds.min[2]).toBe(3);
  });
  it('retains existing slots on sorting, removal, additions and equipment resize', () => {
    const units = Array.from({ length: 11 }, (_, i) => box(`box-${i}`));
    const first = buildStagingYardLayout(units, options);
    const changed = [...units.slice(1).reverse(), box('new'), box('oversize', { length: 18, width: 4, height: 5 })];
    const second = buildStagingYardLayout(changed, { ...options, previous: first });
    for (const item of second.slots.filter(slot => slot.unitId.startsWith('box-'))) {
      expect(item).toEqual(first.slots.find(slot => slot.unitId === item.unitId));
    }
    const oversize = second.slots.find(slot => slot.unitId === 'oversize')!;
    expect(oversize.length).toBe(18); expect(oversize.width).toBe(4);
    expect(second.ground.end).toBeGreaterThan(first.ground.end);
    const resized = buildStagingYardLayout(changed, { ...options, container: { ...container, length: 6 }, previous: second });
    expect(resized.slots.map(slot => slot.localCenter)).toEqual(second.slots.map(slot => slot.localCenter));
    expect(resized.frame.rearCenter[0]).toBe(3);
  });
  it('separates pallets and loose boxes and explicitly reports invalid geometry', () => {
    const layout = buildStagingYardLayout([box('loose'), box('pallet', { kind: 'pallet', length: 1.2, width: 1 }), box('bad', { height: NaN })], options);
    expect(layout.zones.map(zone => zone.kind).sort()).toEqual(['box', 'pallet']);
    expect(layout.slots).toHaveLength(2); expect(layout.rejected).toEqual([{ unitId: 'bad', reason: 'Invalid cargo display dimensions' }]);
    expect(() => buildStagingYardLayout([box('x'), box('x')], options)).toThrow(/identity/);
    expect(() => buildStagingYardLayout([], { ...options, settings: { aisleWidth: 0 } })).toThrow();
  });
  it('preserves all units and unique zone labels for a large yard without mutating inputs', () => {
    const units = Array.from({ length: 1200 }, (_, i) => Object.freeze(box(`box-${i}`)));
    const before = JSON.stringify(units), layout = buildStagingYardLayout(units, options);
    expect(layout.slots).toHaveLength(1200); expect(layout.zones).toHaveLength(150);
    expect(new Set(layout.zones.map(zone => zone.id)).size).toBe(150);
    expect(layout.focusBounds.max[0]).toBeLessThan(layout.bounds.max[0]);
    expect(JSON.stringify(units)).toBe(before);
  });
});

describe('staging cargo rendering resource ownership and packaging parity', () => {
  it('moves every prepared pallet part in one transparent preview without committing inventory or mutating cache resources', () => {
    const source = palletUnit({ packaging: { wrapping: true, cornerGuards: true, bandingStraps: 4 } });
    const before = JSON.stringify(source), fixture = fixtureModels();
    const preview = createStagingPreviewResources(source, fixture.models);
    const candidate = { cargoId: source.id, x: 1, y: .2, z: .1, length: source.length, width: source.width, height: source.height, weightKg: source.weightKg };
    preview.update(candidate, container, true);
    expect(preview.root.userData).toEqual({ valid: true, unitId: source.id, displayOnly: true });
    expect(preview.root.position.x).toBeCloseTo(1 + source.length / 2 - container.length / 2);
    expect(preview.root.position.y).toBe(.1);
    const cartons = preview.root.getObjectByName('Preview carton') as THREE.InstancedMesh;
    expect(cartons.count).toBe(2); expect((cartons.material as THREE.MeshBasicMaterial).transparent).toBe(true);
    expect((cartons.material as THREE.MeshBasicMaterial).opacity).toBeLessThan(1);
    const validColor = (cartons.material as THREE.MeshBasicMaterial).color.getHexString();
    preview.update({ ...candidate, x: 2 }, container, false);
    expect((cartons.material as THREE.MeshBasicMaterial).color.getHexString()).not.toBe(validColor);
    expect(JSON.stringify(source)).toBe(before);
    const dispose = vi.spyOn(fixture.geometry, 'dispose'); preview.dispose(); expect(dispose).not.toHaveBeenCalled();
    fixture.geometry.dispose(); fixture.texture.dispose(); fixture.material.dispose();
  });
  it('renders every box as an instance with the real physical size and stable root hit mapping', () => {
    const units = Array.from({ length: 20 }, (_, i) => unit(`box-${i}`));
    const layout = buildStagingYardLayout(units, options), fixture = fixtureModels();
    const resources = createStagingYardResources(units, layout, fixture.models, { labelsEnabled: false });
    const ground = resources.root.getObjectByName('Yard ground')!;
    expect(ground.position.y + ground.scale.y / 2).toBeCloseTo(layout.frame.groundY);
    const cartons = resources.root.children.filter(item => item.name === 'Yard carton') as THREE.InstancedMesh[];
    expect(cartons).toHaveLength(1); expect(cartons[0].count).toBe(20);
    expect((cartons[0].material as THREE.MeshStandardMaterial).map).toBeNull();
    expect((cartons[0].material as THREE.MeshStandardMaterial).userData.studioCartonSurface).toBe('kraft-no-atlas');
    expect(new Set(cartons[0].userData.unitIds)).toEqual(new Set(units.map(item => item.id)));
    const slot = layout.slots[0]; resources.root.updateMatrixWorld(true);
    const hits = new THREE.Raycaster(new THREE.Vector3(slot.center[0], slot.center[1] + slot.height + 2, slot.center[2]), new THREE.Vector3(0, -1, 0)).intersectObject(resources.root, true);
    expect(hits.length).toBeGreaterThan(0); expect(hits.every(hit => hit.object === resources.root)).toBe(true);
    expect(resources.root.userData.unitIds[hits[0].instanceId!]).toBe(slot.unitId);
    const matrix = new THREE.Matrix4(); cartons[0].getMatrixAt(0, matrix);
    const scale = new THREE.Vector3().setFromMatrixScale(matrix);
    expect(scale.x).toBeCloseTo(.6); expect(scale.y).toBeCloseTo(.3); expect(scale.z).toBeCloseTo(.4);
    const cacheGeometryDispose = vi.spyOn(fixture.geometry, 'dispose'), cacheTextureDispose = vi.spyOn(fixture.texture, 'dispose');
    const instanceDispose = vi.spyOn(cartons[0], 'dispose'); resources.dispose(); resources.dispose();
    expect(instanceDispose).toHaveBeenCalledTimes(1); expect(cacheGeometryDispose).not.toHaveBeenCalled(); expect(cacheTextureDispose).not.toHaveBeenCalled();
    fixture.geometry.dispose(); fixture.texture.dispose(); fixture.material.dispose();
  });
  it('uses the prepared local carton positions and only enabled wrapping, guards and crossed banding', () => {
    const source = palletUnit(), layout = buildStagingYardLayout([source], options), slot = layout.slots[0];
    const before = JSON.stringify(source), bare = stagingUnitParts(source, slot);
    expect(bare.filter(part => part.key === 'carton')).toHaveLength(2);
    expect(bare.filter(part => part.key === 'wood-pallet')).toHaveLength(1);
    expect(bare.some(part => part.transparent || part.key === 'corner-guard' || !part.key)).toBe(false);
    const deck = bare.find(part => part.key === 'wood-pallet')!;
    expect(deck.position[1] - deck.size[1] / 2).toBeCloseTo(layout.frame.groundY);
    const carton = bare.find(part => part.key === 'carton')!;
    expect(carton.position[1] - carton.size[1] / 2).toBeCloseTo(layout.frame.groundY + .15);
    const packaged = stagingUnitParts({ ...source, packaging: { wrapping: true, cornerGuards: true, bandingStraps: 4 } }, slot);
    expect(packaged.filter(part => part.transparent)).toHaveLength(1);
    expect(packaged.filter(part => part.key === 'corner-guard')).toHaveLength(4);
    expect(packaged.filter(part => !part.key && !part.transparent)).toHaveLength(12);
    expect(packaged.every(part => part.unitId === source.id)).toBe(true);
    expect(JSON.stringify(source)).toBe(before);
  });
  it('preserves each mixed pallet SKU custom color instead of substituting its default hash color', () => {
    const source = palletUnit(), local = source.localPlacements!;
    const mixed = { ...source, cargoIds: ['SKU-A', 'SKU-B'], contents: [{ cargoId: 'SKU-A', name: 'A', boxCount: 1, displayColor: '#123456' }, { cargoId: 'SKU-B', name: 'B', boxCount: 1, displayColor: '#efac12' }], localPlacements: [local[0], { ...local[1], cargoId: 'SKU-B' }] };
    const layout = buildStagingYardLayout([mixed], options);
    expect(stagingUnitParts(mixed, layout.slots[0]).filter(part => part.key === 'carton').map(part => part.color)).toEqual(['#123456', '#efac12']);
  });
  it('keeps full layout inventory while explicitly displaying a selected zone and selecting the pallet root', () => {
    const pallet = palletUnit({ verdict: 'unloaded', reasons: [{ reason: 'Actual engine reason' }] });
    const units = [pallet, ...Array.from({ length: 10 }, (_, i) => unit(`box-${i}`))];
    const layout = buildStagingYardLayout(units, options), fixture = fixtureModels();
    const zone = layout.slots.find(slot => slot.unitId === pallet.id)!.zoneId;
    const resources = createStagingYardResources(units, layout, fixture.models, { visibleZoneIds: [zone], labelsEnabled: false });
    expect(layout.slots).toHaveLength(11); expect(resources.renderedUnitIds).toEqual([pallet.id]);
    const meshes = resources.root.children.filter(item => item instanceof THREE.InstancedMesh);
    expect(meshes.flatMap(item => item.userData.unitIds).every(id => id === pallet.id)).toBe(true);
    resources.setSelected(pallet.id);
    const selection = resources.root.getObjectByName('Selected staging root unit')!;
    expect(selection.visible).toBe(true); expect(selection.scale.y).toBeCloseTo(pallet.height + .05);
    expect(resources.root.getObjectByName('Yard unloaded cross')).toBeDefined();
    resources.setSelected(null); expect(selection.visible).toBe(false);
    resources.dispose(); fixture.geometry.dispose(); fixture.texture.dispose(); fixture.material.dispose();
  });
});
