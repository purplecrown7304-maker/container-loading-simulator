import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './ErrorBoundary';
import ExcelImportActions from './ExcelImportActions';
import ExcelExportActions from './ExcelExportActions';
import ResultsOverlay from './ResultsOverlay';
import CertificationInvalidationBridge from './CertificationInvalidationBridge';
import './certifiedExportConsistency';
import FinalCertificationGate from './FinalCertificationGate';
import FinalWorkOrderOptimizer from './FinalWorkOrderOptimizer';
import DirectWorkOrderOptimizer from './DirectWorkOrderOptimizer';
import PalletResultsOptimizer from './PalletResultsOptimizer';
import PalletWeightDistributionDock from './PalletWeightDistributionDock';
import SecuringMaterialSettingsPanel from './SecuringMaterialSettingsPanel';
import EnterprisePackagingPlannerHost from './EnterprisePackagingPlannerHost';
import EnterpriseTransportEquipmentAdapter from './EnterpriseTransportEquipmentAdapter';
import ProductPackagingExcelActions from './ProductPackagingExcelActions';
import EnterprisePackagingOutputActions from './EnterprisePackagingOutputActions';
import EnterprisePackagingStrategyExplorer from './EnterprisePackagingStrategyExplorer';
import EnterpriseCartonApprovalCenter from './EnterpriseCartonApprovalCenter';
import EnterpriseManufacturingSettings from './EnterpriseManufacturingSettings';
import ReferenceWorkspaceBar from './ReferenceWorkspaceBar';
import HeaderActionBridge from './HeaderActionBridge';
import TransportEquipmentSelector from './TransportEquipmentSelector';
import TransportEquipmentDashboardSummary from './TransportEquipmentDashboardSummary';
import TransportEquipmentSafetyGuard from './TransportEquipmentSafetyGuard';
import TransportEquipmentRecalculationNotice from './TransportEquipmentRecalculationNotice';
import PhysicsValidationTool from './PhysicsValidationTool';
import InertiaTestTool from './InertiaTestTool';
import InspectionStatusPanel from './InspectionStatusPanel';
import './tokens.css';
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
import './cargo-form-compact.css';
import './inspection-flow.css';
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
import './enterprise-strategy.css';
import './enterprise-approval.css';
import './enterprise-manufacturing.css';
import './transport-equipment.css';
import './topbar-cleanup.css';
import './pallet-weight-distribution.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ReferenceWorkspaceBar />
      <HeaderActionBridge />
      <TransportEquipmentSelector />
      <TransportEquipmentSafetyGuard />
      <TransportEquipmentRecalculationNotice />
      <ResultsOverlay />
      <CertificationInvalidationBridge />
      <FinalCertificationGate />
      <FinalWorkOrderOptimizer />
      <DirectWorkOrderOptimizer />
      <PalletResultsOptimizer />
      <App />
      <PalletWeightDistributionDock />
      <InspectionStatusPanel />
      <TransportEquipmentDashboardSummary />
      <EnterprisePackagingPlannerHost />
      <EnterpriseTransportEquipmentAdapter />
      <ProductPackagingExcelActions />
      <EnterprisePackagingOutputActions />
      <EnterpriseManufacturingSettings />
      <EnterprisePackagingStrategyExplorer />
      <EnterpriseCartonApprovalCenter />
      <SecuringMaterialSettingsPanel />
      <PhysicsValidationTool />
      <InertiaTestTool />
      <ExcelImportActions />
      <ExcelExportActions />
    </ErrorBoundary>
  </React.StrictMode>,
);
