import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorkspaceModal from './WorkspaceModal';

let host: HTMLDivElement;
let root: Root;
let opener: HTMLButtonElement;
let close: ReturnType<typeof vi.fn<() => void>>;
const mountDraft = vi.fn();
const unmountDraft = vi.fn();

function Draft() {
  useEffect(() => { mountDraft(); return unmountDraft; }, []);
  return <input aria-label="Retained draft" defaultValue="" />;
}

async function render(open: boolean, title = '제품 선택', onClose: () => void = close) {
  await act(async () => root.render(<WorkspaceModal open={open} title={title} onClose={onClose}
    footer={<button type="button">Next stage</button>}>
    <Draft />
    <div hidden><button type="button">Hidden stage action</button></div>
    <button type="button" disabled>Disabled action</button>
  </WorkspaceModal>));
}

async function key(key: string, shiftKey = false) {
  const event = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
  await act(async () => { (document.activeElement ?? document.body).dispatchEvent(event); });
  return event;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mountDraft.mockClear(); unmountDraft.mockClear(); close = vi.fn();
  host = document.createElement('div'); opener = document.createElement('button');
  opener.textContent = 'Open workspace'; document.body.append(opener, host); root = createRoot(host); opener.focus();
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('retained workspace dialog', () => {
  it('starts hidden, mounts its draft only once and preserves it through repeated open/close cycles', async () => {
    await render(false);
    const backdrop = host.querySelector<HTMLElement>('.workspace-modal-backdrop')!;
    const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!;
    const draft = host.querySelector<HTMLInputElement>('input')!;
    expect(backdrop.hidden).toBe(true);
    expect(document.activeElement).toBe(opener);
    draft.value = 'Unsubmitted product filter';
    for (let cycle = 0; cycle < 3; cycle++) {
      await render(true);
      expect(backdrop.hidden).toBe(false);
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      expect(dialog.getAttribute('aria-label')).toBe('제품 선택 설정');
      expect(document.activeElement).toBe(host.querySelector('.workspace-modal-close'));
      await render(false);
      expect(backdrop.hidden).toBe(true);
      expect(document.activeElement).toBe(opener);
      expect(host.querySelector('input')).toBe(draft);
      expect(draft.value).toBe('Unsubmitted product filter');
    }
    expect(mountDraft).toHaveBeenCalledTimes(1);
    expect(unmountDraft).not.toHaveBeenCalled();
  });

  it('requests close from the close button, Escape or backdrop only, and detaches Escape when hidden', async () => {
    await render(true);
    await act(async () => host.querySelector<HTMLButtonElement>('.workspace-modal-close')!.click());
    expect(close).toHaveBeenCalledTimes(1);
    const escape = await key('Escape');
    expect(escape.defaultPrevented).toBe(true);
    expect(close).toHaveBeenCalledTimes(2);
    await act(async () => host.querySelector('input')!.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(close).toHaveBeenCalledTimes(2);
    await act(async () => host.querySelector('.workspace-modal-backdrop')!.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(close).toHaveBeenCalledTimes(3);
    await render(false);
    expect((await key('Escape')).defaultPrevented).toBe(false);
    expect(close).toHaveBeenCalledTimes(3);
  });

  it('traps Tab in visible enabled controls, including the footer, in both directions', async () => {
    await render(true);
    const first = host.querySelector<HTMLButtonElement>('.workspace-modal-close')!;
    const last = host.querySelector<HTMLButtonElement>('.workspace-modal-footer button')!;
    expect((await key('Tab', true)).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
    expect((await key('Tab')).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
    host.querySelector<HTMLInputElement>('input')!.focus();
    expect((await key('Tab')).defaultPrevented).toBe(false);
    opener.focus();
    expect((await key('Tab')).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
  });

  it('preserves input focus on stage-title changes and invokes the latest close callback', async () => {
    await render(true);
    const draft = host.querySelector<HTMLInputElement>('input')!;
    draft.focus();
    const updatedClose = vi.fn();
    await render(true, '제품 포장', updatedClose);
    expect(host.querySelector('[role="dialog"]')!.getAttribute('aria-label')).toBe('제품 포장 설정');
    expect(document.activeElement).toBe(draft);
    await key('Escape');
    expect(updatedClose).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });

  it('lets a nested portaled dialog own its Escape and Tab events', async () => {
    await render(true);
    const nested = document.createElement('div'); nested.setAttribute('role', 'dialog');
    const nestedInput = document.createElement('input'); nested.append(nestedInput); document.body.append(nested); nestedInput.focus();
    expect((await key('Escape')).defaultPrevented).toBe(false);
    expect((await key('Tab', true)).defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(nestedInput);
    expect(close).not.toHaveBeenCalled();
  });

  it.each(['removed', 'hidden', 'disabled'] as const)('returns focus to the current workspace button when the opener is %s', async state => {
    const rail = document.createElement('div'); rail.className = 'guided-step-list';
    const current = document.createElement('button'); current.setAttribute('aria-current', 'step'); rail.append(current); document.body.append(rail);
    await render(true);
    if (state === 'removed') opener.remove();
    else if (state === 'hidden') opener.hidden = true;
    else opener.disabled = true;
    await render(false);
    expect(document.activeElement).toBe(current);
  });
});
