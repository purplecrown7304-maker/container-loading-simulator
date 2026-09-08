import React from 'react';
import ReactDOM from 'react-dom/client';
import AppV3 from './AppV3';
import ErrorBoundary from './ErrorBoundary';
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppV3 />
    </ErrorBoundary>
  </React.StrictMode>,
);
