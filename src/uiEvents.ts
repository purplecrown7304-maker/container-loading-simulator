import { readStoredState, writeStoredState } from './storage';

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
  /** 자동 적재 직전에 저장된 포장 cargo를 App으로 다시 주입한 액션인지 표시한다. */
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
 * 제품 포장 확정 시 localStorage에 저장한 cargo가 가이드 작업의 단일 원본이다.
 * 자동 적재 실행 직전에 같은 저장 경로(writeStoredState)를 다시 사용해 App 상태를
 * 동기화한다. 이렇게 해야 이전 result/physics 캐시도 함께 무효화되어 저장 이벤트와
 * 계산 이벤트가 서로 다른 상태를 보지 않는다.
 */
export function dispatchAppAction(action: AppAction): void {
  if (action === 'run-loading' && document.documentElement.dataset.guidedStep === '5') {
    const packagedState = readStoredState();
    if (packagedState) {
      writeStoredState(packagedState, true);
      window.setTimeout(() => emitAppAction(action, { synchronizedStoredState: true }), 0);
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
