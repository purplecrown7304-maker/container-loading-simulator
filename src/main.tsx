import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './ErrorBoundary';
import ExcelImportActions from './ExcelImportActions';
import ExcelExportActions from './ExcelExportActions';
import LocationSelectionBridge from './LocationSelectionBridge';
import CargoFilterBar from './CargoFilterBar';
import DashboardRuntimeEnhancer from './DashboardRuntimeEnhancer';
import ResultsOverlay from './ResultsOverlay';
import './styles.css';
import './mode.css';
import './error.css';
import './selection.css';
import './cargo-filter.css';
import './layer-slicer.css';
import './minimap.css';
import './zone-utilization.css';
import './auto-correction.css';
import './dashboard-mockup.css';
import './dashboard-runtime.css';
import './strategy-comparison.css';
import './spare-capacity.css';
import './manual-editor.css';
import './group-suggestion.css';
import './work-sequence.css';
import './ergonomic-panel.css';
import './results-modal.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ResultsOverlay />
      <App />
      <ExcelImportActions />
      <ExcelExportActions />
      <LocationSelectionBridge />
      <CargoFilterBar />
      <DashboardRuntimeEnhancer />
    </ErrorBoundary>
  </React.StrictMode>,
);
