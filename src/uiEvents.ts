import { getGuidedWorkflowSnapshot } from './guidedWorkflowState';
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
 * 가이드 흐름에서는 포장 확정 후 저장된 cargo가 자동 적재의 단일 입력이다.
 * React 상태 반영보다 사용자가 5단계 자동 적재를 먼저 누르는 경쟁조건을 막기 위해
 * 실행 이벤트 직전에 저장된 포장 cargo를 App에 동기화하고 다음 task에서 실행한다.
 */
export function dispatchAppAction(action: AppAction): void {
  const guided = getGuidedWorkflowSnapshot();
  if (action === 'run-loading' && guided.active && guided.step === 5) {
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
