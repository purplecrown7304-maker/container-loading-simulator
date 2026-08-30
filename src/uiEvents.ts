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

export function dispatchAppAction(action: AppAction): void {
  window.dispatchEvent(new CustomEvent<AppActionDetail>(APP_ACTION_EVENT, { detail: { action } }));
}

export function openWorkspace(tab: WorkspaceTab): void {
  window.dispatchEvent(new CustomEvent<WorkspaceOpenDetail>(OPEN_WORKSPACE_EVENT, { detail: { tab } }));
}

export function dispatchExcelImport(action: ExcelImportDetail['action'], mode?: ExcelImportMode): void {
  window.dispatchEvent(new CustomEvent<ExcelImportDetail>(EXCEL_IMPORT_EVENT, { detail: { action, mode } }));
}
