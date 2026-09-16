import type { EnterprisePackagingPlannerState } from './enterprisePackagingPlannerStore';
import {
  fetchMemberCloudData,
  MEMBER_APP_STATE_SCHEMA_VERSION,
  saveMemberCloudData,
  type MemberCloudData,
} from './memberCloudData';
import {
  LEGACY_MEMBER_SESSION_KEY,
  MEMBER_SESSION_KEY,
  readSupabaseMember,
  seedTransientMemberSession,
} from './memberAuth';
import {
  adoptRemoteOperator,
  LOCAL_OPERATOR_SESSION_KEY,
  logoutLocalOperator,
  seedTransientLocalOperator,
  type LocalOperator,
} from './localOperator';
import type { PersonalBoxCatalogItem } from './personalBoxCatalog';

export const SUPABASE_PERSISTENCE_EVENT = 'container-loading:supabase-persistence-updated';
export const SUPABASE_PERSISTENCE_READY_EVENT = 'container-loading:supabase-persistence-ready';

const APP_KEY_PREFIX = 'container-loading';
const PLANNER_KEY = 'container-loading-product-packaging-v1';
const PERSONAL_BOX_KEY = 'container-loading-user-box-catalog-v1';
const PRODUCT_SELECTION_KEY = 'container-loading:selected-company-products-v1';
const OPERATOR_SCOPED_KEYS = [PLANNER_KEY, PERSONAL_BOX_KEY, PRODUCT_SELECTION_KEY] as const;
const EXCLUDED_PERSISTENT_KEYS = new Set([
  MEMBER_SESSION_KEY,
  LEGACY_MEMBER_SESSION_KEY,
  LOCAL_OPERATOR_SESSION_KEY,
  'container-loading-admin-session-v1',
  'container-loading:member-cloud-data-dirty:v1',
  // 장비 이미지는 이미 Supabase Storage/equipment_visuals에 저장한다. JSON 상태에 중복 저장하지 않는다.
  'container-loading-equipment-visual-images-v1',
  'container-loading:equipment-image-overrides:v1',
]);

let nativeBrowserStorage: Storage | null = null;
let memoryStorage: MemoryAppStorage | null = null;
let activeMember: LocalOperator | null = null;
let initialized = false;
let dirty = false;
let uploadTimer: number | null = null;
let uploadInFlight: Promise<void> | null = null;
let legacyNativeCleared = false;

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

function safeStorageEntries(storage: Storage): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key) continue;
      const value = storage.getItem(key);
      if (value != null) entries.push([key, value]);
    }
  } catch {
    // 브라우저가 저장소 접근을 막으면 빈 마이그레이션으로 시작한다.
  }
  return entries;
}

function memberScopedKey(base: string, memberId: string) {
  return `${base}:${encodeURIComponent(memberId)}`;
}

function mappedOperatorScopedKey(key: string, memberId: string, legacyOperatorId?: string) {
  for (const base of OPERATOR_SCOPED_KEYS) {
    const memberKey = memberScopedKey(base, memberId);
    if (key === memberKey) return memberKey;
    if (legacyOperatorId && key === memberScopedKey(base, legacyOperatorId)) return memberKey;
    // unscoped, guest, admin, 다른 회원의 데이터는 현재 회원에게 섞지 않는다.
    if (key === base || key.startsWith(`${base}:`)) return null;
  }
  return key;
}

/**
 * 기존 브라우저 localStorage를 Supabase로 최초 이전할 때 현재 회원에게 속하는 데이터만 고른다.
 * 다른 회원/관리자/게스트의 operator-scoped 값은 섞지 않는다.
 */
export function migrateLegacyAppEntries(
  entries: Array<[string, string]>,
  memberId: string,
  legacyOperatorId?: string,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (!key.startsWith(APP_KEY_PREFIX) || EXCLUDED_PERSISTENT_KEYS.has(key)) continue;
    if (key.endsWith(':admin') || key.endsWith(':guest')) continue;
    const mapped = mappedOperatorScopedKey(key, memberId, legacyOperatorId);
    if (!mapped) continue;
    next[mapped] = value;
  }
  return next;
}

function compatibilitySnapshot(remote: MemberCloudData, memberId: string): Record<string, string> {
  const snapshot: Record<string, string> = {};
  if (remote.plannerState) snapshot[memberScopedKey(PLANNER_KEY, memberId)] = JSON.stringify(remote.plannerState);
  if (remote.personalBoxes.length) snapshot[memberScopedKey(PERSONAL_BOX_KEY, memberId)] = JSON.stringify(remote.personalBoxes);
  return snapshot;
}

function deriveCompatibilityData(snapshot: Record<string, string>, memberId: string): {
  plannerState: EnterprisePackagingPlannerState | null;
  personalBoxes: PersonalBoxCatalogItem[];
} {
  const plannerState = parseJson<EnterprisePackagingPlannerState>(snapshot[memberScopedKey(PLANNER_KEY, memberId)] ?? null);
  const personal = parseJson<PersonalBoxCatalogItem[]>(snapshot[memberScopedKey(PERSONAL_BOX_KEY, memberId)] ?? null);
  return {
    plannerState: plannerState?.container && Array.isArray(plannerState.products) && Array.isArray(plannerState.boxes) ? plannerState : null,
    personalBoxes: Array.isArray(personal) ? personal : [],
  };
}

export class MemoryAppStorage implements Storage {
  private values = new Map<string, string>();
  private readonly changed: () => void;

  constructor(initial: Record<string, string> = {}, changed: () => void = () => undefined) {
    this.changed = changed;
    this.replaceAll(initial);
  }

  get length() { return this.values.size; }

  clear(): void {
    if (!this.values.size) return;
    this.values.clear();
    this.changed();
  }

  getItem(key: string): string | null {
    return this.values.get(String(key)) ?? null;
  }

  key(index: number): string | null {
    if (!Number.isInteger(index) || index < 0) return null;
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    if (!this.values.delete(String(key))) return;
    this.changed();
  }

  setItem(key: string, value: string): void {
    const normalizedKey = String(key);
    const normalizedValue = String(value);
    if (this.values.get(normalizedKey) === normalizedValue) return;
    this.values.set(normalizedKey, normalizedValue);
    this.changed();
  }

  snapshot(): Record<string, string> {
    return Object.fromEntries(this.values.entries());
  }

  replaceAll(next: Record<string, string>): void {
    this.values = new Map(Object.entries(next).map(([key, value]) => [String(key), String(value)]));
  }
}

function persistentSnapshot() {
  const raw = memoryStorage?.snapshot() ?? {};
  return Object.fromEntries(
    Object.entries(raw).filter(([key]) => key.startsWith(APP_KEY_PREFIX) && !EXCLUDED_PERSISTENT_KEYS.has(key)),
  );
}

function announce(status: string, extra: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SUPABASE_PERSISTENCE_EVENT, { detail: { status, ...extra } }));
}

function clearNativeApplicationData() {
  if (!nativeBrowserStorage || legacyNativeCleared) return;
  try {
    const keys = safeStorageEntries(nativeBrowserStorage).map(([key]) => key);
    for (const key of keys) {
      if (key.startsWith(APP_KEY_PREFIX)) nativeBrowserStorage.removeItem(key);
    }
    legacyNativeCleared = true;
  } catch {
    // 서버 저장은 성공했으므로 오래된 브라우저 데이터 제거 실패가 앱 사용을 막지는 않는다.
  }
}

async function flushNow() {
  if (!dirty || !activeMember || !memoryStorage) return;
  if (uploadInFlight) return uploadInFlight;

  const snapshot = persistentSnapshot();
  const compatibility = deriveCompatibilityData(snapshot, activeMember.id);
  const run = saveMemberCloudData({
    ...compatibility,
    appState: snapshot,
    schemaVersion: MEMBER_APP_STATE_SCHEMA_VERSION,
  }).then(updatedAt => {
    dirty = false;
    clearNativeApplicationData();
    announce('saved', { updatedAt: updatedAt ?? null });
  }).catch(error => {
    dirty = true;
    announce('offline', { error: error instanceof Error ? error.message : String(error) });
  }).finally(() => {
    if (uploadInFlight === run) uploadInFlight = null;
  });
  uploadInFlight = run;
  return run;
}

function scheduleUpload() {
  dirty = true;
  announce('dirty');
  if (!activeMember || typeof window === 'undefined') return;
  if (uploadTimer !== null) window.clearTimeout(uploadTimer);
  uploadTimer = window.setTimeout(() => {
    uploadTimer = null;
    void flushNow();
  }, 350);
}

function installMemoryLocalStorage(initial: Record<string, string>) {
  memoryStorage = new MemoryAppStorage(initial, scheduleUpload);
  try {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      enumerable: true,
      get: () => memoryStorage as Storage,
    });
  } catch {
    memoryStorage = null;
    throw new Error('supabase_persistence_install_failed');
  }
}

function setTransientOperatorFromMember(member: LocalOperator | null) {
  if (member) adoptRemoteOperator(member);
  else logoutLocalOperator();
}

function migrateLegacyTransientSessions(native: Storage) {
  const currentRaw = native.getItem(MEMBER_SESSION_KEY) || native.getItem(LEGACY_MEMBER_SESSION_KEY);
  seedTransientMemberSession(currentRaw);
  const member = readSupabaseMember();
  if (member) {
    seedTransientLocalOperator(native.getItem(LOCAL_OPERATOR_SESSION_KEY));
    setTransientOperatorFromMember(member);
  } else {
    logoutLocalOperator();
  }
}

function setupRuntimeRecovery() {
  const retry = () => { if (dirty) void flushNow(); };
  window.addEventListener('online', retry);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && dirty) void flushNow();
  });
}

/**
 * 앱 부팅 전에 실행한다.
 *
 * 1. 예전 localStorage 데이터는 현재 회원 범위만 1회 읽는다.
 * 2. Supabase app_state가 있으면 그것을 유일한 영구 원본으로 사용한다.
 * 3. localStorage는 메모리 Storage shim으로 교체해 이후 어떤 기능도 브라우저 디스크에 업무 데이터를 쓰지 못하게 한다.
 * 4. 최초 이전이 성공하면 예전 container-loading* localStorage 키를 제거한다.
 */
export async function initializeSupabasePersistence() {
  if (initialized || typeof window === 'undefined') return;
  nativeBrowserStorage = window.localStorage;
  const nativeEntries = safeStorageEntries(nativeBrowserStorage);
  const legacyOperator = parseJson<LocalOperator>(nativeBrowserStorage.getItem(LOCAL_OPERATOR_SESSION_KEY));

  migrateLegacyTransientSessions(nativeBrowserStorage);
  activeMember = readSupabaseMember();

  if (!activeMember) {
    // 로그아웃 상태에서는 다른 사용자의 기존 브라우저 데이터를 노출하지 않는다.
    installMemoryLocalStorage({});
    setupRuntimeRecovery();
    initialized = true;
    announce('guest-memory-only');
    window.dispatchEvent(new CustomEvent(SUPABASE_PERSISTENCE_READY_EVENT));
    return;
  }

  const legacySnapshot = migrateLegacyAppEntries(nativeEntries, activeMember.id, legacyOperator?.id);
  let initial = legacySnapshot;
  let serverReadSucceeded = false;
  let migrationNeeded = Object.keys(legacySnapshot).length > 0;

  try {
    const remote = await fetchMemberCloudData();
    serverReadSucceeded = true;
    if (remote) {
      const remoteAppKeys = Object.keys(remote.appState);
      if (remoteAppKeys.length > 0) {
        initial = remote.appState;
        migrationNeeded = false;
      } else {
        // PR #63 시기의 planner/personal_boxes 전용 서버 데이터를 새 app_state 구조로 승격한다.
        initial = { ...legacySnapshot, ...compatibilitySnapshot(remote, activeMember.id) };
        migrationNeeded = Object.keys(initial).length > 0;
      }
    }
  } catch (error) {
    announce('offline-startup', { error: error instanceof Error ? error.message : String(error) });
  }

  installMemoryLocalStorage(initial);
  setupRuntimeRecovery();
  initialized = true;

  if (migrationNeeded) {
    dirty = true;
    await flushNow();
  } else if (serverReadSucceeded) {
    // 서버 데이터로 정상 부팅했으면 오래된 localStorage 사본은 더 이상 필요 없다.
    clearNativeApplicationData();
  }

  announce('ready', { memberId: activeMember.id, keys: Object.keys(initial).length });
  window.dispatchEvent(new CustomEvent(SUPABASE_PERSISTENCE_READY_EVENT));
}

export async function flushSupabasePersistence() {
  await flushNow();
}

export function hasPendingSupabasePersistenceChanges() {
  return dirty;
}

export function readSupabaseBackedMemorySnapshot() {
  return persistentSnapshot();
}
