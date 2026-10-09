import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import CompanyWorkspace from './CompanyWorkspace';
import ErrorBoundary from '../ErrorBoundary';

// A separate lightweight entry point for phones: no WebGL/loading engine imports,
// no automatic personal catalog sharing, and all persistence goes through the API.
createRoot(document.getElementById('root')!).render(<StrictMode><ErrorBoundary><CompanyWorkspace standalone /></ErrorBoundary></StrictMode>);
