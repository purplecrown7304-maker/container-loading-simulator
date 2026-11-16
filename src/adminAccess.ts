import { CONTAINER_ADMIN_API_URL, supabasePublicHeaders } from './supabaseConfig';

export const ADMIN_ACCESS_EVENT = 'container-loading:admin-access-updated';

const SESSION_KEY = 'container-loading-admin-session-v1';
const ADMIN_ID = 'admin';
const ADMIN_PASSWORD_SHA256 = '2bca96f5990a0f640035d39c403e4e7d51b405ec0b51dd5e12543341407d6f15';

type AdminSession = {
  role: 'admin';
  userId: string;
  loggedInAt: string;
  sessionToken: string;
  expiresAt: string;
};

let sessionGeneration = 0;

function dispatchAccessChanged() {
  window.dispatchEvent(new CustomEvent(ADMIN_ACCESS_EVENT, { detail: { isAdmin: isAdminSession() } }));
}

function readAdminSession(): AdminSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AdminSession>;
    if (parsed.role !== 'admin' || parsed.userId !== ADMIN_ID ||
      typeof parsed.sessionToken !== 'string' || !/^[a-f0-9]{64}$/.test(parsed.sessionToken) ||
      typeof parsed.expiresAt !== 'string' || !Number.isFinite(Date.parse(parsed.expiresAt)) ||
      Date.parse(parsed.expiresAt) <= Date.now()) return null;
    return parsed as AdminSession;
  } catch {
    return null;
  }
}

/** UI state only. Privileged requests always revalidate this token on the server. */
export function isAdminSession(): boolean { return Boolean(readAdminSession()); }
export function readAdminSessionToken(): string | null { return readAdminSession()?.sessionToken ?? null; }
export function readAdminSessionExpiry(): number | null {
  const session = readAdminSession();
  return session ? Date.parse(session.expiresAt) : null;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function loginAdmin(userId: string, password: string): Promise<boolean> {
  const generation = ++sessionGeneration;
  const normalizedId = userId.trim().toLowerCase();
  if (normalizedId !== ADMIN_ID) return false;
  const passwordHash = await sha256(password);
  if (passwordHash !== ADMIN_PASSWORD_SHA256) return false;
  // Keep the historical password source compatible with the existing admin API.
  // The browser comparison cannot grant access: only a server-issued session can.
  let response: Response;
  try {
    response = await fetch(CONTAINER_ADMIN_API_URL, {
      method: 'POST',
      headers: supabasePublicHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ action: 'session', adminId: normalizedId, adminPassword: password }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error('관리자 서버에 연결하지 못했습니다. 다시 시도하세요.');
  }
  const data = await response.json().catch(() => ({})) as { ok?: boolean; sessionToken?: string; expiresAt?: string };
  if (response.status === 401 || response.status === 403) return false;
  if (!response.ok || !data.ok || typeof data.sessionToken !== 'string' || !/^[a-f0-9]{64}$/.test(data.sessionToken) ||
      typeof data.expiresAt !== 'string' || !Number.isFinite(Date.parse(data.expiresAt)) || Date.parse(data.expiresAt) <= Date.now()) {
    throw new Error('관리자 세션을 확인하지 못했습니다. 다시 시도하세요.');
  }
  if (generation !== sessionGeneration) {
    void revokeAdminSession(data.sessionToken);
    return false;
  }
  const session: AdminSession = {
    role: 'admin',
    userId: ADMIN_ID,
    loggedInAt: new Date().toISOString(),
    sessionToken: data.sessionToken,
    expiresAt: data.expiresAt,
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  dispatchAccessChanged();
  return true;
}

export function logoutAdmin() {
  const token = readAdminSessionToken();
  sessionGeneration += 1;
  sessionStorage.removeItem(SESSION_KEY);
  dispatchAccessChanged();
  if (token) void revokeAdminSession(token);
}

async function revokeAdminSession(token: string) {
  try {
    await fetch(CONTAINER_ADMIN_API_URL, {
      method: 'POST',
      headers: supabasePublicHeaders({ 'Content-Type': 'application/json', 'x-admin-session': token }),
      body: JSON.stringify({ action: 'logout_session' }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch { /* The local tab signs out immediately even while offline. */ }
}
