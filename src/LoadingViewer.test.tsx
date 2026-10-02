import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import LoadingViewer, { type LoadingViewerProps } from './LoadingViewer';
import { clearPhysicsTarget, publishPhysicsTarget, type PhysicsTarget } from './physicsTarget';
import { buildSecuringUsage } from './inertiaCertification';
import { clearInertiaCanvasPlayback, nextInertiaCanvasRunId, publishInertiaCanvasPlayback } from './inertiaCanvasStore';
import type { InertiaAnimationFrame } from './engine/inertiaSimulation';

const captured = vi.hoisted(() => ({ props: undefined as LoadingViewerProps | undefined, renderer: 'three' }));
vi.mock('./UnityLoadingViewer', () => ({ default: (props: LoadingViewerProps) => { captured.props = props; return <canvas data-renderer-test="unity"/>; } }));
vi.mock('./ThreeLoadingViewer', () => ({ default: (props: LoadingViewerProps) => { captured.props = props; return <canvas data-renderer-test="three"/>; } }));
vi.mock('./viewerComparison', () => ({ useViewerComparison: () => ({ enabled: true, renderer: captured.renderer }), setComparisonRenderer: vi.fn() }));

let root: Root, host: HTMLDivElement;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); clearInertiaCanvasPlayback(); clearPhysicsTarget(); vi.unstubAllGlobals(); });

it.each(['three', 'unity'])('preserves the %s main canvas plan objects across cloned-target replay and close', async renderer => {
  captured.renderer = renderer;
  const container = { length: 6, width: 2, height: 3, maxPayloadKg: 1000 };
  const box = { cargoId: 'A', x: 1, y: .5, z: .2, length: 1, width: 1, height: 1, weightKg: 10 };
  const result = { placements: [box], remaining: [], validationIssues: [], usedVolumeM3: 1, loadedWeightKg: 35 };
  const supports = [{ id: 'PALLET-1', x: 1, y: .5, z: 0, length: 1, width: 1, height: .2, weightKg: 25 }];
  const target: PhysicsTarget = { mode: 'pallets', container: { ...container }, cargo: [],
    result: { ...result, placements: [{ ...box }] }, supports: supports.map(support => ({ ...support, id: 'PALLET-01' })) };
  const securing = buildSecuringUsage(target, 0);
  publishPhysicsTarget(target);
  await act(async () => root.render(<LoadingViewer inertiaHost container={container} result={result} supports={supports} securing={securing}/>));
  const canvas = host.querySelector('canvas');
  expect(canvas).not.toBeNull();
  const assertOriginalPlan = () => {
    expect(captured.props!.container).toBe(container);
    expect(captured.props!.result).toBe(result);
    expect(captured.props!.supports).toBe(supports);
    expect(captured.props!.securing).toBe(securing);
    expect(captured.props!.cargo).toBeUndefined();
    expect(host.querySelector('canvas')).toBe(canvas);
  };
  const runId = nextInertiaCanvasRunId(), playbackSecuring = buildSecuringUsage(target, 1);
  await act(async () => { expect(publishInertiaCanvasPlayback({ runId, target, securing: playbackSecuring })).toBe(true); });
  assertOriginalPlan();
  expect(captured.props!.frameData).toBeUndefined();
  const frame: InertiaAnimationFrame = { phase: 'force', step: 60, cargo: new Float32Array([1, 1, 1, 0, 0, 0, 1]), supports: new Float32Array([1, .1, 0, 0, 0, 0, 1]) };
  await act(async () => { expect(publishInertiaCanvasPlayback({ runId, target, securing: playbackSecuring, frame })).toBe(true); });
  assertOriginalPlan();
  expect(captured.props!.frameData).toBe(frame);
  await act(async () => clearInertiaCanvasPlayback());
  assertOriginalPlan();
  expect(captured.props!.frameData).toBeUndefined();
  expect(host.querySelector('.inertia-canvas-host')?.getAttribute('data-inertia-active')).toBe('false');
});
