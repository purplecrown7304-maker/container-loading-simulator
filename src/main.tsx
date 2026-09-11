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
import FinalWorkflowRecoveryBridge from './FinalWorkflowRecoveryBridge';
import FinalWorkOrderOptimizer from './FinalWorkOrderOptimizer';
import DirectWorkOrderOptimizer from './DirectWorkOrderOptimizer';
import PalletResultsOptimizer from './PalletResultsOptimizer';
import PalletWeightDistributionDock from './PalletWeightDistributionDock';
import PalletWeightDistributionLauncher from './PalletWeightDistributionLauncher';
import SecuringMaterialSettingsPanel from './SecuringMaterialSettingsPanel';
import EnterprisePackagingPlannerHost from './EnterprisePackagingPlannerHost';
import EnterpriseTransportEquipmentAdapter from './EnterpriseTransportEquipmentAdapter';
import ProductPackagingExcelActions from './ProductPackagingExcelActions';
import EnterprisePackagingOutputActions from './EnterprisePackagingOutputActions';
import EnterprisePackagingStrategyExplorer from './EnterprisePackagingStrategyExplorer';
import EnterpriseCartonApprovalCenter from './EnterpriseCartonApprovalCenter';
import EnterpriseManufacturingSettings from './EnterpriseManufacturingSettings';
import ReferenceWorkspaceBar from './ReferenceWorkspaceBar';
import HeaderLoadingStatusBoard from './HeaderLoadingStatusBoard';
import RemainingLengthIndicator from './RemainingLengthIndicator';
import OperationalRightSummary from './OperationalRightSummary';
import DashboardCommandDock from './DashboardCommandDock';
import GuidedWorkflowShell from './GuidedWorkflowShell';
import GuidedResultTabsEnhancer from './GuidedResultTabsEnhancer';
import DiagnosticExportResultButton from './DiagnosticExportResultButton';
import DiagnosticAutoMailBridge from './DiagnosticAutoMailBridge';
import TransportEquipmentSelector from './TransportEquipmentSelector';
import TransportEquipmentDashboardSummary from './TransportEquipmentDashboardSummary';
import TransportEquipmentSafetyGuard from './TransportEquipmentSafetyGuard';
import TransportEquipmentRecalculationNotice from './TransportEquipmentRecalculationNotice';
import TransportEquipmentSelectionUxBridge from './TransportEquipmentSelectionUxBridge';
import TransportEquipmentSpecManager from './TransportEquipmentSpecManager';
import ConfirmedPackagingLoadingBridge from './ConfirmedPackagingLoadingBridge';
import EquipmentLoadingConsistencyGuard from './EquipmentLoadingConsistencyGuard';
import PackagingDataIntegrityGuard from './PackagingDataIntegrityGuard';
import RuntimeDiagnosticRecorder from './RuntimeDiagnosticRecorder';
import PhysicsValidationTool from './PhysicsValidationTool';
import InertiaTestTool from './InertiaTestTool';
import SafetyInspectionCenter from './SafetyInspectionCenter';
import SavedWorkQuickList from './SavedWorkQuickList';
import InspectionStatusPanel from './InspectionStatusPanel';
import ProductToolsCenter from './ProductToolsCenter';
import ProductMenuActions from './ProductMenuActions';
import EquipmentVisualAdminEditor from './EquipmentVisualAdminEditor';
import WorkflowIntegrationBridge from './WorkflowIntegrationBridge';
import LoadingStrategyDock from './LoadingStrategyDock';
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
import './transport-equipment-scroll-fix.css';
import './transport-equipment-selection-ux.css';
import './topbar-cleanup.css';
import './login-segmented.css';
import './pallet-weight-distribution.css';
import './header-loading-status.css';
import './pallet-weight-launcher.css';
import './remaining-length.css';
import './operational-right-summary.css';
import './ux-polish.css';
import './guided-workflow.css';
import './guided-workflow-v2.css';
import './guided-result-tabs-enhancer.css';
import './workflow-usability-fixes.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <RuntimeDiagnosticRecorder />
      <WorkflowIntegrationBridge />
      <ReferenceWorkspaceBar />
      <ProductMenuActions />
      <ProductToolsCenter />
      <HeaderLoadingStatusBoard />
      <TransportEquipmentSelector />
      <TransportEquipmentSelectionUxBridge />
      <TransportEquipmentSpecManager />
      <TransportEquipmentSafetyGuard />
      <TransportEquipmentRecalculationNotice />
      <ResultsOverlay />
      <CertificationInvalidationBridge />
      <FinalCertificationGate />
      <FinalWorkflowRecoveryBridge />
      <FinalWorkOrderOptimizer />
      <DirectWorkOrderOptimizer />
      <PalletResultsOptimizer />
      <EquipmentLoadingConsistencyGuard />
      <PackagingDataIntegrityGuard />
      <ConfirmedPackagingLoadingBridge />
      <App />
      <RemainingLengthIndicator />
      <PalletWeightDistributionDock />
      <PalletWeightDistributionLauncher />
      <InspectionStatusPanel />
      <OperationalRightSummary />
      <DashboardCommandDock />
      <TransportEquipmentDashboardSummary />
      <GuidedWorkflowShell />
      <LoadingStrategyDock />
      <SavedWorkQuickList />
      <EquipmentVisualAdminEditor />
      <GuidedResultTabsEnhancer />
      <DiagnosticExportResultButton />
      <DiagnosticAutoMailBridge />
      <EnterprisePackagingPlannerHost />
      <EnterpriseTransportEquipmentAdapter />
      <ProductPackagingExcelActions />
      <EnterprisePackagingOutputActions />
      <EnterpriseManufacturingSettings />
      <EnterprisePackagingStrategyExplorer />
      <EnterpriseCartonApprovalCenter />
      <SecuringMaterialSettingsPanel />
      <SafetyInspectionCenter />
      <PhysicsValidationTool />
      <InertiaTestTool />
      <ExcelImportActions />
      <ExcelExportActions />
    </ErrorBoundary>
  </React.StrictMode>,
);