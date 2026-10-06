import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import LimitReviewControls, { LimitReviewBanner } from './LimitReviewControls';
import type { ContainerSpec, LimitReviewConfig, LoadingResult } from './engine/types';

const container: ContainerSpec = { length: 6, width: 2.4, height: 2.6, maxPayloadKg: 20000, floorLoadLimitKgPerM2: 1500 };
const cargo = [{ id: 'A', name: '화물', length: .5, width: .4, height: .3, weightKg: 10, quantity: 4, maxStackLayers: 2, maxTopLoadKg: 20 }];
const result: LoadingResult = { placements: [], remaining: [], loadedWeightKg: 0, usedVolumeM3: 0, validationIssues: [] };
let root: Root, host: HTMLDivElement;
const onChange = vi.fn();
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); onChange.mockReset(); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function render(config?: LimitReviewConfig, mode = 'boxes') { await act(async () => root.render(<LimitReviewControls container={{ ...container, limitReview: config }} cargo={cargo} result={result} mode={mode} onChange={onChange} />)); }
async function click(text: string) { const button = [...host.querySelectorAll('button')].find(b => b.textContent === text)!; expect(button).toBeTruthy(); await act(async () => button.click()); }
async function setInput(label: string, value: string) { const input = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!; await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); }); }
async function select(label: string) { const input = [...host.querySelectorAll<HTMLInputElement>('input[type=checkbox]')].find(input => input.parentElement?.textContent === label)!; await act(async () => input.click()); }

it('starts strict and only enables an explicit review mode with unchanged original limits', async () => {
  await render(); expect(host.textContent).toContain('기본 엄격 모드');
  expect(host.querySelectorAll('input')).toHaveLength(0);
  await click('한도 초과 범위 선택'); expect(onChange).toHaveBeenCalledExactlyOnceWith({ mode: 'what-if' });
  expect(container.maxPayloadKg).toBe(20000);
});
it('keeps draft changes private until apply, permits cancelling, and never suggests an automatic excess percentage', async () => {
  await render({ mode: 'what-if' });
  await select('총 적재중량(고정재 포함)'); await setInput('총 적재중량(고정재 포함) 검토 범위', '24000');
  expect(onChange).not.toHaveBeenCalled(); await click('변경 취소');
  expect(host.querySelector<HTMLInputElement>('input[aria-label="총 적재중량(고정재 포함) 검토 범위"]')!.value).toBe('20000');
  expect(host.textContent).not.toContain('10%'); expect(host.textContent).toContain('검토 전용 · 출고 승인 불가');
});
it('applies only selected scenario values and keeps baseline inertial limits distinct', async () => {
  await render({ mode: 'what-if' }); await select('수평 이동'); await setInput('수평 이동 검토 범위', '20');
  await select('총 적재중량(고정재 포함)'); await setInput('총 적재중량(고정재 포함) 검토 범위', '24000'); await click('검토 범위 적용');
  expect(onChange.mock.calls[0][0]).toMatchObject({ mode: 'what-if', maxPayloadKg: 24000, simulation: { maxDisplacementMm: 20 } });
  expect(onChange.mock.calls[0][0].cargoLimits).toBeUndefined(); expect(onChange.mock.calls[0][0].floorLoadLimitKgPerM2).toBeUndefined(); expect(Object.hasOwn(onChange.mock.calls[0][0], 'floorLoadLimitKgPerM2')).toBe(false);
  expect(host.textContent).toContain('원 기준 12 mm');
});
it.each(['', '-1', '0', '10000001'])('rejects invalid selected payload %s without applying', async value => {
  await render({ mode: 'what-if' }); await select('총 적재중량(고정재 포함)'); await setInput('총 적재중량(고정재 포함) 검토 범위', value); await click('검토 범위 적용');
  expect(onChange).not.toHaveBeenCalled(); expect(host.querySelector('[role=alert]')).not.toBeNull();
});
it('does not enable unsupported pallet or mixed review and preserves a visible warning on restored config', async () => {
  await render(undefined, 'pallets'); expect([...host.querySelectorAll('button')].find(b => b.textContent === '한도 초과 범위 선택')!.disabled).toBe(true);
  await render({ mode: 'what-if', maxPayloadKg: 24000 }, 'mixed'); expect(host.querySelector('[role=alert]')?.textContent).toContain('기존 규칙의 박스 직접 적재');
  await click('엄격 모드로 전환'); expect(onChange).toHaveBeenCalledExactlyOnceWith(undefined);
});
it('renders non-dismissable numerical excess and original warning after result restoration', async () => {
  const restored: LoadingResult = JSON.parse(JSON.stringify({ ...result, limitReview: { mode: 'what-if', label: 'WHAT-IF REVIEW', status: 'active', config: { mode: 'what-if', maxPayloadKg: 24000 }, errors: [], metrics: [{ key: 'payload', originalLimit: 20000, scenarioLimit: 24000, actual: 22000, excess: 2000, excessPercent: 10, provenance: 'configured', direction: 'maximum', unit: 'kg' }] } }));
  await act(async () => root.render(<LimitReviewBanner container={{ ...container, limitReview: { mode: 'what-if', maxPayloadKg: 24000 } }} result={restored} />));
  expect(host.textContent).toContain('출고 승인 불가'); expect(host.textContent).toContain('원 기준 20000 / 선택 24000 / 실제 22000 kg'); expect(host.textContent).toContain('2000 kg (10.00%)'); expect(host.querySelector('button')).toBeNull();
});
