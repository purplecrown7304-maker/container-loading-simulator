import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StagingYardPanel, { type StagingYardPanelProps } from './StagingYardPanel';
import type { StagingCounts, StagingInventory, StagingUnit } from './stagingInventory';
import { buildStagingYardLayout } from './stagingYardLayout';
import { setUiLanguage } from './uiLanguage';

function box(id: string, location: StagingUnit['location'] = 'yard'): StagingUnit {
  return { id, kind: 'box', name: `화물 ${id}`, cargoId: id, cargoIds: [id], length: .5, width: .4, height: .3, weightKg: 12.5, boxCount: 1, unloadPriorities: [1], location,
    verdict: location === 'yard' ? 'pending' : 'placed', reasons: [], boxUnits: [{ id, stableId: id, cargoId: id }] };
}
function counts(units: StagingUnit[]): StagingCounts {
  return { pallets: units.filter(unit => unit.kind === 'pallet').length, looseBoxes: units.filter(unit => unit.kind === 'box').length, boxes: units.reduce((sum, unit) => sum + unit.boxCount, 0), weightKg: units.reduce((sum, unit) => sum + unit.weightKg, 0) };
}
function inventory(units: StagingUnit[]): StagingInventory {
  const yardUnits = units.filter(unit => unit.location === 'yard'), vehicleUnits = units.filter(unit => unit.location === 'vehicle'), otherVehicleUnits = units.filter(unit => unit.location === 'other-vehicle');
  return { inputSignature: 'panel-test', units, yardUnits, vehicleUnits, otherVehicleUnits,
    summary: { total: counts(units), vehicle: counts(vehicleUnits), otherVehicles: counts(otherVehicleUnits), yard: counts(yardUnits), unloaded: counts(yardUnits.filter(unit => unit.verdict === 'unloaded')) }, excluded: [], issues: [], packagingStatus: 'not-required', referenceResult: false, identity: { unitToStableId: {} } };
}
let root: Root;
let host: HTMLDivElement;
let props: StagingYardPanelProps;
async function render(change: Partial<StagingYardPanelProps> = {}) {
  props = { ...props, ...change }; await act(async () => root.render(<StagingYardPanel {...props} />));
}
async function click(element: HTMLElement) { await act(async () => element.click()); }
function button(text: string, scope: ParentNode = host) {
  const found = Array.from(scope.querySelectorAll<HTMLButtonElement>('button')).find(item => item.textContent?.trim() === text);
  expect(found, `button: ${text}`).toBeDefined(); return found!;
}
async function openTools() {
  await act(async () => { const tools = host.querySelector<HTMLDetailsElement>('.staging-panel-tools')!; tools.open = true; tools.dispatchEvent(new Event('toggle')); });
}
async function input(value: string) {
  await act(async () => { const target = host.querySelector<HTMLInputElement>('.staging-panel-search input')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(target, value); target.dispatchEvent(new Event('input', { bubbles: true })); });
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); setUiLanguage('ko');
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  const data = inventory(Array.from({ length: 10 }, (_, index) => box(`A-${index}`)));
  const layout = buildStagingYardLayout(data.yardUnits, { container: { length: 4, width: 2, height: 2 }, vehicleRig: 'none' });
  props = { inventory: data, layout, selectedId: null, view: 'all', visibleZoneIds: layout.zones.slice(0, 4).map(zone => zone.id), zonePage: 0, zonePageCount: Math.ceil(layout.zones.length / 4), busy: false, canUndo: true, message: '',
    onSelect: vi.fn(), onLoad: vi.fn(), onWithdraw: vi.fn(), onUndo: vi.fn(), onView: vi.fn(), onZonePage: vi.fn(), onArrange: vi.fn(), onPackagingDetails: vi.fn() };
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); setUiLanguage('ko'); vi.unstubAllGlobals(); });

describe('staging yard panel', () => {
  it('shows authoritative prepared, current vehicle, waiting and failed subsets without adding the failed subset twice', async () => {
    const failed = { ...box('FAILED'), verdict: 'unloaded' as const, reasons: [] };
    const data = inventory([box('WAITING'), failed, box('LOADED', 'vehicle'), box('OTHER', 'other-vehicle')]);
    await render({ inventory: data });
    const rows = Array.from(host.querySelectorAll('.staging-panel-counts > div')).map(row => [row.querySelector('dt')!.textContent, row.querySelector('dd')!.textContent]);
    expect(rows).toEqual([['전체 준비량', '0/4'], ['현재 차량 배치량', '0/1'], ['대기량', '0/2'], ['대기 중 미적재량', '0/1'], ['다른 차량 배치량', '0/1']]);
    expect(host.textContent).toContain('박스 총수량 4개'); expect(host.textContent).toContain('미적재 수량은 대기 수량에 포함됩니다.');
  });

  it('changes camera and yard ordering only through view callbacks and marks the controls view-only', async () => {
    const before = JSON.stringify(props.inventory);
    await render(); await click(button('대기장 보기')); await click(button('차량 내부'));
    expect(props.onView).toHaveBeenNthCalledWith(1, 'yard'); expect(props.onView).toHaveBeenNthCalledWith(2, 'vehicle');
    expect(button('전체 보기').getAttribute('aria-pressed')).toBe('true');
    for (const control of host.querySelectorAll('.staging-panel-views button')) expect(control.getAttribute('data-view-only')).toBe('true');
    await openTools(); await click(button('대기장 정렬')); expect(props.onArrange).toHaveBeenCalledOnce();
    expect(props.onLoad).not.toHaveBeenCalled(); expect(props.onWithdraw).not.toHaveBeenCalled(); expect(JSON.stringify(props.inventory)).toBe(before);
  });

  it('paginates and searches the selectable list without changing inventory quantity or the current scene', async () => {
    await render(); await openTools();
    expect(host.querySelectorAll('[data-staging-unit-id]')).toHaveLength(4);
    await click(button('다음')); expect(host.textContent).toContain('화물 목록 2 / 3 페이지');
    await input('A-9'); expect(host.querySelectorAll('[data-staging-unit-id]')).toHaveLength(1);
    await click(host.querySelector<HTMLElement>('[data-staging-unit-id="A-9"]')!); expect(props.onSelect).toHaveBeenCalledWith('A-9');
    expect(props.inventory.summary.total.boxes).toBe(10); expect(props.onView).not.toHaveBeenCalled(); expect(props.onLoad).not.toHaveBeenCalled();
  });

  it('offers an explicit zone action for a searched offscreen selection without moving the camera on selection', async () => {
    const data = inventory(Array.from({ length: 100 }, (_, index) => box('PAGE-' + index)));
    const layout = buildStagingYardLayout(data.yardUnits, { container: { length: 4, width: 2, height: 2 }, vehicleRig: 'none' });
    const targetId = layout.zones[5].unitIds[0], before = JSON.stringify(data);
    const zoneIndex = layout.zones.findIndex(zone => zone.id === layout.slots.find(slot => slot.unitId === targetId)!.zoneId);
    await render({ inventory: data, layout, visibleZoneIds: layout.zones.slice(0, 4).map(zone => zone.id),
      zonePage: 0, zonePageCount: Math.ceil(layout.zones.length / 4) }); await openTools(); await input(targetId);
    await click(host.querySelector<HTMLElement>('[data-staging-unit-id="' + targetId + '"]')!);
    expect(props.onSelect).toHaveBeenCalledWith(targetId); expect(props.onZonePage).not.toHaveBeenCalled(); expect(props.onView).not.toHaveBeenCalled();
    await render({ selectedId: targetId }); const reveal = button('선택 화물 구역 보기');
    expect(reveal.dataset.viewOnly).toBe('true'); expect(props.onZonePage).not.toHaveBeenCalled();
    await click(reveal); expect(props.onZonePage).toHaveBeenCalledExactlyOnceWith(Math.floor(zoneIndex / 4));
    expect(props.onLoad).not.toHaveBeenCalled(); expect(props.onWithdraw).not.toHaveBeenCalled(); expect(props.onUndo).not.toHaveBeenCalled();
    expect(JSON.stringify(props.inventory)).toBe(before);
    const page = Math.floor(zoneIndex / 4);
    await render({ visibleZoneIds: layout.zones.slice(page * 4, page * 4 + 4).map(zone => zone.id), zonePage: page });
    expect([...host.querySelectorAll('button')].some(node => node.textContent === '선택 화물 구역 보기')).toBe(false);
  });

  it('has no zone action for small all-visible yards, absent slots or vehicle cargo', async () => {
    await render({ selectedId: 'A-0', visibleZoneIds: props.layout.zones.map(zone => zone.id) });
    expect([...host.querySelectorAll('button')].some(node => node.textContent === '선택 화물 구역 보기')).toBe(false);
    await render({ layout: { ...props.layout, slots: [] }, visibleZoneIds: [] });
    expect([...host.querySelectorAll('button')].some(node => node.textContent === '선택 화물 구역 보기')).toBe(false);
    await render({ inventory: inventory([box('A-0', 'vehicle')]) });
    expect([...host.querySelectorAll('button')].some(node => node.textContent === '선택 화물 구역 보기')).toBe(false);
  });

  it.each([['en', 'Show selected cargo zone'], ['vi', 'Xem khu của hàng đã chọn']] as const)('localizes the explicit hidden-zone action in %s', async (language, label) => {
    setUiLanguage(language);
    await render({ selectedId: 'A-0', visibleZoneIds: [] }); expect(button(label).dataset.viewOnly).toBe('true');
  });

  it('shows the selected yard box details and calls the matching load, undo and deselect actions', async () => {
    await render({ selectedId: 'A-0', preview: { valid: false, reasons: ['실제 지지 부족'] } });
    expect(host.querySelector<HTMLDetailsElement>('.staging-panel-tools')!.open).toBe(true);
    const selected = host.querySelector('.staging-panel-selection')!;
    expect(selected.textContent).toContain('A-0'); expect(selected.textContent).toContain('500 × 400 × 300 mm'); expect(selected.textContent).toContain('12.5 kg'); expect(selected.textContent).toContain('계산 전');
    expect(selected.textContent).toContain('배치 불가'); expect(selected.textContent).toContain('실제 지지 부족');
    expect(button('대기장으로 회수').disabled).toBe(true); expect(button('선택 화물 적재').disabled).toBe(false);
    await click(button('선택 화물 적재')); await click(button('되돌리기'));
    expect(props.onLoad).toHaveBeenCalledOnce(); expect(props.onUndo).toHaveBeenCalledOnce();
    await click(button('선택 해제')); expect(props.onSelect).toHaveBeenCalledWith(null);
  });

  it('shows an accepted candidate that leaves a balance error as allowed with its caution, never as rejected', async () => {
    const caution = '무게중심 기준을 벗어납니다. 이 오류가 해소될 때까지 운송 검증과 출고는 통과할 수 없습니다: CG_LATERAL · 폭 방향 무게중심 편차 183mm가 허용 ±118mm를 넘습니다.';
    await render({ selectedId: 'A-0', preview: { valid: true, reasons: [], cautions: [caution] } });
    const preview = host.querySelector('.staging-panel-preview')!;
    expect(preview.className).toBe('staging-panel-preview valid caution');
    expect(preview.textContent).toContain('배치 가능 · 무게중심 오류가 남습니다'); expect(preview.textContent).toContain('CG_LATERAL'); expect(preview.textContent).not.toContain('배치 불가');
    // Without a caution it is the plain accepted state, and a rejected candidate shows its reasons only.
    await render({ preview: { valid: true, reasons: [], cautions: [] } });
    expect(host.querySelector('.staging-panel-preview')!.className).toBe('staging-panel-preview valid'); expect(host.querySelector('.staging-panel-preview ul')).toBeNull();
    await render({ preview: { valid: false, reasons: ['다른 화물과 충돌합니다.'], cautions: [caution] } });
    expect(host.querySelector('.staging-panel-preview')!.className).toBe('staging-panel-preview invalid');
    expect(host.querySelector('.staging-panel-preview')!.textContent).not.toContain('무게중심');
  });

  it('marks a pallet that automatic loading will keep in place, offers to let go of it and counts the held ones', async () => {
    const data = inventory([box('LOADED', 'vehicle'), box('WAIT')]), onUnpin = vi.fn();
    await render({ inventory: data, selectedId: 'LOADED', pinned: true, pinnedCount: 2, onUnpin });
    const held = host.querySelector<HTMLElement>('[data-staging-pinned="true"]')!;
    expect(held.textContent).toContain('자리 고정'); expect(held.textContent).toContain('자동 적재');
    await click(button('고정 해제', held)); expect(onUnpin).toHaveBeenCalledOnce();
    expect(host.querySelector('[data-staging-pinned-count="2"]')!.textContent).toContain('자리 고정 파렛트 2개');
    // While a calculation runs the pin cannot be changed under it.
    await render({ busy: true }); expect(button('고정 해제').disabled).toBe(true);
    // Nothing held: no marker and no count.
    await render({ busy: false, pinned: false, pinnedCount: 0 });
    expect(host.querySelector('[data-staging-pinned]')).toBeNull(); expect(host.querySelector('[data-staging-pinned-count]')).toBeNull();
  });

  it('permits withdrawal only for a current-vehicle selection and honors busy and owner safety gates', async () => {
    const data = inventory([box('LOADED', 'vehicle'), box('OTHER', 'other-vehicle')]);
    await render({ inventory: data, selectedId: 'LOADED' });
    expect(button('선택 화물 적재').disabled).toBe(true); expect(button('대기장으로 회수').disabled).toBe(false);
    await click(button('대기장으로 회수')); expect(props.onWithdraw).toHaveBeenCalledOnce();
    await render({ canWithdraw: false }); expect(button('대기장으로 회수').disabled).toBe(true);
    await render({ selectedId: 'OTHER', canWithdraw: true }); expect(button('대기장으로 회수').disabled).toBe(true);
    await render({ inventory: inventory([box('WAIT')]), selectedId: 'WAIT', busy: true });
    expect(button('선택 화물 적재').disabled).toBe(true); expect(button('되돌리기').disabled).toBe(true); expect(button('대기장 보기').disabled).toBe(false);
  });

  it('never loads an unbuilt pallet-mode fallback as a loose box and exposes the actual packaging state', async () => {
    const waiting = { ...box('RAW'), requiresPackaging: true };
    const data = { ...inventory([waiting]), packagingStatus: 'pending' as const };
    await render({ inventory: data, selectedId: 'RAW', canLoad: true });
    expect(host.textContent).toContain('포장 계획 계산 중'); expect(host.textContent).toContain('포장 계획 완료 후 상차할 수 있습니다.');
    expect(button('선택 화물 적재').disabled).toBe(true);
    await render({ inventory: { ...data, packagingStatus: 'error' } }); expect(host.textContent).toContain('포장 계획을 확인하세요');
  });

  it('shows real pallet membership and packaging flags without inventing wrapping or a transport PASS', async () => {
    const unit = { ...box('PALLET'), kind: 'pallet' as const, boxCount: 2, cargoIds: ['A', 'B'], packaging: { bandingStraps: 2, wrapping: false, cornerGuards: true } };
    await render({ inventory: { ...inventory([unit]), packagingStatus: 'ready' }, selectedId: 'PALLET' });
    const selected = host.querySelector('.staging-panel-selection')!;
    expect(selected.textContent).toContain('A, B'); expect(selected.textContent).toContain('밴딩 2줄'); expect(selected.textContent).toContain('랩핑 없음'); expect(selected.textContent).toContain('각대 사용');
    expect(selected.textContent).not.toContain('랩핑 사용'); expect(selected.textContent).toContain('포장 표시는 계획 상태이며 운송 검증을 뜻하지 않습니다.');
    await click(button('포장 상세 보기')); expect(props.onPackagingDetails).toHaveBeenCalledOnce();
  });
  it('shows actual per-SKU names and box membership for a mixed pallet', async () => {
    const unit = { ...box('MIXED'), kind: 'pallet' as const, boxCount: 3, cargoIds: ['A', 'B'], contents: [{ cargoId: 'A', name: '냉각 팬', boxCount: 1, displayColor: '#123456' }, { cargoId: 'B', name: '교체 필터', boxCount: 2, displayColor: '#efac12' }] };
    await render({ inventory: inventory([unit]), selectedId: unit.id });
    const selected = host.querySelector('.staging-panel-selection')!;
    expect(selected.textContent).toContain('냉각 팬 (A) · 1개'); expect(selected.textContent).toContain('교체 필터 (B) · 2개');
    expect(props.inventory.summary.total.boxes).toBe(3);
  });

  it('shows the true visible-zone subset and total with bounded zone-page actions', async () => {
    await render({ visibleZoneIds: [props.layout.zones[0].id, 'invalid-zone'], zonePage: 1, zonePageCount: 3 }); await openTools();
    expect(host.textContent).toContain(`표시 1구역 / 전체 ${props.layout.zones.length}구역`);
    await click(button('이전 구역')); await click(button('다음 구역'));
    expect(props.onZonePage).toHaveBeenNthCalledWith(1, 0); expect(props.onZonePage).toHaveBeenNthCalledWith(2, 2);
  });

  it('keeps absent failure reasons unknown and displays actual input exclusions separately', async () => {
    const failed = { ...box('FAILED'), verdict: 'unloaded' as const };
    const data = { ...inventory([failed]), excluded: [{ cargoId: 'BAD', quantity: 2, reason: '유효하지 않은 높이' }] };
    await render({ inventory: data, selectedId: 'FAILED' });
    expect(host.textContent).toContain('사유 정보 없음'); expect(host.textContent).not.toContain('공간 부족'); expect(host.textContent).toContain('입력에서 제외된 화물'); expect(host.textContent).toContain('BAD · 2개'); expect(host.textContent).toContain('유효하지 않은 높이');
  });
});
