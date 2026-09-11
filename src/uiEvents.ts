import { readStoredState, STORAGE_UPDATED_EVENT, type StoredState } from './storage';

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

export type AppActionDetail = { action: AppAction };
export type WorkspaceOpenDetail = { tab: WorkspaceTab };
export type ExcelImportDetail = {
  action: 'template' | 'upload';
  mode?: ExcelImportMode;
};

function emitAppAction(action: AppAction) {
  window.dispatchEvent(new CustomEvent<AppActionDetail>(APP_ACTION_EVENT, { detail: { action } }));
}

/**
 * 제품 포장 흐름의 4단계에서는 포장 확정 시 localStorage에 저장한 cargo가 단일 원본이다.
 * React 상태 반영보다 사용자가 자동 적재를 먼저 누르는 경우 이전 화물이 계산에 들어갈 수 있으므로,
 * 자동 적재 이벤트 직전에 저장된 포장 cargo를 App에 다시 동기화한 뒤 다음 task에서 실행한다.
 */
export function dispatchAppAction(action: AppAction): void {
  if (action === 'run-loading' && document.documentElement.dataset.guidedStep === '4') {
    const packagedState = readStoredState();
    if (packagedState) {
      window.dispatchEvent(new CustomEvent<StoredState>(STORAGE_UPDATED_EVENT, { detail: packagedState }));
      window.setTimeout(() => emitAppAction(action), 0);
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
