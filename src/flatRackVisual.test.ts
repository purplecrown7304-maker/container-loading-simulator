import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { flatRackParts } from './flatRackVisual';
import { CONTAINER_EQUIPMENT } from './transportEquipment';
import { createComparisonSceneResources } from './threeComparisonSceneResources';
import { viewerPlan } from './viewerSceneProtocol';

describe('flatrack display matches the selected equipment', () => {
  for (const rack of CONTAINER_EQUIPMENT.filter(item => item.geometry === 'flat-rack')) {
    it(`${rack.id}: two end walls, open sides/top, no structure inside cargo bounds`, () => {
      const parts = flatRackParts(rack.length, rack.width, rack.height, rack.id.endsWith('-collapsible'));
      const cargo = new THREE.Box3(new THREE.Vector3(-rack.length / 2 + .0001, .0001, -rack.width / 2 + .0001), new THREE.Vector3(rack.length / 2 - .0001, rack.height, rack.width / 2 - .0001));
      for (const part of parts) {
        const bounds = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(...part.position), new THREE.Vector3(...part.size));
        expect(bounds.intersectsBox(cargo), part.name).toBe(false);
      }
      const plan = { ...viewerPlan(rack, { placements: [], remaining: [], validationIssues: [], usedVolumeM3: 0, loadedWeightKg: 0 }, 1, [], { geometry: 'flat-rack' }), equipmentId: rack.id };
      const before = JSON.stringify(plan);
      const scene = createComparisonSceneResources(plan, {}, new Map());
      const equipment = scene.root.getObjectByName('Equipment')!;
      const walls = equipment.children.filter(child => child.name === 'Flatrack end wall');
      expect(walls).toHaveLength(2);
      expect(walls[0].position.x).toBeLessThan(-rack.length / 2);
      expect(walls[1].position.x).toBeGreaterThan(rack.length / 2);
      expect(equipment.getObjectByName('Edge')).toBeUndefined();
      expect(equipment.getObjectByName('Door threshold')).toBeUndefined();
      expect(equipment.getObjectByName('Far wall')).toBeUndefined();
      expect(equipment.children.filter(child => child.name === 'Flatrack hinge')).toHaveLength(rack.id.endsWith('-collapsible') ? 4 : 0);
      scene.updateVisibility({ cut: 100, step: 0, shell: false, labels: false, weight: false, showCg: false, selected: null });
      expect(equipment.visible).toBe(false);
      expect(JSON.stringify(plan)).toBe(before);
      scene.dispose();
    });
  }
});
