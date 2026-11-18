import { uiText, useUiLanguage } from './uiLanguage';
import { useEffect, useState } from 'react';
import { boxResultMatchesWorkOrderCertification, palletSnapshotMatchesWorkOrderCertification } from './certifiedExport';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import { confirmUnverifiedExport } from './exportVerification';
import { readLatestInertiaCertification, type InertiaCertification } from './inertiaCertification';
import { readPhysicsTarget } from './physicsTarget';
import type { Detail, PalletSnapshot } from './excelExportWorkbooks';
import { loadExportWorkbooks, runExcelDownload } from './excelModules';

type ExportWindow = Window & { __containerLoadingLatestResult?: Detail; __containerLoadingPalletSnapshot?: PalletSnapshot };

function matchingBoxCertification(detail: Detail): InertiaCertification | undefined {
  const target = readPhysicsTarget();
  const certification = readLatestInertiaCertification();
  return boxResultMatchesWorkOrderCertification(detail, target, certification) ? certification : undefined;
}

function matchingCurrentPalletCertification(snapshot: PalletSnapshot | undefined): InertiaCertification | undefined {
  const target = readPhysicsTarget();
  const certification = readLatestInertiaCertification();
  return palletSnapshotMatchesWorkOrderCertification(snapshot, target, certification) ? certification : undefined;
}


export default function ExcelExportActions() {
  const language = useUiLanguage();
  const [detail, setDetail] = useState<Detail | null>(() => typeof window === 'undefined' ? null : ((window as ExportWindow).__containerLoadingLatestResult ?? null));

  useEffect(() => {
    const onResult = (event: Event) => setDetail((event as CustomEvent<Detail>).detail ?? null);
    window.addEventListener(LOADING_RESULT_EVENT, onResult);
    return () => window.removeEventListener(LOADING_RESULT_EVENT, onResult);
  }, []);

  useEffect(() => {
    const quickRow = document.querySelector('.quick-row');
    if (!quickRow || quickRow.querySelector('.excel-export-runtime')) return;
    const button = document.createElement('button');
    button.className = 'excel-export-runtime';
    button.textContent = uiText('▧ Excel 내보내기');
    button.disabled = !detail;
    const click = () => {
      const target = readPhysicsTarget();
      if (target?.mode === 'pallets') {
        const snapshot = (window as ExportWindow).__containerLoadingPalletSnapshot;
        const certification = matchingCurrentPalletCertification(snapshot);
        if (!certification || !snapshot) {
          window.alert(uiText('팔레트 Excel은 현재 검증 결과와 적재안·출력 좌표가 일치해야 내보낼 수 있습니다. 실패·미완료 결과는 검토용으로 표시됩니다.'));
          return;
        }
        if (!confirmUnverifiedExport(uiText('팔레트 Excel 파일'))) return;
        runExcelDownload(loadExportWorkbooks, workbooks => workbooks.exportPalletWorkbook(target, snapshot, certification));
        return;
      }
      if (!detail) return;
      const certification = matchingBoxCertification(detail);
      if (!certification) {
        window.alert(uiText('Excel은 현재 검증 결과와 적재안·출력 데이터가 일치해야 내보낼 수 있습니다. 실패·미완료 결과는 검토용으로 표시됩니다.'));
        return;
      }
      if (!confirmUnverifiedExport(uiText('Excel 파일'))) return;
      runExcelDownload(loadExportWorkbooks, workbooks => workbooks.exportBoxWorkbook(detail, certification));
    };
    button.addEventListener('click', click);
    quickRow.appendChild(button);
    return () => { button.removeEventListener('click', click); button.remove(); };
  }, [detail, language]);

  return null;
}
