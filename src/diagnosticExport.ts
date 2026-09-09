import { analyzeConstraints } from './engine/constraintAnalysis';
import { analyzeFloorLoad, analyzeFloorLoadFootprints, type FloorLoadFootprint } from './engine/floorLoad';
import type { CargoItem, ContainerSpec, LoadingResult, Placement } from './engine/types';
import { assessWeightBalance, type BalanceMassBody } from './engine/weightBalance';
import { createPhysicsTargetSignature, readLatestInertiaCertification } from './inertiaCertification';
import { normalizedInertiaCounts } from './inertiaScenarioStatus';
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
    cargoWeightKg: pallet.cargoWeightKg,
    packagingWeightKg: pallet.packagingWeightKg,
    totalWeightKg: pallet.totalWeightKg,
    centerOfGravityX: pallet.centerOfGravity.x,
    centerOfGravityY: pallet.centerOfGravity.y,
    centerOfGravityZ: pallet.centerOfGravity.z,
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

function nextAnimationFrame() {
  return new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
}

async function captureViewerPng() {
  const canvas = document.querySelector<HTMLCanvasElement>('.viewer-host canvas, .pallet-viewer canvas, canvas');
  if (!canvas || canvas.width <= 0 || canvas.height <= 0) return undefined;
  try {
    await nextAnimationFrame();
    await nextAnimationFrame();
    const copy = document.createElement('canvas');
    copy.width = canvas.width;
    copy.height = canvas.height;
    const context = copy.getContext('2d', { willReadFrequently: true });
    if (!context) return undefined;
    context.clearRect(0, 0, copy.width, copy.height);
    context.drawImage(canvas, 0, 0);

    const sampleWidth = Math.min(96, copy.width);
    const sampleHeight = Math.min(72, copy.height);
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = sampleWidth;
    sampleCanvas.height = sampleHeight;
    const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true });
    if (!sampleContext) return undefined;
    sampleContext.drawImage(copy, 0, 0, sampleWidth, sampleHeight);
    const pixels = sampleContext.getImageData(0, 0, sampleWidth, sampleHeight).data;
    let visiblePixels = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > 0) visiblePixels += 1;
    }
    if (visiblePixels === 0) return undefined;

    const blob = await new Promise<Blob | null>(resolve => copy.toBlob(resolve, 'image/png'));
    if (!blob || blob.size < 100) return undefined;
    return new Uint8Array(await blob.arrayBuffer());
  } catch {
    return undefined;
  }
}

function palletAnalysisInputs(snapshot: PalletWorkSnapshot | undefined) {
  if (!snapshot) return { floorFootprints: undefined, massBodies: undefined };
  const columns = new Map<number, typeof snapshot.result.pallets>();
  snapshot.result.pallets.forEach((pallet) => {
    const list = columns.get(pallet.stackColumn) ?? [];
    list.push(pallet);
    columns.set(pallet.stackColumn, list);
  });

  const floorFootprints: FloorLoadFootprint[] = [...columns.values()].flatMap((loads) => {
    const sorted = [...loads].sort((a, b) => a.stackLevel - b.stackLevel);
    const base = sorted[0];
    if (!base) return [];
    return [{
      x: base.x,
      y: base.y,
      length: base.length,
      width: base.width,
      weightKg: sorted.reduce((sum, pallet) => sum + pallet.totalWeightKg, 0),
    }];
  });
  const massBodies: BalanceMassBody[] = snapshot.result.pallets.map((pallet) => ({
    weightKg: pallet.totalWeightKg,
    x: pallet.centerOfGravity.x,
    y: pallet.centerOfGravity.y,
    z: pallet.centerOfGravity.z,
  }));
  return { floorFootprints, massBodies };
}

function palletOccupiedEnvelopeVolume(snapshot: PalletWorkSnapshot | undefined) {
  if (!snapshot) return 0;
  const columns = new Map<number, typeof snapshot.result.pallets>();
  snapshot.result.pallets.forEach((pallet) => {
    const list = columns.get(pallet.stackColumn) ?? [];
    list.push(pallet);
    columns.set(pallet.stackColumn, list);
  });
  return [...columns.values()].reduce((total, loads) => {
    const sorted = [...loads].sort((a, b) => a.stackLevel - b.stackLevel);
    const base = sorted[0];
    if (!base) return total;
    const top = sorted.reduce((max, pallet) => {
      const cargoTop = Math.max(pallet.z + pallet.height, ...pallet.cargoPlacements.map(item => item.z + item.height));
      return Math.max(max, cargoTop + pallet.packagingExtraHeightM);
    }, base.z + base.height);
    return total + base.length * base.width * Math.max(0, top - base.z);
  }, 0);
}

function resultSummary(result: LoadingResult | undefined) {
  if (!result) return null;
  return {
    placementCount: result.placements.length,
    remainingCount: result.remaining.reduce((sum, item) => sum + item.quantity, 0),
    loadedWeightKg: result.loadedWeightKg,
    usedVolumeM3: result.usedVolumeM3,
  };
}

function resultsEquivalent(a: LoadingResult | undefined, b: LoadingResult | undefined) {
  if (!a || !b) return false;
  return a.placements.length === b.placements.length
    && Math.abs(a.loadedWeightKg - b.loadedWeightKg) <= 1e-6
    && a.remaining.reduce((sum, item) => sum + item.quantity, 0) === b.remaining.reduce((sum, item) => sum + item.quantity, 0);
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
  const mode = target?.mode ?? (palletSnapshot ? 'pallets' : 'boxes');
  const canonicalResult = mode === 'pallets' && palletSnapshot
    ? {
      placements: palletSnapshot.result.placements,
      remaining: palletSnapshot.result.remaining,
      loadedWeightKg: palletSnapshot.result.totalPalletizedWeightKg,
      usedVolumeM3: palletSnapshot.result.placements.reduce((sum, placement) => sum + placement.length * placement.width * placement.height, 0),
      validationIssues: [],
    } satisfies LoadingResult
    : target?.result ?? latest?.result;
  const container = target?.container ?? latest?.container;
  const cargo = target?.cargo ?? latest?.cargo ?? [];

  if (!container || !canonicalResult) {
    return { ok: false, message: '점검할 적재 결과가 없습니다. 최종 적재를 먼저 진행하세요.' };
  }

  const generatedAt = new Date();
  const palletInputs = mode === 'pallets' ? palletAnalysisInputs(palletSnapshot) : { floorFootprints: undefined, massBodies: undefined };
  const floorLoad = palletInputs.floorFootprints
    ? analyzeFloorLoadFootprints(container, palletInputs.floorFootprints, 12, 4)
    : analyzeFloorLoad(container, canonicalResult, 12, 4);
  const balance = assessWeightBalance(container, canonicalResult, palletInputs.massBodies);
  const constraints = analyzeConstraints(container, cargo, canonicalResult, floorLoad);
  const latestCertification = readLatestInertiaCertification();
  const certification = target && latestCertification
    && latestCertification.mode === target.mode
    && latestCertification.targetSignature === createPhysicsTargetSignature(target)
    ? latestCertification
    : undefined;
  const scenarioStatus = certification ? normalizedInertiaCounts(certification) : null;
  const inspectionStages = readInspectionStages();
  const equipment = readTransportEquipment();
  const legacyAppResult = latest?.result;

  const cargoWeightKg = canonicalResult.placements.reduce((sum, placement) => sum + placement.weightKg, 0);
  const palletTareWeightKg = palletSnapshot ? palletSnapshot.result.palletCount * palletSnapshot.spec.tareWeightKg : 0;
  const palletPackagingWeightKg = palletSnapshot?.result.totalPackagingWeightKg ?? 0;
  const palletizedWeightKg = palletSnapshot?.result.totalPalletizedWeightKg ?? cargoWeightKg;
  const securingWeightKg = certification?.securing.estimatedAddedWeightKg ?? 0;
  const finalTransportWeightKg = palletizedWeightKg + securingWeightKg;
  const cargoVolumeM3 = canonicalResult.placements.reduce((sum, placement) => sum + placement.length * placement.width * placement.height, 0);
  const occupiedPalletEnvelopeM3 = palletOccupiedEnvelopeVolume(palletSnapshot);
  const containerVolumeM3 = container.length * container.width * container.height;
  const resultConsistency = {
    canonicalSource: mode === 'pallets' && palletSnapshot ? 'palletSnapshot' : target ? 'physicsTarget' : 'appResult',
    canonical: resultSummary(canonicalResult),
    legacyApp: resultSummary(legacyAppResult),
    legacyMatchesCanonical: legacyAppResult ? resultsEquivalent(canonicalResult, legacyAppResult) : null,
  };

  const inspection = {
    schema: 'container-loading-diagnostics-v2',
    generatedAt: generatedAt.toISOString(),
    mode,
    equipment,
    input: { container, cargo },
    finalResult: canonicalResult,
    currentAppResult: canonicalResult,
    legacyAppResult: legacyAppResult ?? null,
    resultConsistency,
    palletSnapshot: palletSnapshot ?? null,
    analyses: {
      centerOfGravity: balance,
      floorLoad,
      constraints,
      inspectionStages,
      weightBreakdown: {
        cargoWeightKg,
        palletTareWeightKg,
        palletPackagingWeightKg,
        palletizedWeightKg,
        securingWeightKg,
        finalTransportWeightKg,
      },
      volumeBreakdown: {
        containerVolumeM3,
        cargoVolumeM3,
        occupiedPalletEnvelopeM3,
        cargoUtilizationPct: containerVolumeM3 > 0 ? cargoVolumeM3 / containerVolumeM3 * 100 : 0,
        palletEnvelopeUtilizationPct: containerVolumeM3 > 0 ? occupiedPalletEnvelopeM3 / containerVolumeM3 * 100 : 0,
      },
    },
    physics: {
      target: target ?? null,
      validationResult: diagnosticWindow.__containerLoadingLatestPhysics ?? null,
      inertiaCertification: certification ?? null,
      inertiaScenarioStatus: scenarioStatus,
    },
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
    selectedEquipment: equipment,
    workflow: {
      mode,
      inspectionStages,
      canonicalResultSource: resultConsistency.canonicalSource,
      legacyMatchesCanonical: resultConsistency.legacyMatchesCanonical,
      hasPhysicsTarget: Boolean(target),
      hasPhysicsValidation: Boolean(diagnosticWindow.__containerLoadingLatestPhysics),
      hasInertiaCertification: Boolean(certification),
      certificationStatus: certification?.status ?? null,
      inertiaScenarioStatus: scenarioStatus,
    },
  };

  const entries: ZipInput[] = [
    { name: 'inspection.json', data: textBytes(safeJson(inspection)), modifiedAt: generatedAt },
    { name: 'system.json', data: textBytes(safeJson(system)), modifiedAt: generatedAt },
    { name: 'cargo.csv', data: textBytes(toCsv(cargoRows(cargo, canonicalResult))), modifiedAt: generatedAt },
    { name: 'placements.csv', data: textBytes(toCsv(placementRows(canonicalResult))), modifiedAt: generatedAt },
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
    '',
    '파일 구성',
    '- inspection.json: 단일 기준 최종 배치, 무게중심, 팔레트 포함 바닥하중, 중량/부피 분리, 제약조건, 물리/관성 결과',
    '- system.json: 앱/브라우저/작업흐름과 결과 일치성 상태',
    '- cargo.csv: 품목별 요청/적재/미적재 수량과 규격',
    '- placements.csv: 최종 개별 화물 배치 좌표',
    palletSnapshot ? '- pallets.csv: 팔레트별 위치, 적층단, 화물/포장/총중량, 무게중심, 포함 화물' : '',
    preview ? '- preview.png: 생성 시점의 검증된 3D 캔버스 화면' : '- preview.png: 캔버스가 투명/비어 있거나 브라우저 캡처가 불가능해 포함되지 않음',
    '',
    'finalResult와 currentAppResult는 동일한 단일 기준 결과입니다. 과거 앱 상태는 legacyAppResult로만 별도 기록합니다.',
    '팔레트 모드의 무게중심과 바닥하중에는 팔레트 자체중량과 팔레트 포장중량이 포함됩니다.',
    '관성 상태는 실제 실행 결과를 기준으로 통과/실패/대기를 구분합니다.',
    '',
    '이 ZIP 파일을 ChatGPT 대화에 업로드하고 적재 시스템 점검을 요청하면 됩니다.',
    '점검 권장 항목: 적재 형상, 공간 활용, 적층 안전, 무게중심, 바닥하중, 미적재 원인, 물리/관성 검증, 알고리즘 이상 징후.',
  ].filter(Boolean).join('\r\n');
  entries.push({ name: 'README.txt', data: textBytes(readme), modifiedAt: generatedAt });

  const filename = `loading-system-check-${timestampName(generatedAt)}.zip`;
  downloadBytes(makeZip(entries), filename);
  return { ok: true, message: '점검 파일을 만들었습니다.', filename };
}
