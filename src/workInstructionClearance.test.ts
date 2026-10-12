import { expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { buildWorkInstructionAddresses } from './workInstructionGrid';
import { selectedCargoClearance } from './cargoClearance';
import { sceneCameraPose, sceneCenter } from './threeComparisonSceneState';
import { viewerPlan } from './viewerSceneProtocol';

it('uses the same door-facing left/right convention in work orders, clearance labels and the actual Three camera', () => {
  const container = { length: 6, width: 2.4, height: 2.6, maxPayloadKg: 1000 };
  const base = { cargoId: 'A', x: 1, y: .2, z: 0, length: 1, width: .5, height: .7, weightKg: 10 };
  const placements = [base, { ...base, y: 1.7 }, { ...base, x: 2 }, { ...base, y: 1.7, z: .7 }];
  const addresses = buildWorkInstructionAddresses(placements);
  const plan = viewerPlan(container, { placements, remaining: [], validationIssues: [], usedVolumeM3: 1.4, loadedWeightKg: 40 }, 1, [], {});
  const pose = sceneCameraPose(plan, 'door', 1.5), camera = new PerspectiveCamera(40, 1.5, .02, 500);
  camera.position.copy(pose.position); camera.lookAt(pose.target); camera.updateMatrixWorld(true);
  const leftScreen = new Vector3(...sceneCenter(placements[1], container)).project(camera);
  const rightScreen = new Vector3(...sceneCenter(placements[0], container)).project(camera);
  expect(leftScreen.x).toBeLessThan(rightScreen.x);
  expect(addresses[1]).toEqual({ column: 1, row: 1, layer: 1 });
  expect(addresses[0]).toEqual({ column: 2, row: 1, layer: 1 });
  expect(addresses[2].row).toBe(2);
  expect(addresses[3]).toEqual({ column: 1, row: 1, layer: 2 });
  for (const index of [0, 1]) {
    const values = Object.fromEntries(selectedCargoClearance(plan, { kind: 'cargo', index })!.measurements.map(m => [m.face, m.distanceM]));
    expect(values.left).toBeCloseTo(container.width - placements[index].y - placements[index].width);
    expect(values.right).toBeCloseTo(placements[index].y);
    expect(values.inner).toBe(placements[index].x);
    expect(values.rear).toBe(container.length - placements[index].x - placements[index].length);
  }
});
