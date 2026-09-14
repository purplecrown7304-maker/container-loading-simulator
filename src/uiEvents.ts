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

/**
 * 가이드 자동 적재는 App/ExecutionBridge가 localStorage의 확정 포장 cargo를 직접 읽는다.
 * 따라서 run-loading 직전에 같은 상태를 writeStoredState(..., true)로 다시 저장할 이유가 없다.
 * 그 중복 저장은 STORAGE_UPDATED_EVENT를 발생시켜 방금 완료된 result를 pending으로 되돌릴 수 있었다.
 */
export function dispatchAppAction(action: AppAction): void {
  if (action === 'run-loading' && document.documentElement.dataset.guidedStep === '5') {
    const packagedState = readStoredState();
    if (packagedState) {
      emitAppAction(action, { synchronizedStoredState: true });
      return;
    }
  }
  emitAppAction(action);
}

export function openWorkspace(tab: WorkspaceTab): void {
  window.dispatchEvent(new CustomEvent<WorkspaceOpenDetail>(OPEN_WORKSPACE_EVENT, { detail: { tab } }));
}

export function dispatchExcelImport(action: ExcelImportDetail['action'], mode?: ExcelImportMode): void {
  window.dispatchEvent(new CustomEvent<ExcelImportDetail>(EXCEL_IMPORT_EVENT, { detail: { action, mode } }));
}
