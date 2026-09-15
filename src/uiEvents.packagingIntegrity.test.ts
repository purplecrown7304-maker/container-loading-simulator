import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  });

  it('marks a matching product-packaging run so App reads the confirmed stored cargo directly', () => {
    mockedReadStoredState.mockReturnValue(packagedState);
    mockedReadShipmentInstructionSnapshot.mockReturnValue({ id: 'shipment-1' } as never);

    const detail = captureRunDetail();

    expect(detail).toEqual({ action: 'run-loading', synchronizedStoredState: true });
    expect(mockedReadShipmentInstructionSnapshot).toHaveBeenCalledWith(packagedState.cargo);
  });

  it('does not force ordinary manually-entered cargo through the packaging snapshot path', () => {
    mockedReadStoredState.mockReturnValue(packagedState);
    mockedReadShipmentInstructionSnapshot.mockReturnValue(null);

    const detail = captureRunDetail();

    expect(detail).toEqual({ action: 'run-loading' });
  });
});
