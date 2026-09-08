import React from 'react';
import ReactDOM from 'react-dom/client';
import ErrorBoundary from './ErrorBoundary';
import AppShell from './ux3/layout/AppShell';
import './tokens.css';
import './styles.css';
import './mode.css';
import './selection.css';
import './reference-layout.css';
import './reference-viewer.css';
import './pallet-inspector.css';
import './physics-pallet.css';
import './performance-overrides.css';
import './ui-layout-fixes.css';
import './transport-equipment.css';
import './ux-v3.css';
import './ux-v3-accessibility.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  </React.StrictMode>,
);
