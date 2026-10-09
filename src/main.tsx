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


import SecuringMaterialSettingsPanel from './SecuringMaterialSettingsPanel';
import EnterprisePackagingPlannerHost from './EnterprisePackagingPlannerHost';
import EnterpriseTransportEquipmentAdapter from './EnterpriseTransportEquipmentAdapter';
import ProductPackagingExcelActions from './ProductPackagingExcelActions';
import EnterprisePackagingOutputActions from './EnterprisePackagingOutputActions';
import ReferenceWorkspaceBar from './ReferenceWorkspaceBar';
import HeaderLoadingStatusBoard from './HeaderLoadingStatusBoard';
import RemainingLengthIndicator from './RemainingLengthIndicator';
import OperationalRightSummary from './OperationalRightSummary';
import DashboardCommandDock from './DashboardCommandDock';
import GuidedWorkflowShell from './GuidedWorkflowShell';
import GuidedResultTabsEnhancer from './GuidedResultTabsEnhancer';
import DiagnosticExportResultButton from './DiagnosticExportResultButton';
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
import CompanyServiceHost from './company/CompanyServiceHost';
import InspectionStatusPanel from './InspectionStatusPanel';
import ProductToolsCenter from './ProductToolsCenter';
import ProductMenuActions from './ProductMenuActions';
import EquipmentVisualAdminEditor from './EquipmentVisualAdminEditor';
import WorkflowIntegrationBridge from './WorkflowIntegrationBridge';
import { cleanupLegacyUnregisteredBoxes } from './legacyBoxCleanup';
import { initializeSupabasePersistence } from './supabasePersistence';
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
import './guided-loading-strategy.css';
import './guided-loading-unit.css';
import './guided-result-tabs-enhancer.css';
import './workflow-usability-fixes.css';
import './loading-progress.css';
import './studio-motion.css';
import './studio-viewport.css';
import './persistent-workspace.css';
import './viewer-background-selector.css';

function isMobileServiceClient(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  if (nav.userAgentData?.mobile === true) return true;
  if (/Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(navigator.userAgent)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

function renderMobileServiceNotice() {
  const root = document.getElementById('root');
  if (!root) return;
  root.innerHTML = `
    <main style="min-height:100dvh;display:grid;place-items:center;padding:24px;background:#f5f5f7;color:#1d1d1f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Malgun Gothic',sans-serif">
      <section style="width:min(100%,520px);padding:40px 28px;border:1px solid #d2d2d7;border-radius:18px;background:#fff;box-shadow:0 18px 48px rgba(0,0,0,.08);text-align:center">
        <div style="font-size:44px;line-height:1;margin-bottom:18px" aria-hidden="true">🖥️</div>
        <h1 style="margin:0 0 12px;font-size:24px">모바일 버전 준비 중</h1>
        <p style="margin:0;color:#6e6e73;line-height:1.7">현재 물류 적재 시뮬레이터는 PC 웹 버전만 제공됩니다.<br>데스크톱 또는 노트북에서 이용해 주세요.</p>
        <p><a href="/workspace.html">기업 작업 공간 · 저장된 계획 보기</a></p>
      </section>
    </main>
  `;
}

function renderApplication() {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <RuntimeDiagnosticRecorder />
        <WorkflowIntegrationBridge />
        <ReferenceWorkspaceBar />
        <CompanyServiceHost />
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


        <InspectionStatusPanel />
        <OperationalRightSummary />
        <DashboardCommandDock />
        <TransportEquipmentDashboardSummary />
        <GuidedWorkflowShell />
        <SavedWorkQuickList />
        <EquipmentVisualAdminEditor />
        <GuidedResultTabsEnhancer />
        <DiagnosticExportResultButton />
        <EnterprisePackagingPlannerHost />
        <EnterpriseTransportEquipmentAdapter />
        <ProductPackagingExcelActions />
        <EnterprisePackagingOutputActions />
        <SecuringMaterialSettingsPanel />
        <SafetyInspectionCenter />
        <PhysicsValidationTool />
        <InertiaTestTool />
        <ExcelImportActions />
        <ExcelExportActions />
      </ErrorBoundary>
    </React.StrictMode>,
  );
}

async function bootstrap() {
  const root = document.getElementById('root');
  if (isMobileServiceClient()) {
    renderMobileServiceNotice();
    return;
  }
  try {
    // 모든 영구 데이터는 React가 시작되기 전에 Supabase에서 복원한다.
    // 이후 기존 localStorage API는 디스크가 아니라 메모리 shim을 가리킨다.
    await initializeSupabasePersistence();
    cleanupLegacyUnregisteredBoxes();
    renderApplication();
  } catch (error) {
    console.error('Supabase persistence bootstrap failed', error);
    if (root) {
      root.innerHTML = '<main style="font-family:system-ui;padding:32px;max-width:720px;margin:auto"><h2>데이터 저장소 연결 실패</h2><p>Supabase 데이터 저장소를 준비하지 못해 로컬 저장 방식으로 대체하지 않았습니다. 인터넷 연결을 확인한 뒤 새로고침하세요.</p></main>';
    }
  }
}

void bootstrap();
