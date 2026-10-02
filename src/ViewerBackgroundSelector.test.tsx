import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ReferenceWorkspaceBar from './ReferenceWorkspaceBar';
import ThreeLoadingViewer from './ThreeLoadingViewer';
import type { ThreeComparisonSceneProps } from './ThreeComparisonScene';
import { VIEWER_ENVIRONMENT_STORAGE_KEY } from './viewerEnvironment';
import { WORKFLOW_INPUT_INVALIDATED_EVENT } from './workflowPreview';
import { STORAGE_UPDATED_EVENT } from './storage';
import { OPEN_TRANSPORT_SELECTOR_EVENT } from './transportEquipment';

const captured = vi.hoisted(() => ({ scene: undefined as ThreeComparisonSceneProps | undefined }));
vi.mock('./ThreeComparisonScene', () => ({ default: (props: ThreeComparisonSceneProps) => { captured.scene = props; return <canvas />; } }));
vi.mock('./memberAuth', async importOriginal => ({ ...await importOriginal<typeof import('./memberAuth')>(), restoreMemberSession: async () => null, readSupabaseMember: () => null }));
const container = { length: 6, width: 2.4, height: 2.6, maxPayloadKg: 1000 };
const result = { placements: [], remaining: [], validationIssues: [], usedVolumeM3: 0, loadedWeightKg: 0 };
let root: Root, host: HTMLDivElement;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); sessionStorage.clear(); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const render = () => act(async () => root.render(<><ReferenceWorkspaceBar /><ThreeLoadingViewer container={container} result={result} preview /></>));

it('keeps one background selector beside equipment, and updates the retained scene without input events', async () => {
  await render();
  const input = host.querySelector<HTMLSelectElement>('.reference-utility select[aria-label="3D 배경"]')!;
  const equipment = host.querySelector('.header-equipment-pill')!;
  expect(input).not.toBeNull();
  expect(equipment.nextElementSibling?.contains(input)).toBe(true);
  expect(host.querySelectorAll('select[aria-label="3D 배경"]')).toHaveLength(1);
  const canvas = host.querySelector('canvas'), plan = captured.scene!.plan;
  const inputChanged = vi.fn(), stored = vi.fn(), transport = vi.fn();
  window.addEventListener(WORKFLOW_INPUT_INVALIDATED_EVENT, inputChanged);
  window.addEventListener(STORAGE_UPDATED_EVENT, stored);
  window.addEventListener(OPEN_TRANSPORT_SELECTOR_EVENT, transport);
  try {
    for (const value of ['forest', 'beach', 'space', 'warehouse']) {
      await act(async () => { input.value = value; input.dispatchEvent(new Event('change', { bubbles: true })); });
      expect(captured.scene!.environment).toBe(value);
      expect(captured.scene!.plan).toBe(plan);
      expect(host.querySelector('canvas')).toBe(canvas);
      expect(sessionStorage.getItem(VIEWER_ENVIRONMENT_STORAGE_KEY)).toBe(value);
    }
    expect(inputChanged).not.toHaveBeenCalled(); expect(stored).not.toHaveBeenCalled(); expect(transport).not.toHaveBeenCalled();
    expect(host.querySelector('.renderer-comparison-switch')).toBeNull();
    expect(host.querySelector('.three-comparison-metrics')).toBeNull();
    expect(host.querySelector('.viewer-bottom-info .unity-summary')).not.toBeNull();
  } finally {
    window.removeEventListener(WORKFLOW_INPUT_INVALIDATED_EVENT, inputChanged);
    window.removeEventListener(STORAGE_UPDATED_EVENT, stored);
    window.removeEventListener(OPEN_TRANSPORT_SELECTOR_EVENT, transport);
  }
});

it('restores the view-only selection after remount and keeps loading errors visible without debug clutter', async () => {
  sessionStorage.setItem(VIEWER_ENVIRONMENT_STORAGE_KEY, 'space');
  await render();
  expect(captured.scene!.environment).toBe('space');
  await act(async () => captured.scene!.onError?.('Graphics unavailable'));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Graphics unavailable');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('다시 시도');
  expect(host.textContent).not.toContain('Unity');
  expect(host.textContent).not.toContain('5초 회전 측정');
  expect(host.querySelector('.three-comparison-metrics')).toBeNull();
});
