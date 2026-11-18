import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PalletContents from './PalletContents';
import type { LoadingViewerProps } from './LoadingViewer';
import type { PalletLoad } from './engine/palletOptimization';
import { StagingSceneContext, type StagingSceneBridge, useStagingScene } from './stagingSceneContext';
import { setUiLanguage, uiText } from './uiLanguage';

const mini = vi.hoisted(() => ({ props: null as LoadingViewerProps | null, context: undefined as StagingSceneBridge | null | undefined }));
vi.mock('./LoadingViewer', () => ({ default: (props: LoadingViewerProps) => {
  mini.props = props; mini.context = useStagingScene(); return <canvas aria-label="isolated-pallet-preview" />;
} }));
const cargo = ['A', 'B'].map(id => ({ id, name: `Cargo ${id}`, length: .5, width: .4, height: .3, weightKg: 10, quantity: 10, maxStackLayers: 1 }));
const pallet: PalletLoad = { palletIndex: 7, x: 2, y: .5, z: .4, length: 1.2, width: 1, height: .15,
  cargoPlacements: ['A', 'A', 'B'].map((cargoId, index) => ({ cargoId, unitId: `box-${index}`, x: 2.1 + index * .1, y: .6, z: .55,
    length: .5, width: .4, height: .3, weightKg: 10 })),
  stackLevel: 2, stackColumn: 5, cargoWeightKg: 30, packagingWeightKg: 0, packagingExtraHeightM: 0,
  cornerGuardsUsed: false, wrappingUsed: true, totalWeightKg: 55, centerOfGravity: { x: 2.6, y: 1, z: .65 } };
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); setUiLanguage('ko');
  mini.props = null; mini.context = undefined;
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); setUiLanguage('ko'); vi.unstubAllGlobals();
});
const render = (onClose = vi.fn(), context?: StagingSceneBridge) => act(async () => root.render(
  <StagingSceneContext.Provider value={context ?? null}><PalletContents pallet={pallet} cargo={cargo} modelKey="wood-pallet" onClose={onClose} /></StagingSceneContext.Provider>,
));

it('shows actual whole-pallet contents and an isolated local preview without mutating the source plan', async () => {
  const selectUnit = vi.fn(), snapshot = JSON.stringify({ pallet, cargo });
  const context = { selectUnit, selectedUnitId: 'main-yard-selection' } as unknown as StagingSceneBridge;
  await render(vi.fn(), context);
  const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(dialog.getAttribute('aria-labelledby')).toBe(dialog.querySelector('header b')!.id);
  expect(dialog.textContent).toContain('AUTO-PALLET-07 적재 정보');
  expect(dialog.textContent).toContain('5열 · 2단');
  expect(dialog.querySelector('.pallet-content-metrics')!.textContent).toContain('3 EA');
  expect(dialog.querySelector('.pallet-content-metrics')!.textContent).toContain('55 kg');
  expect(dialog.querySelectorAll('.pallet-content-list article')).toHaveLength(2);
  expect(Array.from(dialog.querySelectorAll('.pallet-content-list article strong')).map(node => node.textContent)).toEqual(['2 EA', '1 EA']);
  expect(mini.context).toBeNull(); expect(selectUnit).not.toHaveBeenCalled();
  expect(mini.props).toMatchObject({ preview: true, compact: true, syncSelection: false, geometry: 'platform', showCg: false });
  expect(mini.props!.result.placements).toHaveLength(3);
  expect(mini.props!.result.placements[0]).toMatchObject({ cargoId: 'A', unitId: 'box-0' });
  expect(mini.props!.result.placements[0].x).toBeCloseTo(.1);
  expect(mini.props!.result.placements[0].y).toBeCloseTo(.1);
  expect(mini.props!.result.placements[0].z).toBeCloseTo(.15);
  expect(mini.props!.result.placements[0]).not.toBe(pallet.cargoPlacements[0]);
  expect(mini.props!.supports![0]).toMatchObject({ id: 'PALLET-7', modelKey: 'wood-pallet', x: 0, y: 0, z: 0 });
  expect(JSON.stringify({ pallet, cargo })).toBe(snapshot);
});

it('closes via the labelled button or Escape without propagating Escape to the main viewer', async () => {
  const onClose = vi.fn(), mainEscape = vi.fn();
  window.addEventListener('keydown', mainEscape);
  try {
    await render(onClose);
    const close = host.querySelector<HTMLButtonElement>('button[aria-label="닫기"]')!;
    expect(document.activeElement).toBe(close);
    await act(async () => close.click()); expect(onClose).toHaveBeenCalledTimes(1);
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    await act(async () => window.dispatchEvent(escape));
    expect(onClose).toHaveBeenCalledTimes(2); expect(escape.defaultPrevented).toBe(true);
    expect(mainEscape).not.toHaveBeenCalled();
  } finally { window.removeEventListener('keydown', mainEscape); }
});

it('restores prior focus and removes its Escape listener on close', async () => {
  const previous = document.createElement('button'); previous.textContent = 'previous'; document.body.append(previous); previous.focus();
  const onClose = vi.fn();
  try {
    await render(onClose);
    expect(host.contains(document.activeElement)).toBe(true);
    await act(async () => root.render(null));
    expect(document.activeElement).toBe(previous);
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(onClose).not.toHaveBeenCalled();
  } finally { previous.remove(); }
});

it('updates the dialog and close labels with the existing language catalog', async () => {
  await render();
  await act(async () => setUiLanguage('en'));
  expect(host.querySelector('header b')!.textContent).toBe(uiText('AUTO-PALLET-{0} 적재 정보', ['07']));
  expect(host.querySelector('header button')!.getAttribute('aria-label')).toBe('Close');
  expect(mini.props!.title).toBe(uiText('팔레트 {0} 상세', [7]));
});
