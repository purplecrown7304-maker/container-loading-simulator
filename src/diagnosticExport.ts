import { analyzeConstraints } from './engine/constraintAnalysis';
import { analyzeFloorLoad } from './engine/floorLoad';
import type { CargoItem, ContainerSpec, LoadingResult, Placement } from './engine/types';
import { assessWeightBalance } from './engine/weightBalance';
import { readLatestInertiaCertification } from './inertiaCertification';
import type { PalletWorkSnapshot } from './palletWorkerReportV2';
import { readPhysicsTarget } from './physicsTarget';
import { readTransportEquipment } from './transportEquipment';

const APP_VERSION = '2.6.0';

type LatestDetail = { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
type DiagnosticWindow = Window & {
  __containerLoadingLatestResult?: LatestDetail;
  __containerLoadingPalletSnapshot?: PalletWorkSnapshot;
  __containerLoadingLatestPhysics?: unknown;
};

type ZipInput = { name: string; data: Uint8Array; modifiedAt?: Date };

function textBytes(text: string) {
  return new TextEncoder().encode(text);
}

function safeJson(value: unknown) {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, current) => {
    if (typeof current === 'bigint') return current.toString();
    if (current && typeof current === 'object') {
      if (seen.has(current)) return '[Circular]';
      seen.add(current);
    }
    return current;
  }, 2);
}

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return '\uFEFF';
  const headers = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const lines = [headers.map(csvCell).join(',')];
  rows.forEach(row => lines.push(headers.map(header => csvCell(row[header])).join(',')));
  return `\uFEFF${lines.join('\r\n')}`;
}

function countLoaded(result: LoadingResult | undefined) {
  const counts = new Map<string, number>();
  result?.placements.forEach(item => counts.set(item.cargoId, (counts.get(item.cargoId) ?? 0) + 1));
  return counts;
}

function countRemaining(result: LoadingResult | undefined) {
  const counts = new Map<string, number>();
  result?.remaining.forEach(item => counts.set(item.cargoId, (counts.get(item.cargoId) ?? 0) + item.quantity));
  return counts;
}

function cargoRows(cargo: CargoItem[], result: LoadingResult | undefined) {
  const loaded = countLoaded(result);
  const remaining = countRemaining(result);
  return cargo.map(item => ({
    cargoId: item.id,
    name: item.name,
    requestedQuantity: item.quantity,
    loadedQuantity: loaded.get(item.id) ?? 0,
    remainingQuantity: remaining.get(item.id) ?? Math.max(0, item.quantity - (loaded.get(item.id) ?? 0)),
    lengthMm: Math.round(item.length * 1000),
    widthMm: Math.round(item.width * 1000),
    heightMm: Math.round(item.height * 1000),
    weightKg: item.weightKg,
    maxStackLayers: item.maxStackLayers ?? '',
    maxTopLoadKg: item.maxTopLoadKg ?? '',
    allowRotation: item.allowRotation !== false ? 'Y' : 'N',
    unloadPriority: item.unloadPriority ?? '',
  }));
}

function placementRows(result: LoadingResult | undefined) {
  return (result?.placements ?? []).map((item: Placement, index) => ({
    no: index + 1,
    cargoId: item.cargoId,
    xM: item.x,
    yM: item.y,
    zM: item.z,
    lengthM: item.length,
    widthM: item.width,
    heightM: item.height,
    weightKg: item.weightKg,
    rotated: item.rotated ? 'Y' : 'N',
  }));
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

function readInspectionStages() {
  return [...document.querySelectorAll<HTMLElement>('.inspection-status-table tbody tr')].map((row, index) => {
    const cells = [...row.querySelectorAll<HTMLElement>('td')];
    return {
      step: Number(cells[0]?.textContent?.trim()) || index + 1,
      label: cells[1]?.querySelector('b')?.textContent?.trim() ?? cells[1]?.textContent?.trim() ?? '',
      note: cells[1]?.querySelector('small')?.textContent?.trim() ?? '',
      status: cells[2]?.textContent?.trim() ?? '',
      className: row.className,
    };
  });
}

function equipmentConsistency(container: ContainerSpec) {
  const equipment = readTransportEquipment();
  const mismatches: Array<{ field: string; selected: number; engine: number }> = [];
  const compare = (field: string, selected: number, engine: number, tolerance: number) => {
    if (Math.abs(selected - engine) > tolerance) mismatches.push({ field, selected, engine });
  };
  compare('length', equipment.length, container.length, 0.001);
  compare('width', equipment.width, container.width, 0.001);
  compare('height', equipment.height, container.height, 0.001);
  compare('maxPayloadKg', equipment.maxPayloadKg, container.maxPayloadKg, 1);
  compare('floorLoadLimitKgPerM2', equipment.floorLoadLimitKgPerM2, container.floorLoadLimitKgPerM2 ?? equipment.floorLoadLimitKgPerM2, 1);
  return {
    severity: mismatches.length ? 'CRITICAL' : 'OK',
    selectedEquipmentId: equipment.id,
    selectedEquipmentName: equipment.shortName,
    mismatches,
  };
}

function nextFrame() {
  return new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

async function captureViewerPng() {
  const canvas = document.querySelector<HTMLCanvasElement>(
    '.reference-3d canvas, .pallet-preview canvas, .viewer-host canvas, .pallet-viewer canvas, canvas',
  );
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
  return ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((Math.floor(date.getSeconds() / 2)) & 0x1f);
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
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  parts.forEach(part => { out.set(part, offset); offset += part.length; });
  return out;
}

function localHeader(name: Uint8Array, data: Uint8Array, date: Date, crc: number) {
  const header = new Uint8Array(30);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, dosTime(date), true);
  view.setUint16(12, dosDate(date), true);
  view.setUint32(14, crc, true);
  view.setUint32(18, data.length, true);
  view.setUint32(22, data.length, true);
  view.setUint16(26, name.length, true);
  view.setUint16(28, 0, true);
  return header;
}

function centralHeader(name: Uint8Array, data: Uint8Array, date: Date, crc: number, localOffset: number) {
  const header = new Uint8Array(46);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0800, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, dosTime(date), true);
  view.setUint16(14, dosDate(date), true);
  view.setUint32(16, crc, true);
  view.setUint32(20, data.length, true);
  view.setUint32(24, data.length, true);
  view.setUint16(28, name.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, localOffset, true);
  return header;
}

function makeZip(entries: ZipInput[]) {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let localOffset = 0;
  const now = new Date();

  entries.forEach(entry => {
    const name = textBytes(entry.name);
    const date = entry.modifiedAt ?? now;
    const crc = crc32(entry.data);
    const local = concatBytes([localHeader(name, entry.data, date, crc), name, entry.data]);
    locals.push(local);
    centrals.push(concatBytes([centralHeader(name, entry.data, date, crc, localOffset), name]));
    localOffset += local.length;
  });

  const central = concatBytes(centrals);
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, entries.length, true);
  view.setUint16(10, entries.length, true);
  view.setUint32(12, central.length, true);
  view.setUint32(16, localOffset, true);
  view.setUint16(20, 0, true);
  return concatBytes([...locals, central, end]);
}

function timestampName(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function downloadBytes(data: Uint8Array, filename: string) {
  const blob = new Blob([data], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function exportLoadingDiagnostics(): Promise<{ ok: boolean; message: string; filename?: string }> {
  if (typeof window === 'undefined') return { ok: false, message: '브라우저에서만 점검 파일을 만들 수 있습니다.' };

  const diagnosticWindow = window as DiagnosticWindow;
  const target = readPhysicsTarget();
  const latest = diagnosticWindow.__containerLoadingLatestResult;
  const palletSnapshot = diagnosticWindow.__containerLoadingPalletSnapshot;
  const result = target?.result ?? latest?.result;
  const container = target?.container ?? latest?.container;
  const cargo = target?.cargo ?? latest?.cargo ?? [];

  if (!container || (!result && !palletSnapshot)) {
    return { ok: false, message: '점검할 적재 결과가 없습니다. 최종 적재를 먼저 진행하세요.' };
  }

  const generatedAt = new Date();
  const mode = target?.mode ?? (palletSnapshot ? 'pallets' : 'boxes');
  const floorLoad = result ? analyzeFloorLoad(container, result, 12, 4) : undefined;
  const balance = result ? assessWeightBalance(container, result) : undefined;
  const constraints = result && floorLoad ? analyzeConstraints(container, cargo, result, floorLoad) : [];
  const certification = readLatestInertiaCertification();
  const inspectionStages = readInspectionStages();
  const equipment = readTransportEquipment();
  const equipmentAudit = equipmentConsistency(container);
  const appResult = latest?.result;

  const inspection = {
    schema: 'container-loading-diagnostics-v1',
    generatedAt: generatedAt.toISOString(),
    mode,
    equipment,
    equipmentConsistency: equipmentAudit,
    input: { container, cargo },
    finalResult: result ?? null,
    currentAppResult: appResult ?? null,
    palletSnapshot: palletSnapshot ?? null,
    analyses: {
      centerOfGravity: balance ?? null,
      floorLoad: floorLoad ?? null,
      constraints,
      inspectionStages,
    },
    physics: {
      target: target ?? null,
      validationResult: diagnosticWindow.__containerLoadingLatestPhysics ?? null,
      inertiaCertification: certification ?? null,
    },
  };

  const system = {
    schema: 'container-loading-system-v1',
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
    selectedEquipment: equipment,
    equipmentConsistency: equipmentAudit,
    workflow: {
      mode,
      inspectionStages,
      hasPhysicsTarget: Boolean(target),
      hasPhysicsValidation: Boolean(diagnosticWindow.__containerLoadingLatestPhysics),
      hasInertiaCertification: Boolean(certification),
      certificationStatus: certification?.status ?? null,
    },
  };

  const entries: ZipInput[] = [
    { name: 'inspection.json', data: textBytes(safeJson(inspection)), modifiedAt: generatedAt },
    { name: 'system.json', data: textBytes(safeJson(system)), modifiedAt: generatedAt },
    { name: 'cargo.csv', data: textBytes(toCsv(cargoRows(cargo, result))), modifiedAt: generatedAt },
    { name: 'placements.csv', data: textBytes(toCsv(placementRows(result))), modifiedAt: generatedAt },
  ];

  if (palletSnapshot) entries.push({ name: 'pallets.csv', data: textBytes(toCsv(palletRows(palletSnapshot))), modifiedAt: generatedAt });

  const preview = await captureViewerPng();
  if (preview) entries.push({ name: 'preview.png', data: preview, modifiedAt: generatedAt });

  const readme = [
    'Container Loading Simulator 점검 파일',
    '',
    `생성 시각: ${generatedAt.toLocaleString()}`,
    `모드: ${mode === 'pallets' ? '팔레트' : '박스 직접 적재'}`,
    `장비: ${equipment.shortName}`,
    `장비/엔진 제원 일치: ${equipmentAudit.severity}${equipmentAudit.mismatches.length ? ` (${equipmentAudit.mismatches.map(item => item.field).join(', ')})` : ''}`,
    '',
    '파일 구성',
    '- inspection.json: 입력값, 최종 배치, 미적재 사유, 무게중심, 바닥하중, 제약조건, 물리/관성 결과',
    '- system.json: 앱/브라우저/작업흐름 상태 및 선택 장비-엔진 제원 일치 검사',
    '- cargo.csv: 품목별 요청/적재/미적재 수량과 규격',
    '- placements.csv: 최종 개별 화물 배치 좌표',
    palletSnapshot ? '- pallets.csv: 팔레트별 위치, 적층단, 중량, 포함 화물' : '',
    preview ? '- preview.png: 생성 시점의 3D 캔버스 화면' : '- preview.png: 현재 브라우저에서 3D 캔버스 캡처를 만들지 못해 포함되지 않음',
    '',
    equipmentAudit.severity === 'CRITICAL' ? 'CRITICAL: 선택 장비 제원과 실제 계산 ContainerSpec이 다릅니다. 이 결과는 적재 판단에 사용하지 마세요.' : '',
    '이 ZIP 파일을 ChatGPT 대화에 업로드하고 적재 시스템 점검을 요청하면 됩니다.',
    '점검 권장 항목: 적재 형상, 공간 활용, 적층 안전, 무게중심, 바닥하중, 미적재 원인, 물리/관성 검증, 알고리즘 이상 징후.',
  ].filter(Boolean).join('\r\n');
  entries.push({ name: 'README.txt', data: textBytes(readme), modifiedAt: generatedAt });

  const filename = `loading-system-check-${timestampName(generatedAt)}.zip`;
  downloadBytes(makeZip(entries), filename);
  return { ok: true, message: '점검 파일을 만들었습니다.', filename };
}
