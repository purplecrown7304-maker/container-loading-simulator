import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import CompanyWorkspace from './CompanyWorkspace';
import ErrorBoundary from '../ErrorBoundary';

// A separate lightweight entry point for phones: no WebGL/loading engine imports,
// no automatic personal catalog sharing, and all persistence goes through the API.
// Default entry is the simulator. Company authentication is explicitly selected.
if (new URL(location.href).searchParams.get('view') !== 'company') location.replace('/');
else createRoot(document.getElementById('root')!).render(<StrictMode><ErrorBoundary><CompanyWorkspace standalone /></ErrorBoundary></StrictMode>);
