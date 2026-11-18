import { uiText } from './uiLanguage';

/**
 * SheetJS is needed only when a spreadsheet is read or written, yet it was part of the
 * startup bundle. These loaders fetch the unchanged Excel modules on first use instead.
 */
export const loadCargoExcel = () => import('./excel');
export const loadProductExcel = () => import('./productExcel');
export const loadProductPackagingExcel = () => import('./productPackagingExcel');
export const loadEnterprisePackagingExcel = () => import('./enterprisePackagingExcelExport');
export const loadExportWorkbooks = () => import('./excelExportWorkbooks');

/** Runs a download once its module has loaded. A failed load is reported to the user;
 * an error thrown by the download itself still surfaces as before. */
export function runExcelDownload<T>(load: () => Promise<T>, run: (module: T) => void): void {
  void load().then(run, (error: unknown) => {
    console.error('Excel module failed to load', error);
    window.alert(uiText('Excel 기능을 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도하세요.'));
  });
}
