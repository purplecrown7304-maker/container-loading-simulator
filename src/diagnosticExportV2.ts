import { buildBlackboxSnapshots } from './diagnosticBlackbox';
import type { CargoItem, ContainerSpec, LoadingResult, Placement } from './engine/types';
import type { PalletWorkSnapshot } from './palletWorkerReportV2';
import { readPhysicsTarget } from './physicsTarget';
import { readTransportEquipment } from './transportEquipment';

const APP_VERSION = '2.7.0-diagnostics';

type LatestDetail = { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
type DiagnosticWindow = Window & {
  __containerLoadingLatestResult?: LatestDetail;
  __containerLoadingPalletSnapshot?: PalletWorkSnapshot;
};
type ZipInput = { name: string; data: Uint8Array; modifiedAt?: Date };

function textBytes(text: string) {
  return new TextEncoder().encode(text);
}

function decycle(value: unknown, ancestors = new WeakSet<object>()): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (!value || typeof value !== 'object') return value;
  if (ancestors.has(value)) return '[Circular]';
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.map(item => decycle(item, ancestors));
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) out[key] = decycle(item, ancestors);
    return out;
  } finally {
    ancestors.delete(value);
  }
}

function safeJson(value: unknown) {
  return JSON.stringify(decycle(value), null, 2);
}

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return '\uFEFF';
  const headers = [...new Set(rows.flatMap(row => Object.keys(row)))];
  return `\uFEFF${[
    headers.map(csvCell).join(','),
    ...rows.map(row => headers.map(header => csvCell(row[header])).join(',')),
  ].join('\r\n')}`;
}

function cargoRows(cargo: CargoItem[], result: LoadingResult) {
  const loaded = new Map<string, number>();
  result.placements.forEach(item => loaded.set(item.cargoId, (loaded.get(item.cargoId) ?? 0) + 1));
  const remaining = new Map<string, number>();
  result.remaining.forEach(item => remaining.set(item.cargoId, (remaining.get(item.cargoId) ?? 0) + item.quantity));
  return cargo.map(item => ({
    cargoId: item.id,
    productId: item.productId ?? '',
    productName: item.productName ?? '',
    name: item.name,
    requestedQuantity: item.quantity,
    loadedQuantity: loaded.get(item.id) ?? 0,
    remainingQuantity: remaining.get(item.id) ?? Math.max(0, item.quantity - (loaded.get(item.id) ?? 0)),
    unitsPerPackage: item.unitsPerPackage ?? '',
    contentWeightKg: item.contentWeightKg ?? '',
    lengthMm: Math.round(item.length * 1000),
    widthMm: Math.round(item.width * 1000),
    heightMm: Math.round(item.height * 1000),
    weightKg: item.weightKg,
    maxStackLayers: item.maxStackLayers ?? '',
    maxTopLoadKg: item.maxTopLoadKg ?? '',
    allowRotation: item.allowRotation !== false ? 'Y' : 'N',
  }));
}

function placementRows(result: LoadingResult, cargo: CargoItem[]) {
  const map = new Map(cargo.map(item => [item.id, item]));
  return result.placements.map((item: Placement, index) => {
    const spec = map.get(item.cargoId);
    return {
      no: index + 1,
      cargoId: item.cargoId,
      productId: spec?.productId ?? '',
      productName: spec?.productName ?? '',
      unitsPerPackage: spec?.unitsPerPackage ?? '',
      xM: item.x,
      yM: item.y,
      zM: item.z,
      lengthM: item.length,
      widthM: item.width,
      heightM: item.height,
      weightKg: item.weightKg,
      rotated: item.rotated ? 'Y' : 'N',
    };
  });
}

function floorRows(floor: { cells: Array<{ row: number; column: number; x: number; y: number; length: number; width: number; loadKg: number; kgPerM2: number }> }) {
  return floor.cells.map(cell => ({
    row: cell.row,
    column: cell.column,
    xM: cell.x,
    yM: cell.y,
    lengthM: cell.length,
    widthM: cell.width,
    loadKg: cell.loadKg,
    kgPerM2: cell.kgPerM2,
  }));
}

function stackRows(stack: { placements: Array<Record<string, unknown>> }) {
  return stack.placements.map(item => ({ ...item, supporters: JSON.stringify(item.supporters ?? []) }));
}

function palletRows(snapshot: PalletWorkSnapshot | undefined) {
  if (!snapshot) return [];
  return snapshot.result.pallets.map(pallet => ({
    palletIndex: pallet.palletIndex,
    stackColumn: pallet.stackColumn,
    stackLevel: pallet.stackLevel,
    xM: pallet.x,
    yM: pallet.y,
    zM: pallet.z,
    lengthM: pallet.length,
    widthM: pallet.width,
    heightM: pallet.height,
    totalWeightKg: pallet.totalWeightKg,
    cargoCount: pallet.cargoPlacements.length,
    cargoIds: pallet.cargoPlacements.map(item => item.cargoId).join(' | '),
  }));
}

function nextFrame() {
  return new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

async function captureCanvasPng(selector: string) {
  const canvas = document.querySelector<HTMLCanvasElement>(selector);
  if (!canvas || canvas.width <= 0 || canvas.height <= 0) return undefined;
  try {
    await nextFrame();
    await nextFrame();
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob || blob.size < 100) return undefined;
    return new Uint8Array(await blob.arrayBuffer());
  } catch {
    return undefined;
  }
}

function dosTime(date: Date) {
  return ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | (Math.floor(date.getSeconds() / 2) & 0x1f);
}
function dosDate(date: Date) {
  const year = Math.max(1980, date.getFullYear());
  return (((year - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f);
}
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function concatBytes(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}
function localHeader(name: Uint8Array, data: Uint8Array, date: Date, crc: number) {
  const header = new Uint8Array(30); const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x0800, true); view.setUint16(8, 0, true);
  view.setUint16(10, dosTime(date), true); view.setUint16(12, dosDate(date), true); view.setUint32(14, crc, true);
  view.setUint32(18, data.length, true); view.setUint32(22, data.length, true); view.setUint16(26, name.length, true); view.setUint16(28, 0, true);
  return header;
}
function centralHeader(name: Uint8Array, data: Uint8Array, date: Date, crc: number, localOffset: number) {
  const header = new Uint8Array(46); const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true); view.setUint16(4, 20, true); view.setUint16(6, 20, true); view.setUint16(8, 0x0800, true); view.setUint16(10, 0, true);
  view.setUint16(12, dosTime(date), true); view.setUint16(14, dosDate(date), true); view.setUint32(16, crc, true); view.setUint32(20, data.length, true); view.setUint32(24, data.length, true);
  view.setUint16(28, name.length, true); view.setUint16(30, 0, true); view.setUint16(32, 0, true); view.setUint16(34, 0, true); view.setUint16(36, 0, true); view.setUint32(38, 0, true); view.setUint32(42, localOffset, true);
  return header;
}
function makeZip(entries: ZipInput[]) {
  const locals: Uint8Array[] = []; const centrals: Uint8Array[] = []; let localOffset = 0; const now = new Date();
  for (const entry of entries) {
    const name = textBytes(entry.name); const date = entry.modifiedAt ?? now; const crc = crc32(entry.data);
    const local = concatBytes([localHeader(name, entry.data, date, crc), name, entry.data]);
    locals.push(local); centrals.push(concatBytes([centralHeader(name, entry.data, date, crc, localOffset), name])); localOffset += local.length;
  }
  const central = concatBytes(centrals); const end = new Uint8Array(22); const view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true); view.setUint16(8, entries.length, true); view.setUint16(10, entries.length, true); view.setUint32(12, central.length, true); view.setUint32(16, localOffset, true);
  return concatBytes([...locals, central, end]);
}

async function sha256(data: Uint8Array) {
  if (!crypto?.subtle) return null;
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function timestampName(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function downloadBytes(data: Uint8Array, filename: string) {
  const blob = new Blob([data], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function inspectionStages() {
  return [...document.querySelectorAll<HTMLElement>('.inspection-status-table tbody tr')].map((row, index) => {
    const cells = [...row.querySelectorAll<HTMLElement>('td')];
    return {
      step: Number(cells[0]?.textContent?.trim()) || index + 1,
      label: cells[1]?.querySelector('b')?.textContent?.trim() ?? cells[1]?.textContent?.trim() ?? '',
      note: cells[1]?.querySelector('small')?.textContent?.trim() ?? '',
      status: cells[2]?.textContent?.trim() ?? '',
    };
  });
}

export async function exportLoadingDiagnosticsV2(): Promise<{ ok: boolean; message: string; filename?: string; severity?: string }> {
  if (typeof window === 'undefined') return { ok: false, message: '브라우저에서만 점검 파일을 만들 수 있습니다.' };
  const diagnosticWindow = window as DiagnosticWindow;
  const target = readPhysicsTarget();
  const latest = diagnosticWindow.__containerLoadingLatestResult;
  const palletSnapshot = diagnosticWindow.__containerLoadingPalletSnapshot;
  const result = target?.result ?? latest?.result;
  const container = target?.container ?? latest?.container;
  const cargo = target?.cargo ?? latest?.cargo ?? [];
  if (!container || !result) return { ok: false, message: '점검할 최종 적재 결과가 없습니다. 자동 적재를 먼저 진행하세요.' };

  const generatedAt = new Date();
  const equipment = readTransportEquipment();
  const snapshots = buildBlackboxSnapshots(container, cargo, result);
  const mode = target?.mode ?? 'boxes';
  const appResultSnapshot = latest ? decycle({ container: latest.container, cargo: latest.cargo, result: latest.result }) : null;

  const inspection = {
    schema: 'container-loading-diagnostics-v2',
    generatedAt: generatedAt.toISOString(),
    mode,
    selectedEquipment: equipment,
    currentTarget: target ? decycle(target) : null,
    finalResult: decycle(result),
    currentAppResult: appResultSnapshot,
    inspectionStages: inspectionStages(),
    consistency: snapshots.consistency,
  };
  const system = {
    schema: 'container-loading-system-v2',
    generatedAt: generatedAt.toISOString(),
    appVersion: APP_VERSION,
    build: {
      mode: import.meta.env.MODE,
      gitCommit: import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA ?? import.meta.env.VITE_GIT_COMMIT ?? null,
    },
    browser: {
      userAgent: navigator.userAgent,
      language: navigator.language,
      viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio },
      url: window.location.href,
    },
  };

  const entries: ZipInput[] = [
    { name: 'inspection.json', data: textBytes(safeJson(inspection)), modifiedAt: generatedAt },
    { name: 'system.json', data: textBytes(safeJson(system)), modifiedAt: generatedAt },
    { name: 'equipment.json', data: textBytes(safeJson(snapshots.equipment)), modifiedAt: generatedAt },
    { name: 'products.json', data: textBytes(safeJson(snapshots.products)), modifiedAt: generatedAt },
    { name: 'packaging.json', data: textBytes(safeJson(snapshots.packaging)), modifiedAt: generatedAt },
    { name: 'loading-input.json', data: textBytes(safeJson(snapshots.loadingInput)), modifiedAt: generatedAt },
    { name: 'placements.json', data: textBytes(safeJson(snapshots.placements)), modifiedAt: generatedAt },
    { name: 'constraint-checks.json', data: textBytes(safeJson(snapshots.constraints)), modifiedAt: generatedAt },
    { name: 'weight-balance.json', data: textBytes(safeJson(snapshots.weightBalance)), modifiedAt: generatedAt },
    { name: 'floor-load.json', data: textBytes(safeJson(snapshots.floorLoad)), modifiedAt: generatedAt },
    { name: 'stack-analysis.json', data: textBytes(safeJson(snapshots.stackAnalysis)), modifiedAt: generatedAt },
    { name: 'physics-validation.json', data: textBytes(safeJson(snapshots.physics)), modifiedAt: generatedAt },
    { name: 'inertia-validation.json', data: textBytes(safeJson(snapshots.inertia)), modifiedAt: generatedAt },
    { name: 'workflow-trace.json', data: textBytes(safeJson(snapshots.workflowTrace)), modifiedAt: generatedAt },
    { name: 'consistency-report.json', data: textBytes(safeJson(snapshots.consistency)), modifiedAt: generatedAt },
    { name: 'runtime.json', data: textBytes(safeJson(snapshots.runtime)), modifiedAt: generatedAt },
    { name: 'cargo.csv', data: textBytes(toCsv(cargoRows(cargo, result))), modifiedAt: generatedAt },
    { name: 'placements.csv', data: textBytes(toCsv(placementRows(result, cargo))), modifiedAt: generatedAt },
    { name: 'floor-load.csv', data: textBytes(toCsv(floorRows(snapshots.floorLoad))), modifiedAt: generatedAt },
    { name: 'stack-analysis.csv', data: textBytes(toCsv(stackRows(snapshots.stackAnalysis))), modifiedAt: generatedAt },
  ];
  if (palletSnapshot) entries.push({ name: 'pallets.csv', data: textBytes(toCsv(palletRows(palletSnapshot))), modifiedAt: generatedAt });

  const packagingPreview = await captureCanvasPng('.product-packaging-canvas canvas');
  if (packagingPreview) entries.push({ name: 'preview-packaging.png', data: packagingPreview, modifiedAt: generatedAt });
  const loadingPreview = await captureCanvasPng('.reference-3d canvas, .viewer-host canvas, .pallet-viewer canvas, canvas');
  if (loadingPreview) entries.push({ name: 'preview-loading.png', data: loadingPreview, modifiedAt: generatedAt });
  const topPreview = await captureCanvasPng('.minimap canvas, .pallet-minimap canvas');
  if (topPreview) entries.push({ name: 'preview-top.png', data: topPreview, modifiedAt: generatedAt });

  const fileHashes = await Promise.all(entries.map(async entry => ({ name: entry.name, bytes: entry.data.length, sha256: await sha256(entry.data) })));
  const manifest = {
    schema: 'container-loading-blackbox-manifest-v2',
    generatedAt: generatedAt.toISOString(),
    appVersion: APP_VERSION,
    gitCommit: system.build.gitCommit,
    mode,
    equipmentId: equipment.id,
    consistencySeverity: snapshots.consistency.severity,
    files: fileHashes,
  };
  entries.unshift({ name: 'manifest.json', data: textBytes(safeJson(manifest)), modifiedAt: generatedAt });

  const readme = [
    'Container Loading Simulator 블랙박스 점검 파일 v2',
    '',
    `생성 시각: ${generatedAt.toLocaleString()}`,
    `적재공간: ${equipment.shortName} (${equipment.geometry})`,
    `일관성 판정: ${snapshots.consistency.severity}`,
    `CRITICAL ${snapshots.consistency.counts.critical} / WARNING ${snapshots.consistency.counts.warning} / OK ${snapshots.consistency.counts.ok}`,
    '',
    '핵심 파일',
    '- manifest.json: 버전/커밋/파일 SHA-256',
    '- consistency-report.json: 적재공간↔엔진, 포장↔자동적재, 수량, 중량, 물리검증 signature 교차검사',
    '- equipment.json: 선택 적재공간과 실제 엔진 ContainerSpec',
    '- products.json: 회원/관리자 데이터 영역과 선택 제품',
    '- packaging.json: 제품 포장 확정 스냅샷 및 등록 박스',
    '- loading-input.json: 자동 적재 엔진에 실제 전달된 CargoItem[]',
    '- placements.json/csv: 최종 개별 배치',
    '- stack-analysis.json/csv: 지지율, 지지 박스, 상부하중',
    '- weight-balance.json / floor-load.json,csv / constraint-checks.json',
    '- physics-validation.json / inertia-validation.json: 현재 배치 signature 일치 및 STALE 여부',
    '- workflow-trace.json / runtime.json: 작업 이벤트와 브라우저 오류/성능 기록',
    '',
    snapshots.consistency.severity === 'CRITICAL' ? 'CRITICAL: 데이터 일관성 오류가 있으므로 이 결과를 실제 작업 지시 기준으로 사용하기 전에 원인을 수정하세요.' : '',
  ].filter(Boolean).join('\r\n');
  entries.push({ name: 'README.txt', data: textBytes(readme), modifiedAt: generatedAt });

  const filename = `loading-system-check-${timestampName(generatedAt)}.zip`;
  downloadBytes(makeZip(entries), filename);
  return { ok: true, message: `점검 파일을 만들었습니다. 일관성 ${snapshots.consistency.severity}`, filename, severity: snapshots.consistency.severity };
}
