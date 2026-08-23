import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './ErrorBoundary';
import ExcelImportActions from './ExcelImportActions';
import ExcelExportActions from './ExcelExportActions';
import LocationSelectionBridge from './LocationSelectionBridge';
import CargoFilterBar from './CargoFilterBar';
import AutoCorrectionPanel from './AutoCorrectionPanel';
import DashboardRuntimeEnhancer from './DashboardRuntimeEnhancer';
import StrategyComparisonPanel from './StrategyComparisonPanel';
import SpareCapacityPanel from './SpareCapacityPanel';
import ManualPlacementEditor from './ManualPlacementEditor';
import GroupMoveSuggestionPanel from './GroupMoveSuggestionPanel';
import GroupDragController from './GroupDragController';
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
      <ExcelImportActions />
      <ExcelExportActions />
      <LocationSelectionBridge />
      <CargoFilterBar />
      <AutoCorrectionPanel />
      <DashboardRuntimeEnhancer />
      <StrategyComparisonPanel />
      <SpareCapacityPanel />
      <ManualPlacementEditor />
      <GroupMoveSuggestionPanel />
      <GroupDragController />
    </ErrorBoundary>
  </React.StrictMode>,
);
