import { lazy, Suspense, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { uiText, useUiLanguage } from '../uiLanguage';
import { OPEN_COMPANY_WORKSPACE_EVENT } from './events';
import { captureCompanySnapshot, loadCompanySnapshot } from './simulationSnapshot';

const CompanyWorkspace = lazy(() => import('./CompanyWorkspace'));
export default function CompanyServiceHost() {
  useUiLanguage();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_COMPANY_WORKSPACE_EVENT, show);
    return () => window.removeEventListener(OPEN_COMPANY_WORKSPACE_EVENT, show);
  }, []);
  return open ? createPortal(<Suspense fallback={<div role="status">{uiText('기업 공간을 여는 중…')}</div>}>
    <CompanyWorkspace onClose={() => setOpen(false)} onCapture={captureCompanySnapshot}
      onLoad={snapshot => { loadCompanySnapshot(snapshot); setOpen(false); }} />
  </Suspense>, document.body) : null;
}
