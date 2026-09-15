import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./shipmentInstruction', () => ({
  readShipmentInstructionSnapshot: vi.fn(),
}));

vi.mock('./storage', () => ({
  readStoredState: vi.fn(),
}));

import { readShipmentInstructionSnapshot } from './shipmentInstruction';
import { readStoredState } from './storage';
import { APP_ACTION_EVENT, dispatchAppAction, type AppActionDetail } from './uiEvents';

const mockedReadStoredState = vi.mocked(readStoredState);
const mockedReadShipmentInstructionSnapshot = vi.mocked(readShipmentInstructionSnapshot);

const packagedState = {
  container: {
    length: 12.03,
    width: 2.35,
    height: 2.69,
    maxPayloadKg: 26500,
  },
  cargo: [{
    id: 'PKG-P-01',
    name: '제품 A 포장 박스',
    length: 0.8,
    width: 0.46,
    height: 0.39,
    weightKg: 20,
    quantity: 200,
    productId: 'P-01',
  }],
};

function captureRunDetail() {
  let received: AppActionDetail | null = null;
  const listener = (event: Event) => {
    received = (event as CustomEvent<AppActionDetail>).detail;
  };
  window.addEventListener(APP_ACTION_EVENT, listener, { once: true });
  dispatchAppAction('run-loading');
  return received;
}

describe('confirmed packaging run source', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.documentElement.dataset.guidedWorkflow = 'false';
    document.documentElement.dataset.guidedStep = '3';
    document.body.innerHTML = '<section class="company-product-flow"></section>';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('marks a matching company product-packaging run so App reads confirmed stored cargo directly', () => {
    mockedReadStoredState.mockReturnValue(packagedState);
    mockedReadShipmentInstructionSnapshot.mockReturnValue({ id: 'shipment-1' } as never);

    const detail = captureRunDetail();

    expect(detail).toEqual({ action: 'run-loading', synchronizedStoredState: true });
    expect(mockedReadShipmentInstructionSnapshot).toHaveBeenCalledWith(packagedState.cargo);
  });

  it('does not mark a product workflow when the shipment snapshot does not match stored cargo', () => {
    mockedReadStoredState.mockReturnValue(packagedState);
    mockedReadShipmentInstructionSnapshot.mockReturnValue(null);

    const detail = captureRunDetail();

    expect(detail).toEqual({ action: 'run-loading' });
  });

  it('does not let an old confirmed packaging snapshot hijack an ordinary manual loading run', () => {
    document.body.innerHTML = '';
    mockedReadStoredState.mockReturnValue(packagedState);
    mockedReadShipmentInstructionSnapshot.mockReturnValue({ id: 'old-shipment' } as never);

    const detail = captureRunDetail();

    expect(detail).toEqual({ action: 'run-loading' });
    expect(mockedReadShipmentInstructionSnapshot).not.toHaveBeenCalled();
  });
});
