import { useEffect } from 'react';
import { ENTERPRISE_PACKAGING_PLANNER_EVENT, readEnterprisePackagingPlannerState } from './enterprisePackagingPlannerStore';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { PRODUCT_SELECTION_EVENT, readProductSelection } from './productWorkflow';
import { STORAGE_UPDATED_EVENT, readStoredState } from './storage';
import { TRANSPORT_EQUIPMENT_EVENT, readTransportEquipment } from './transportEquipment';
import { APP_ACTION_EVENT, type AppActionDetail } from './uiEvents';
import { recordDiagnosticError, recordDiagnosticTrace } from './runtimeDiagnostics';

type LoadingDetail = { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };

export default function RuntimeDiagnosticRecorder() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      recordDiagnosticError({
        type: 'error',
        message: event.message || 'Unknown browser error',
        source: event.filename || undefined,
        line: event.lineno || undefined,
        column: event.colno || undefined,
        stack: event.error instanceof Error ? event.error.stack : undefined,
      });
    };
    const onUnhandled = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      recordDiagnosticError({
        type: 'unhandledrejection',
        message: reason instanceof Error ? reason.message : String(reason ?? 'Unknown promise rejection'),
        stack: reason instanceof Error ? reason.stack : undefined,
      });
    };
    const onAction = (event: Event) => {
      const detail = (event as CustomEvent<AppActionDetail>).detail;
      recordDiagnosticTrace('app-action', { action: detail?.action ?? 'unknown' });
    };
    const onLoading = (event: Event) => {
      const detail = (event as CustomEvent<LoadingDetail>).detail;
      if (!detail) return;
      recordDiagnosticTrace('loading-result', {
        cargoTypes: detail.cargo.length,
        placements: detail.result.placements.length,
        remainingUnits: detail.result.remaining.reduce((sum, item) => sum + item.quantity, 0),
        loadedWeightKg: detail.result.loadedWeightKg,
        container: `${detail.container.length.toFixed(3)}x${detail.container.width.toFixed(3)}x${detail.container.height.toFixed(3)}`,
      });
    };
    const onStorage = () => {
      const state = readStoredState();
      recordDiagnosticTrace('storage-updated', {
        cargoTypes: state?.cargo.length ?? 0,
        equipmentSize: state ? `${state.container.length.toFixed(3)}x${state.container.width.toFixed(3)}x${state.container.height.toFixed(3)}` : 'none',
      });
    };
    const onSelection = () => {
      const selection = readProductSelection();
      recordDiagnosticTrace('product-selection-updated', {
        productTypes: Object.keys(selection).length,
        units: Object.values(selection).reduce((sum, value) => sum + value, 0),
      });
    };
    const onPlanner = () => {
      const planner = readEnterprisePackagingPlannerState();
      recordDiagnosticTrace('product-master-updated', {
        products: planner?.products.length ?? 0,
        boxes: planner?.boxes.length ?? 0,
      });
    };
    const onEquipment = () => {
      const equipment = readTransportEquipment();
      recordDiagnosticTrace('equipment-updated', {
        equipmentId: equipment.id,
        geometry: equipment.geometry,
        size: `${equipment.length.toFixed(3)}x${equipment.width.toFixed(3)}x${equipment.height.toFixed(3)}`,
      });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandled);
    window.addEventListener(APP_ACTION_EVENT, onAction);
    window.addEventListener(LOADING_RESULT_EVENT, onLoading);
    window.addEventListener(STORAGE_UPDATED_EVENT, onStorage);
    window.addEventListener(PRODUCT_SELECTION_EVENT, onSelection);
    window.addEventListener(ENTERPRISE_PACKAGING_PLANNER_EVENT, onPlanner);
    window.addEventListener(TRANSPORT_EQUIPMENT_EVENT, onEquipment);
    recordDiagnosticTrace('runtime-recorder-ready');

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandled);
      window.removeEventListener(APP_ACTION_EVENT, onAction);
      window.removeEventListener(LOADING_RESULT_EVENT, onLoading);
      window.removeEventListener(STORAGE_UPDATED_EVENT, onStorage);
      window.removeEventListener(PRODUCT_SELECTION_EVENT, onSelection);
      window.removeEventListener(ENTERPRISE_PACKAGING_PLANNER_EVENT, onPlanner);
      window.removeEventListener(TRANSPORT_EQUIPMENT_EVENT, onEquipment);
    };
  }, []);

  return null;
}
