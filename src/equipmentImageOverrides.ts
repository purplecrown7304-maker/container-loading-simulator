import { isAdminSession } from './adminAccess';
import { CONTAINER_ADMIN_API_URL, supabasePublicHeaders } from './supabaseConfig';

const LEGACY_STORAGE_KEYS = [
  'container-loading-equipment-visual-images-v1',
  'container-loading:equipment-image-overrides:v1',
] as const;
const CACHE_KEY = 'container-loading:equipment-image-overrides-cache:v2';
export const EQUIPMENT_IMAGE_OVERRIDES_UPDATED_EVENT = 'equipment-image-overrides-updated';

export type EquipmentImageOverrides = Record<string, string>;

let serverCache: EquipmentImageOverrides | null = null;
let runtimeAdminPassword = '';
let refreshPromise: Promise<EquipmentImageOverrides> | null = null;

function readMap(key: string, allowDataUrl: boolean): EquipmentImageOverrides {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter((entry): entry is [string, string] => {
        if (typeof entry[1] !== 'string') return false;
        if (/^https:\/\//i.test(entry[1])) return true;
        return allowDataUrl && entry[1].startsWith('data:image/');
      }),
    );
  } catch {
    return {};
  }
}

function readLegacyMap(): EquipmentImageOverrides {
  return LEGACY_STORAGE_KEYS.reduce<EquipmentImageOverrides>((all, key) => ({ ...all, ...readMap(key, true) }), {});
}

function writeCache(next: EquipmentImageOverrides) {
  serverCache = next;
  try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch { /* cache is optional */ }
}

function dispatchUpdated() {
  window.dispatchEvent(new Event(EQUIPMENT_IMAGE_OVERRIDES_UPDATED_EVENT));
}

export function setEquipmentAdminCredential(password: string) {
  runtimeAdminPassword = password;
}

export function clearEquipmentAdminCredential() {
  runtimeAdminPassword = '';
}

export function readEquipmentImageOverrides(): EquipmentImageOverrides {
  const legacy = readLegacyMap();
  const remote = serverCache ?? readMap(CACHE_KEY, false);
  return { ...legacy, ...remote };
}

export async function refreshEquipmentImageOverrides(): Promise<EquipmentImageOverrides> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const response = await fetch(CONTAINER_ADMIN_API_URL, { headers: supabasePublicHeaders() });
      if (!response.ok) throw new Error('장비 이미지 서버를 불러오지 못했습니다.');
      const data = await response.json() as { images?: Record<string, unknown> };
      const next = Object.fromEntries(
        Object.entries(data.images ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && /^https:\/\//i.test(entry[1])),
      );
      writeCache(next);
      dispatchUpdated();
      return next;
    } catch {
      return serverCache ?? readMap(CACHE_KEY, false);
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

function ensureAdminImageAccess() {
  if (!isAdminSession()) throw new Error('관리자 계정으로 로그인한 경우에만 장비 이미지를 수정할 수 있습니다.');
  if (!runtimeAdminPassword) {
    const entered = window.prompt('Supabase에 장비 이미지를 저장하려면 관리자 비밀번호를 한 번 더 입력하세요.') ?? '';
    runtimeAdminPassword = entered;
  }
  if (!runtimeAdminPassword) throw new Error('관리자 비밀번호 확인이 필요합니다.');
}

async function adminMutation(payload: Record<string, unknown>) {
  ensureAdminImageAccess();
  const response = await fetch(CONTAINER_ADMIN_API_URL, {
    method: 'POST',
    headers: supabasePublicHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ ...payload, adminId: 'admin', adminPassword: runtimeAdminPassword }),
  });
  const data = await response.json().catch(() => ({})) as { error?: string; publicUrl?: string };
  if (!response.ok) {
    if (response.status === 401) runtimeAdminPassword = '';
    throw new Error(response.status === 401 ? '관리자 비밀번호가 올바르지 않습니다. 다시 시도하세요.' : data.error || 'Supabase 서버 저장에 실패했습니다.');
  }
  return data;
}

function removeLegacyEntry(equipmentId: string) {
  for (const key of LEGACY_STORAGE_KEYS) {
    const legacy = readMap(key, true);
    if (!legacy[equipmentId]) continue;
    delete legacy[equipmentId];
    try {
      if (Object.keys(legacy).length) window.localStorage.setItem(key, JSON.stringify(legacy));
      else window.localStorage.removeItem(key);
    } catch { /* legacy cleanup is optional */ }
  }
}

export async function setEquipmentImageOverride(equipmentId: string, dataUrl: string) {
  const data = await adminMutation({ action: 'upload', equipmentId, dataUrl });
  if (!data.publicUrl) throw new Error('Supabase에서 이미지 주소를 받지 못했습니다.');
  const current = serverCache ?? readMap(CACHE_KEY, false);
  const next = { ...current, [equipmentId]: data.publicUrl };
  writeCache(next);
  removeLegacyEntry(equipmentId);
  dispatchUpdated();
  return next;
}

export async function removeEquipmentImageOverride(equipmentId: string) {
  await adminMutation({ action: 'remove', equipmentId });
  const current = serverCache ?? readMap(CACHE_KEY, false);
  const next = { ...current };
  delete next[equipmentId];
  writeCache(next);
  removeLegacyEntry(equipmentId);
  dispatchUpdated();
  return next;
}

export async function migrateLegacyEquipmentImagesToServer() {
  if (!isAdminSession()) return { migrated: 0, failed: 0 };
  const legacy = readLegacyMap();
  const entries = Object.entries(legacy).filter((entry): entry is [string, string] => entry[1].startsWith('data:image/'));
  if (!entries.length) return { migrated: 0, failed: 0 };
  ensureAdminImageAccess();
  await refreshEquipmentImageOverrides();
  let migrated = 0;
  let failed = 0;
  for (const [equipmentId, dataUrl] of entries) {
    try {
      await setEquipmentImageOverride(equipmentId, dataUrl);
      migrated += 1;
    } catch {
      failed += 1;
    }
  }
  return { migrated, failed };
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('이미지 파일을 읽지 못했습니다.'));
    reader.onload = () => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('지원하지 않거나 손상된 이미지입니다.'));
      image.src = String(reader.result ?? '');
    };
    reader.readAsDataURL(file);
  });
}

function renderCompressed(image: HTMLImageElement, maxWidth: number, maxHeight: number, quality: number) {
  const ratio = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
  const width = Math.max(1, Math.round(image.naturalWidth * ratio));
  const height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('브라우저에서 이미지 편집 캔버스를 만들지 못했습니다.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/webp', quality);
}

export async function prepareEquipmentImage(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('PNG, JPG, WEBP 같은 이미지 파일만 선택하세요.');
  if (file.size > 12 * 1024 * 1024) throw new Error('이미지 파일은 12MB 이하로 선택하세요.');

  const image = await loadImage(file);
  const attempts = [
    [960, 600, 0.88],
    [840, 525, 0.84],
    [720, 450, 0.80],
    [600, 375, 0.76],
  ] as const;

  let dataUrl = '';
  for (const [width, height, quality] of attempts) {
    dataUrl = renderCompressed(image, width, height, quality);
    if (dataUrl.length <= 260_000) break;
  }
  if (!dataUrl.startsWith('data:image/')) throw new Error('이미지 변환에 실패했습니다.');
  return dataUrl;
}
