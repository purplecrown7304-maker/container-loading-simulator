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
 * 제품 포장 확정 시 localStorage에 저장한 cargo가 가이드 작업의 단일 원본이다.
 * 현재 자동 적재 단계는 5단계이므로 실행 직전에 저장된 포장 cargo를 App 상태에
 * 다시 동기화한 뒤 다음 task에서 계산을 시작한다. 단계가 4→5로 늘어난 뒤 이 조건이
 * 예전 4단계에 남아 있어 자동 적재가 이전 화물을 보는 문제가 있었다.
 */
export function dispatchAppAction(action: AppAction): void {
  if (action === 'run-loading' && document.documentElement.dataset.guidedStep === '5') {
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
