import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ThreeComparisonSceneProps } from './ThreeComparisonScene';
import type { InertiaAnimationFrame } from './engine/inertiaSimulation';
import ThreeLoadingViewer from './ThreeLoadingViewer';
import ViewerBackgroundSelector from './ViewerBackgroundSelector';
import { readTransportEquipment, selectTransportEquipment, TRUCK_EQUIPMENT } from './transportEquipment';

const captured = vi.hoisted(() => ({ scene: undefined as ThreeComparisonSceneProps | undefined }));
vi.mock('./ThreeComparisonScene', () => ({ default: (props: ThreeComparisonSceneProps) => { captured.scene = props; return <div/>; } }));
const container = { length: 6, width: 2, height: 3, maxPayloadKg: 1000 };
const box = { cargoId: 'A', x: 1, y: .5, z: .2, length: 1, width: 1, height: 1, weightKg: 10 };
const result = { placements: [box, { ...box, x: 2 }], remaining: [], validationIssues: [], usedVolumeM3: 2, loadedWeightKg: 20 };
const frameData: InertiaAnimationFrame = { phase: 'force', step: 60, cargo: new Float32Array([1, 1, 1, 0, 0, 0, 1, 2, 2, 2, 0, 0, 0, 1]), supports: new Float32Array() };
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
const renderThree = (frame?: InertiaAnimationFrame, weightView?: boolean) => act(async () => root.render(<><header><ViewerBackgroundSelector /></header><ThreeLoadingViewer container={container} result={result} frameData={frame} weightView={weightView}/></>));

it('changes only the background while preserving the plan and active inertia frame', async () => {
  await renderThree(frameData);
  const plan = captured.scene!.plan;
  const input = host.querySelector<HTMLSelectElement>('header select[aria-label="3D 배경"]')!;
  expect(host.querySelectorAll('select[aria-label="3D 배경"]')).toHaveLength(1);
  expect(host.querySelector('.three-comparison-metrics')).toBeNull();
  expect(host.textContent).not.toContain('회전 측정');
  for (const value of ['forest', 'beach', 'space', 'warehouse']) {
    await act(async () => { input.value = value; input.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(captured.scene!.environment).toBe(value);
    expect(captured.scene!.plan).toBe(plan);
    expect(captured.scene!.frameData).toBe(frameData);
    expect(captured.scene!.step).toBe(2);
    expect(captured.scene!.showCg).toBe(true);
  }
});

it('temporarily overrides Three weight mode and saved sequence position without replacing its plan', async () => {
  await renderThree();
  await act(async () => captured.scene!.onReady!({ revision: captured.scene!.plan.revision, modelCount: 2, labelFaces: 8, visibleLabelFaces: 8, visibleCargo: 2, renderCalls: 1, triangles: 1, geometries: 1, textures: 1, acceptedFrameStep: null, rejectedFrame: false, cgVisible: true, cgPosition: [0, 1, 0], cameraPose: '1,2,3,0,0,0,1' }));
  const originalPlan = captured.scene!.plan;
  const sequenceButton = Array.from(host.querySelectorAll('button')).find(button => button.textContent === '적재 순서 재생')!;
  await act(async () => sequenceButton.click());
  expect(captured.scene!.step).toBe(0);
  await renderThree(frameData, true);
  expect(captured.scene).toMatchObject({ cut: 100, step: 2, weight: false, frameData });
  expect(captured.scene!.plan).toBe(originalPlan);
  await renderThree(undefined, true);
  expect(captured.scene).toMatchObject({ step: 0, weight: true });
  await renderThree();
  expect(Array.from(host.querySelectorAll('button')).some(button => button.textContent === '적재 순서 재생')).toBe(true);
});

it('shows the selected equipment rig and backgrounds in main workspace preview, without adding a vehicle to isolated pallets', async () => {
  const equipment = readTransportEquipment();
  await act(async () => root.render(<ThreeLoadingViewer container={equipment} result={result} geometry={equipment.geometry} vehicle={false} preview />));
  expect(captured.scene!.plan.vehicleRig).toBe('articulated');
  expect(host.querySelector('select[aria-label="3D 배경"]')).toBeNull();
  await act(async () => root.render(<ThreeLoadingViewer container={{ length: 1.2, width: 1, height: 1.6, maxPayloadKg: 1000 }} result={result} geometry="platform" preview />));
  expect(captured.scene!.plan.vehicleRig).toBe('none');
});

it('switches short custom trucks to the cab and rigid underbody without changing cargo inputs', async () => {
  const original = readTransportEquipment();
  const equipment = { ...original, id: 'custom-truck', category: 'truck' as const, geometry: 'custom' as const, length: 4, width: 1.8, height: 2.2 };
  try {
    act(() => selectTransportEquipment(equipment));
    await act(async () => root.render(<ThreeLoadingViewer container={equipment} result={result} geometry="custom" vehicle preview />));
    expect(captured.scene!.plan.vehicleRig).toBe('rigid');
    expect(captured.scene!.plan.placements.map(({ cargoId, x, y, z }) => ({ cargoId, x, y, z }))).toEqual(result.placements.map(({ cargoId, x, y, z }) => ({ cargoId, x, y, z })));
  } finally { act(() => selectTransportEquipment(original)); }
});

it('replaces the container tractor with the selected road truck in the live viewer plan', async () => {
  const original = readTransportEquipment();
  try {
    await act(async () => root.render(<ThreeLoadingViewer container={original} result={result} preview />));
    expect(captured.scene!.plan.vehicleRig).toBe('articulated');
    for (const id of ['refrigerated-truck', 'isotherm-truck', 'tautliner', 'custom-truck', 'mega-trailer']) {
      const equipment = TRUCK_EQUIPMENT.find(item => item.id === id)!;
      act(() => selectTransportEquipment(equipment));
      await act(async () => root.render(<ThreeLoadingViewer container={equipment} result={result} preview />));
      expect(captured.scene!.plan.vehicleRig, id).toBe(id === 'mega-trailer' ? 'articulated' : 'rigid');
      expect(captured.scene!.plan.equipmentId).toBe(id);
      expect(captured.scene!.plan.placements.map(({ cargoId, x, y, z }) => ({ cargoId, x, y, z }))).toEqual(result.placements.map(({ cargoId, x, y, z }) => ({ cargoId, x, y, z })));
    }
  } finally { act(() => selectTransportEquipment(original)); }
});
