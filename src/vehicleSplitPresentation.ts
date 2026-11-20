import type { CargoItem } from './engine/types';
import { uiText } from './uiLanguage';
import { vehicleSplitContext } from './vehicleSplitState';

/**
 * How a divided job (AGENTS.md 2L) is named on documents. A work order, a workbook or a check
 * file of one vehicle must say that it is one vehicle of several, so that half a shipment is
 * never read as the whole of it.
 */
export type VehicleSplitDocumentNote = {
  /** "차량 1/2" */
  label: string;
  vehicle: number;
  vehicleCount: number;
  /** Cartons and weight of every vehicle of the job, the document's own vehicle included. */
  vehicles: Array<{ vehicle: number; units: number; weightKg: number; current: boolean }>;
  totalUnits: number;
};

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/** The note for a document about `cargo`, or null when that cargo is not the open vehicle of a divided job. */
export function vehicleSplitDocumentNote(cargo: readonly CargoItem[]): VehicleSplitDocumentNote | null {
  const context = vehicleSplitContext(cargo);
  if (!context) return null;
  const { split, summaries } = context;
  return {
    label: uiText('차량 {0}/{1}', [split.active + 1, split.vehicleCount]),
    vehicle: split.active + 1,
    vehicleCount: split.vehicleCount,
    vehicles: summaries.map(item => ({ vehicle: item.index + 1, units: item.units, weightKg: item.weightKg, current: item.index === split.active })),
    totalUnits: summaries.reduce((sum, item) => sum + item.units, 0),
  };
}

export const VEHICLE_SPLIT_SHIPMENT_NOTE = '차량별로 나눈 화물입니다. 이 표는 이 차량에 싣는 수량입니다. 제품 전체 출하수량은 모든 차량의 문서를 합쳐 대조하세요.';

/** Banner for the top of a printable report. */
export function vehicleSplitReportHtml(note: VehicleSplitDocumentNote): string {
  const rows = note.vehicles.map(item => `<span${item.current ? ' class="current"' : ''}>${escapeHtml(uiText('차량 {0}', [item.vehicle]))} · ${item.units.toLocaleString()} EA · ${Math.round(item.weightKg).toLocaleString()} kg${item.current ? ` · ${escapeHtml(uiText('이 문서'))}` : ''}</span>`).join('');
  return `<aside class="shipment-fallback vehicle-split-note" data-vehicle-split="${note.vehicle}/${note.vehicleCount}" role="note"><b>${escapeHtml(uiText('{0} · 나눠 싣는 화물', [note.label]))}</b><p>${escapeHtml(uiText('전체 {0} EA를 차량 {1}대에 고르게 나눈 화물입니다. 이 문서는 차량 {2}의 화물만 다룹니다. 다른 차량은 그 차량의 문서로 작업하세요.', [note.totalUnits.toLocaleString(), note.vehicleCount, note.vehicle]))}</p><p class="vehicle-split-note-list">${rows}</p></aside>`;
}

/** The banner for a report about `cargo`, or nothing when that cargo is not one vehicle of a divided job. */
export function vehicleSplitBanner(cargo: readonly CargoItem[]): string {
  const note = vehicleSplitDocumentNote(cargo);
  return note ? vehicleSplitReportHtml(note) : '';
}

/** Rows for the summary sheet of a workbook. */
export function vehicleSplitSummaryRows(note: VehicleSplitDocumentNote): Array<[string, string | number]> {
  return [
    [uiText('차량 구분'), uiText('{0} · 나눠 싣는 화물', [note.label])],
    [uiText('전체 출하 수량(EA, 모든 차량)'), note.totalUnits],
    ...note.vehicles.map((item): [string, string] => [
      uiText('차량 {0}', [item.vehicle]),
      `${item.units} EA · ${Math.round(item.weightKg)} kg${item.current ? ` · ${uiText('이 문서')}` : ''}`,
    ]),
  ];
}
