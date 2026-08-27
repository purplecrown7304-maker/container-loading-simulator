import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './ErrorBoundary';
import ExcelImportActions from './ExcelImportActions';
import ExcelExportActions from './ExcelExportActions';
import LocationSelectionBridge from './LocationSelectionBridge';
import DashboardRuntimeEnhancer from './DashboardRuntimeEnhancer';
import ResultsOverlay from './ResultsOverlay';
import AutoCertificationBridge from './AutoCertificationBridge';
import CertificationInvalidationBridge from './CertificationInvalidationBridge';
import CertifiedExportConsistencyBridge from './CertifiedExportConsistencyBridge';
import CertificationResultSummaryBridge from './CertificationResultSummaryBridge';
import FinalCertificationGate from './FinalCertificationGate';
import FinalWorkOrderOptimizer from './FinalWorkOrderOptimizer';
import DirectWorkOrderOptimizer from './DirectWorkOrderOptimizer';
import PalletResultsOptimizer from './PalletResultsOptimizer';
import SecuringMaterialSettingsPanel from './SecuringMaterialSettingsPanel';
import EnterprisePackagingPlanner from './EnterprisePackagingPlanner';
import EnterpriseScenarioExplorer from './EnterpriseScenarioExplorer';
import ProductPackagingExcelActions from './ProductPackagingExcelActions';
import WorkspaceTools from './WorkspaceTools';
import ReferenceWorkspaceBar from './ReferenceWorkspaceBar';
import PhysicsValidationTool from './PhysicsValidationTool';
import InertiaTestTool from './InertiaTestTool';
import InertiaTestLauncher from './InertiaTestLauncher';
import PalletFooterSummaryBridge from './PalletFooterSummaryBridge';
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
import './performance-overrides.css';
import './workspace-tools.css';
import './reference-layout.css';
import './reference-viewer.css';
import './pallet-inspector.css';
import './physics-validation.css';
import './physics-pallet.css';
import './ui-layout-fixes.css';
import './inertia-test.css';
import './inertia-launcher.css';
import './pallet-footer-summary.css';
import './final-certification.css';
import './securing-material-settings.css';
import './product-packaging.css';
import './enterprise-packaging.css';
import './enterprise-scenario.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ReferenceWorkspaceBar />
      <ResultsOverlay />
      <AutoCertificationBridge />
      <CertificationInvalidationBridge />
      <CertifiedExportConsistencyBridge />
      <CertificationResultSummaryBridge />
      <FinalCertificationGate />
      <FinalWorkOrderOptimizer />
      <DirectWorkOrderOptimizer />
      <PalletResultsOptimizer />
      <App />
      <EnterprisePackagingPlanner />
      <EnterpriseScenarioExplorer />
      <ProductPackagingExcelActions />
      <SecuringMaterialSettingsPanel />
      <PalletFooterSummaryBridge />
      <WorkspaceTools />
      <PhysicsValidationTool />
      <InertiaTestTool />
      <InertiaTestLauncher />
      <ExcelImportActions />
      <ExcelExportActions />
      <LocationSelectionBridge />
      <DashboardRuntimeEnhancer />
    </ErrorBoundary>
  </React.StrictMode>,
);
