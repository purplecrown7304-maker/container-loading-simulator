import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ThreeComparisonSceneProps } from './ThreeComparisonScene';
import type { InertiaAnimationFrame } from './engine/inertiaSimulation';
import ThreeLoadingViewer from './ThreeLoadingViewer';
import UnityLoadingViewer from './UnityLoadingViewer';
import type { Window as HappyWindow } from 'happy-dom';

const captured = vi.hoisted(() => ({ scene: undefined as ThreeComparisonSceneProps | undefined }));
vi.mock('./ThreeComparisonScene', () => ({ default: (props: ThreeComparisonSceneProps) => { captured.scene = props; return <div/>; } }));
const container = { length: 6, width: 2, height: 3, maxPayloadKg: 1000 };
const box = { cargoId: 'A', x: 1, y: .5, z: .2, length: 1, width: 1, height: 1, weightKg: 10 };
const result = { placements: [box, { ...box, x: 2 }], remaining: [], validationIssues: [], usedVolumeM3: 2, loadedWeightKg: 20 };
const frameData: InertiaAnimationFrame = { phase: 'force', step: 60, cargo: new Float32Array([1, 1, 1, 0, 0, 0, 1, 2, 2, 2, 0, 0, 0, 1]), supports: new Float32Array() };
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  (window as unknown as HappyWindow).happyDOM.settings.navigation.disableChildFrameNavigation = true;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  (window as unknown as HappyWindow).happyDOM.settings.navigation.disableChildFrameNavigation = false;
});
const renderThree = (frame?: InertiaAnimationFrame, weightView?: boolean) => act(async () => root.render(<ThreeLoadingViewer container={container} result={result} frameData={frame} weightView={weightView}/>));
const renderUnity = (frame?: InertiaAnimationFrame, value = result, weightView?: boolean) => act(async () => root.render(<UnityLoadingViewer container={container} result={value} frameData={frame} weightView={weightView}/>));

it('temporarily overrides Three weight mode and saved sequence position without replacing its plan', async () => {
  await renderThree();
  await act(async () => captured.scene!.onReady!({ revision: captured.scene!.plan.revision, modelCount: 2, labelFaces: 8, visibleLabelFaces: 8, visibleCargo: 2, renderCalls: 1, triangles: 1, geometries: 1, textures: 1, acceptedFrameStep: null, rejectedFrame: false, cgVisible: true, cgPosition: [0, 1, 0] }));
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

it('waits for Unity readiness, forces ordinary full cargo, and restores baseline poses once without resending the plan', async () => {
  await renderUnity(frameData, result, true);
  const iframe = host.querySelector('iframe')!, child = iframe.contentWindow!;
  const posted = vi.spyOn(child, 'postMessage');
  const receive = (payload: object) => act(async () => window.dispatchEvent(new MessageEvent('message', { origin: window.location.origin, source: child, data: { source: 'cargo-unity-host', payload } })));
  const messages = (type: string) => posted.mock.calls.map(call => call[0] as { type: string; payload: any }).filter(message => message.type === type);
  expect(messages('frame')).toHaveLength(0);
  await receive({ type: 'ready' });
  const plan = messages('plan').at(-1)!.payload;
  expect(messages('frame')).toHaveLength(0);
  await receive({ type: 'planApplied', revision: plan.revision });
  expect(messages('frame').at(-1)!.payload.cargo).toEqual(Array.from(frameData.cargo));
  expect(messages('command').map(message => message.payload)).toEqual(expect.arrayContaining([{ action: 'weight', value: 0 }, { action: 'cut', value: 100 }, { action: 'step', value: 2 }, { action: 'play', value: 0 }]));
  posted.mockClear();
  await renderUnity(undefined, result, true);
  expect(host.querySelector('iframe')).toBe(iframe);
  expect(messages('plan')).toHaveLength(0);
  expect(messages('frame')).toHaveLength(1);
  expect(messages('frame')[0].payload).toEqual({ revision: plan.revision, cargo: [-1.5, .7, 0, 0, 0, 0, 1, -.5, .7, 0, 0, 0, 0, 1], supports: [] });
  expect(messages('command').map(message => message.payload)).toContainEqual({ action: 'weight', value: 1 });
  await renderUnity(undefined, result, true);
  expect(messages('frame')).toHaveLength(1);
  posted.mockClear();
  await renderUnity(frameData);
  await renderUnity(undefined, { ...result, placements: [{ ...box, x: 3 }] });
  const nextPlan = messages('plan').at(-1)!.payload;
  posted.mockClear();
  await receive({ type: 'planApplied', revision: nextPlan.revision });
  expect(messages('frame')).toHaveLength(0);
});
