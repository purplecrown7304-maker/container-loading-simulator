import { readShipmentInstructionSnapshot } from './shipmentInstruction';
import { readStoredState } from './storage';

export const APP_ACTION_EVENT = 'container-loading:app-action';
export const OPEN_WORKSPACE_EVENT = 'container-loading:open-workspace';
export const EXCEL_IMPORT_EVENT = 'container-loading:excel-import';

export type AppAction =
  | 'run-loading'
  | 'load-local'
  | 'save-local'
  | 'print-report'
  | 'show-results'
  | 'reset-all'
  | 'dashboard'
  | 'viewer';

export type WorkspaceTab = 'boxes' | 'vehicles' | 'safety' | 'data';
export type ExcelImportMode = 'replace' | 'merge';

export type AppActionDetail = {
  action: AppAction;
  /** 자동 적재 직전에 저장된 포장 cargo를 App이 canonical 입력으로 읽어야 하는 액션인지 표시한다. */
  synchronizedStoredState?: boolean;
};
export type WorkspaceOpenDetail = { tab: WorkspaceTab };
export type ExcelImportDetail = {
  action: 'template' | 'upload';
  mode?: ExcelImportMode;
};

function emitAppAction(action: AppAction, detail: Omit<AppActionDetail, 'action'> = {}) {
  window.dispatchEvent(new CustomEvent<AppActionDetail>(APP_ACTION_EVENT, { detail: { action, ...detail } }));
}

function hasConfirmedPackagingState() {
  const packagedState = readStoredState();
  if (!packagedState?.cargo?.length) return false;
  return Boolean(readShipmentInstructionSnapshot(packagedState.cargo));
}

function isPackagingWorkflowActive() {
  const guidedStep = document.documentElement.dataset.guidedStep === '5';
  const companyProductFlow = Boolean(document.querySelector('.company-product-flow'));
  return guidedStep || companyProductFlow;
}

/**
 * 제품 포장 흐름에서 실행하는 자동 적재는 App의 React cargo state 동기화 타이밍을 신뢰하지 않는다.
 * 현재 화면이 실제 제품 포장 흐름이고 shipmentInstruction + stored state가 서로 일치할 때만
 * synchronizedStoredState를 붙여 App이 저장된 확정 cargo를 직접 사용하게 한다.
 * 일반 수동 적재 화면은 예전 포장 스냅샷이 남아 있어도 이 경로로 들어오지 않는다.
 */
export function dispatchAppAction(action: AppAction): void {
  if (action === 'run-loading' && isPackagingWorkflowActive() && hasConfirmedPackagingState()) {
    emitAppAction(action, { synchronizedStoredState: true });
    return;
  }
  emitAppAction(action);
}

export function openWorkspace(tab: WorkspaceTab): void {
  window.dispatchEvent(new CustomEvent<WorkspaceOpenDetail>(OPEN_WORKSPACE_EVENT, { detail: { tab } }));
}

export function dispatchExcelImport(action: ExcelImportDetail['action'], mode?: ExcelImportMode): void {
  window.dispatchEvent(new CustomEvent<ExcelImportDetail>(EXCEL_IMPORT_EVENT, { detail: { action, mode } }));
}
