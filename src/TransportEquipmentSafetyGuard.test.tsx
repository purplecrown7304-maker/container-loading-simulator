// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import TransportEquipmentSafetyGuard from './TransportEquipmentSafetyGuard';
import { getTransportEquipment, readTransportEquipment, selectTransportEquipment } from './transportEquipment';
import { setUiLanguage, uiText, type UiLanguage } from './uiLanguage';

let root: Root; let host: HTMLDivElement;
const original = readTransportEquipment();
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  selectTransportEquipment(original); setUiLanguage('ko');
});

it.each(['ko', 'en', 'vi'] as UiLanguage[])('blocks translated general-cargo actions for tank equipment in %s', async locale => {
  selectTransportEquipment(getTransportEquipment('20-tank')!); setUiLanguage(locale);
  const action = vi.fn();
  await act(async () => root.render(<><TransportEquipmentSafetyGuard /><button data-requires-general-cargo="true" onClick={action}><span>{uiText('작업지시서 보기')}</span></button></>));
  await act(async () => host.querySelector('button > span')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
  expect(action).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alertdialog"]')).not.toBeNull();
  expect(readTransportEquipment().id).toBe('20-tank');
});

it('keeps general-cargo equipment actions available with translated labels', async () => {
  selectTransportEquipment(getTransportEquipment('40-high-cube')!); setUiLanguage('vi');
  const action = vi.fn();
  await act(async () => root.render(<><TransportEquipmentSafetyGuard /><button data-requires-general-cargo="true" onClick={action}>{uiText('작업지시서 보기')}</button></>));
  await act(async () => host.querySelector('button')!.click());
  expect(action).toHaveBeenCalledOnce(); expect(host.querySelector('[role="alertdialog"]')).toBeNull();
});
