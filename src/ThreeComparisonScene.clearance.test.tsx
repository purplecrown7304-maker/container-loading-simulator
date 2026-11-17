import { Children, act, isValidElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ThreeComparisonScene, { type ThreeComparisonSceneProps } from './ThreeComparisonScene';
import { viewerPlan } from './viewerSceneProtocol';
import { selectedCargoClearance, type ClearanceSelection } from './cargoClearance';
import type { ThreeComparisonPlan } from './threeComparisonSceneState';

const state = vi.hoisted(() => ({ runtime: {} as Record<string, unknown>, create: vi.fn() }));
// Render the real scene contents/annotations while omitting WebGL-only siblings.
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children: ReactNode }) => Children.toArray(children).filter(child =>
    isValidElement(child) && typeof child.type === 'function' && child.type.name === 'SceneContents'),
  useThree: () => state.runtime, useFrame: vi.fn(),
}));
vi.mock('@react-three/drei', () => ({
  Html: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Line: () => <div data-dimension-line="true" />,
  OrbitControls: () => null,
}));
vi.mock('./threeComparisonModels', () => ({ loadMeshyModel: vi.fn() }));
vi.mock('./threeVehicleModels', () => ({ loadVehicleModel: vi.fn() }));
vi.mock('./threeComparisonLabels', () => ({ acquireComparisonLabels: () => Promise.resolve({ materials: new Map(), release: vi.fn() }) }));
vi.mock('./threeComparisonSceneResources', () => ({ requiredComparisonModelKeys: () => [], createComparisonSceneResources: state.create }));

let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  state.runtime = { invalidate: vi.fn() }; state.create.mockReset().mockImplementation((plan: ThreeComparisonPlan) => ({
    root: new THREE.Group(), applyFrame: vi.fn(), updateVisibility: vi.fn(), dispose: vi.fn(),
    isCargoVisible: (index: number) => Boolean(plan.placements[index]),
    clearanceForSelection: (selection: ClearanceSelection | null) => selectedCargoClearance(plan, selection),
  }));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
function options(rearAccess: 'door' | 'rear', selected = false): ThreeComparisonSceneProps {
  const result = { placements: selected ? [{ cargoId: 'A', x: 1, y: .5, z: 0, length: .5, width: .4, height: .3, weightKg: 1 }] : [],
    remaining: [], validationIssues: [], usedVolumeM3: selected ? .06 : 0, loadedWeightKg: selected ? 1 : 0 };
  return { plan: { ...viewerPlan({ length: 6, width: 2.4, height: 2.6, maxPayloadKg: 1000 }, result, 1), rearAccess, vehicleRig: 'none' },
    cut: 100, shell: true, step: result.placements.length, labels: true, weight: false, showCg: false, view: 'free',
    selected: selected ? 0 : null, clearanceVisible: false, onSelect: vi.fn() };
}
async function render(props: ThreeComparisonSceneProps) { await act(async () => root.render(<ThreeComparisonScene {...props} />)); }

describe('rear equipment marker independent from selected distance controls', () => {
  it.each([['door', '문 ↓'], ['rear', '후면 기준 ↓']] as const)('keeps the empty vehicle %s marker when boundary distances are closed', async (access, label) => {
    await render(options(access));
    expect(host.querySelector(`[data-rear-access="${access}"]`)?.textContent).toBe(label);
    expect(host.querySelectorAll('.three-clearance-label,[data-dimension-line]')).toHaveLength(0);
  });

  it('shows selected dimension lines only while requested and retains the static marker after closing them', async () => {
    const props = options('door', true); await render(props);
    expect(host.querySelector('[data-rear-access="door"]')).not.toBeNull();
    expect(host.querySelectorAll('[data-dimension-line]')).toHaveLength(0);
    await render({ ...props, clearanceVisible: true });
    expect(host.querySelectorAll('[data-dimension-line]')).toHaveLength(2);
    expect(host.querySelectorAll('.three-clearance-label')).toHaveLength(2);
    await render(props);
    expect(host.querySelector('[data-rear-access="door"]')?.textContent).toBe('문 ↓');
    expect(host.querySelectorAll('.three-clearance-label,[data-dimension-line]')).toHaveLength(0);
  });
});
