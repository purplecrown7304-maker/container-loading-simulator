import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './ErrorBoundary';
import ExcelImportActions from './ExcelImportActions';
import LocationSelectionBridge from './LocationSelectionBridge';
import CargoFilterBar from './CargoFilterBar';
import './styles.css';
import './mode.css';
import './error.css';
import './selection.css';
import './cargo-filter.css';
import './layer-slicer.css';
import './minimap.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
      <ExcelImportActions />
      <LocationSelectionBridge />
      <CargoFilterBar />
    </ErrorBoundary>
  </React.StrictMode>,
);
