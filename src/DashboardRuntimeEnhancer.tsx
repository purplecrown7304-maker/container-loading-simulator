import { useEffect } from 'react';
import { analyzeConstraints } from './engine/constraintAnalysis';
import { analyzeFloorLoad } from './engine/floorLoad';
import { LOADING_RESULT_EVENT } from './engine/loadingEngine';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';

type DashboardDetail = { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
type DashboardWindow = Window & { __containerLoadingLatestResult?: DashboardDetail };

function renderFloorLoad(detail: DashboardDetail) {
  const heatmap = document.querySelector<HTMLElement>('.heatmap');
  const legend = document.querySelector<HTMLElement>('.heat-legend');
  if (!heatmap) return;
  const analysis = analyzeFloorLoad(detail.container, detail.result, 12, 4);
  const fragment = document.createDocumentFragment();
  for (const cell of analysis.cells) {
    const node = document.createElement('i');
    const ratio = analysis.maxKgPerM2 > 0 ? cell.kgPerM2 / analysis.maxKgPerM2 : 0;
    node.dataset.level = ratio >= .72 ? 'high' : ratio >= .36 ? 'mid' : 'low';
    node.title = `${cell.column + 1}열 ${cell.row + 1}행 · ${cell.kgPerM2.toFixed(0)} kg/m²`;
    node.setAttribute('aria-label', node.title);
    fragment.appendChild(node);
  }
  heatmap.replaceChildren(fragment);
  heatmap.style.gridTemplateColumns = `repeat(${analysis.columns},1fr)`;
  heatmap.dataset.maxLoad = analysis.maxKgPerM2.toFixed(0);
  if (legend) legend.textContent = `평균 ${analysis.averageKgPerM2.toFixed(0)} kg/m² · 최대 ${analysis.maxKgPerM2.toFixed(0)} kg/m²`;
}

function renderConstraints(detail: DashboardDetail) {
  const list = document.querySelector<HTMLElement>('.constraint-list');
  const badge = document.querySelector<HTMLElement>('.constraint-ok');
  if (!list) return;
  const floor = analyzeFloorLoad(detail.container, detail.result, 12, 4);
  const checks = analyzeConstraints(detail.container, detail.cargo, detail.result, floor);
  const fragment = document.createDocumentFragment();
  for (const check of checks) {
    const row = document.createElement('span');
    row.className = check.status === 'pass' ? 'constraint-pass' : check.status === 'warn' ? 'constraint-warn' : 'constraint-fail';
    const label = document.createElement('span');
    label.textContent = check.label;
    const value = document.createElement('b');
    value.textContent = check.status === 'pass' ? '통과' : check.status === 'warn' ? '확인' : '실패';
    value.title = check.detail;
    row.append(label, value);
    row.title = check.detail;
    fragment.appendChild(row);
  }
  list.replaceChildren(fragment);
  const hasFail = checks.some(check => check.status === 'fail');
  const hasWarn = checks.some(check => check.status === 'warn');
  if (badge) {
    badge.textContent = hasFail ? '제약 조건 실패 항목 있음' : hasWarn ? '현장 확인 항목 있음' : '제약 조건 모두 만족';
    badge.classList.toggle('warning', hasWarn || hasFail);
    badge.classList.toggle('failure', hasFail);
  }
}

function renderDashboard(detail: DashboardDetail) {
  renderFloorLoad(detail);
  renderConstraints(detail);
}

/**
 * Keeps legacy calculated dashboard fragments in sync with engine results.
 * Navigation and view switching intentionally live in React (App.tsx); this
 * bridge must never find buttons by text or attach shadow click handlers.
 */
export default function DashboardRuntimeEnhancer() {
  useEffect(() => {
    const initial = (window as DashboardWindow).__containerLoadingLatestResult;
    if (initial) renderDashboard(initial);
    const onResult = (event: Event) => {
      const detail = (event as CustomEvent<DashboardDetail>).detail;
      if (detail) renderDashboard(detail);
    };
    window.addEventListener(LOADING_RESULT_EVENT, onResult);
    return () => window.removeEventListener(LOADING_RESULT_EVENT, onResult);
  }, []);
  return null;
}
