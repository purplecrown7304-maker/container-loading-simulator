import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TruckCard3D from './TruckCard3D';
import { requestTruckThumbnail } from './truckCardThumbnail';
import type { TransportEquipment } from './transportEquipment';

vi.mock('./truckCardThumbnail', () => ({ requestTruckThumbnail: vi.fn() }));
const truck: TransportEquipment = { id: 'truck', category: 'truck', name: '트럭', shortName: '트럭', geometry: 'curtain', length: 5, width: 2, height: 2, maxPayloadKg: 1000, floorLoadLimitKgPerM2: 0, sourceLabel: '합성 테스트' };
let host: HTMLDivElement, root: Root;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.clearAllMocks(); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
describe('static truck card lifecycle', () => {
  it('shows one static image and no card-owned WebGL canvas', async () => {
    vi.mocked(requestTruckThumbnail).mockResolvedValue('data:image/png;base64,truck');
    await act(async () => root.render(<TruckCard3D item={truck} />));
    await vi.waitFor(() => expect(host.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,truck'));
    expect(host.querySelector('canvas')).toBeNull();
    expect(host.querySelector('img')?.alt).toBe('트럭 차량 3D 모형');
  });
  it('never publishes obsolete dimensions when an earlier thumbnail resolves late', async () => {
    let finishOld!: (value: string) => void;
    vi.mocked(requestTruckThumbnail).mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; })).mockResolvedValue('new-image');
    await act(async () => root.render(<TruckCard3D item={truck} />));
    await vi.waitFor(() => expect(requestTruckThumbnail).toHaveBeenCalledOnce());
    await act(async () => root.render(<TruckCard3D item={{ ...truck, length: 7 }} />));
    await vi.waitFor(() => expect(host.querySelector('img')?.getAttribute('src')).toBe('new-image'));
    await act(async () => finishOld('old-image'));
    expect(host.querySelector('img')?.getAttribute('src')).toBe('new-image');
  });
  it('ignores late completion after unmount and reports failed loads truthfully', async () => {
    let finish!: (value: string) => void;
    vi.mocked(requestTruckThumbnail).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await act(async () => root.render(<TruckCard3D item={truck} />));
    await vi.waitFor(() => expect(requestTruckThumbnail).toHaveBeenCalledOnce());
    act(() => root.render(null)); await act(async () => finish('late-image'));
    expect(host.innerHTML).toBe('');
    vi.mocked(requestTruckThumbnail).mockRejectedValue(new Error('WebGL unavailable'));
    await act(async () => root.render(<TruckCard3D item={truck} />));
    await vi.waitFor(() => expect(host.textContent).toContain('차량 3D 이미지 로드 실패'));
    expect(host.querySelector('img')).toBeNull();
  });
});
