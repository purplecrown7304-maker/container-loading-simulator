import { adoptRemoteOperator, logoutLocalOperator, type LocalOperator } from './localOperator';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabasePublicHeaders } from './supabaseConfig';

const MEMBER_SESSION_KEY = 'container-loading:supabase-member-session:v1';
export const MEMBER_AUTH_EVENT = 'container-loading:supabase-member-auth-updated';

type AuthUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

type AuthResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  user?: AuthUser | null;
  message?: string;
  error_description?: string;
  error?: string;
};

type LoadingProfileRow = {
  id: string;
  display_name: string;
  email: string | null;
};

type StoredMemberSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
  email: string;
  displayName: string;
};

export type MemberAuthResult = {
  ok: boolean;
  member?: LocalOperator;
  pendingEmailConfirmation?: boolean;
  message?: string;
};

function readStoredSession(): StoredMemberSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(MEMBER_SESSION_KEY) || 'null') as Partial<StoredMemberSession> | null;
    if (!parsed?.accessToken || !parsed.refreshToken || !parsed.userId || !parsed.displayName || !parsed.expiresAt) return null;
    return parsed as StoredMemberSession;
  } catch {
    return null;
  }
}

function writeStoredSession(session: StoredMemberSession | null) {
  if (session) localStorage.setItem(MEMBER_SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(MEMBER_SESSION_KEY);
  window.dispatchEvent(new CustomEvent(MEMBER_AUTH_EVENT, { detail: session }));
}

function authError(data: AuthResponse, fallback: string) {
  return data.error_description || data.message || data.error || fallback;
}

function authHeaders(extra?: HeadersInit) {
  return supabasePublicHeaders({ 'Content-Type': 'application/json', ...extra });
}

function sessionExpiry(data: AuthResponse) {
  if (typeof data.expires_at === 'number' && data.expires_at > 0) return data.expires_at * 1000;
  return Date.now() + Math.max(60, data.expires_in ?? 3600) * 1000;
}

function displayNameFromUser(user: AuthUser | null | undefined, fallbackEmail = '') {
  const metadataName = typeof user?.user_metadata?.display_name === 'string' ? user.user_metadata.display_name.trim() : '';
  if (metadataName) return metadataName;
  const email = user?.email || fallbackEmail;
  return email.includes('@') ? email.split('@')[0] : '회원';
}

async function fetchOwnProfile(accessToken: string, userId: string): Promise<LoadingProfileRow | null> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/loading_profiles?id=eq.${encodeURIComponent(userId)}&select=id,display_name,email`, {
    headers: supabasePublicHeaders({ Authorization: `Bearer ${accessToken}` }),
  });
  if (!response.ok) return null;
  const rows = await response.json() as LoadingProfileRow[];
  return rows[0] ?? null;
}

async function upsertOwnProfile(accessToken: string, user: AuthUser, displayNameHint?: string): Promise<LoadingProfileRow> {
  const existing = await fetchOwnProfile(accessToken, user.id);
  if (existing?.display_name) return existing;
  const displayName = displayNameHint?.trim() || displayNameFromUser(user);
  const payload = {
    id: user.id,
    display_name: displayName,
    email: user.email ?? null,
    updated_at: new Date().toISOString(),
  };
  const response = await fetch(`${SUPABASE_URL}/rest/v1/loading_profiles?on_conflict=id`, {
    method: 'POST',
    headers: supabasePublicHeaders({
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    }),
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error('회원 프로필을 Supabase에 저장하지 못했습니다.');
  const rows = await response.json() as LoadingProfileRow[];
  return rows[0] ?? payload;
}

function saveAuthenticatedMember(data: AuthResponse, profile: LoadingProfileRow): LocalOperator {
  if (!data.access_token || !data.refresh_token || !data.user?.id) throw new Error('회원 세션 정보가 올바르지 않습니다.');
  const session: StoredMemberSession = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: sessionExpiry(data),
    userId: data.user.id,
    email: data.user.email ?? profile.email ?? '',
    displayName: profile.display_name,
  };
  writeStoredSession(session);
  return adoptRemoteOperator({ id: session.userId, name: session.displayName, email: session.email || undefined });
}

export function readSupabaseMember(): LocalOperator | null {
  const session = readStoredSession();
  if (!session) return null;
  return { id: session.userId, name: session.displayName, email: session.email || undefined };
}

export function hasSupabaseMemberSession(): boolean {
  return Boolean(readStoredSession());
}

export async function signUpMember(displayName: string, email: string, password: string): Promise<MemberAuthResult> {
  const name = displayName.trim();
  const normalizedEmail = email.trim().toLowerCase();
  if (!name) return { ok: false, message: '회원 이름을 입력하세요.' };
  if (!normalizedEmail.includes('@')) return { ok: false, message: '이메일 주소를 확인하세요.' };
  if (password.length < 6) return { ok: false, message: '비밀번호는 6자 이상 입력하세요.' };
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ email: normalizedEmail, password, data: { display_name: name, app: 'container-loading-simulator' } }),
    });
    const data = await response.json() as AuthResponse;
    if (!response.ok || !data.user) return { ok: false, message: authError(data, '회원가입에 실패했습니다.') };
    if (!data.access_token || !data.refresh_token) {
      return { ok: true, pendingEmailConfirmation: true, message: '가입 확인 이메일을 보냈습니다. 이메일 확인 후 로그인하세요.' };
    }
    const profile = await upsertOwnProfile(data.access_token, data.user, name);
    return { ok: true, member: saveAuthenticatedMember(data, profile) };
  } catch {
    return { ok: false, message: 'Supabase 회원 서버에 연결하지 못했습니다.' };
  }
}

export async function loginMember(email: string, password: string): Promise<MemberAuthResult> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) return { ok: false, message: '이메일과 비밀번호를 입력하세요.' };
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ email: normalizedEmail, password }),
    });
    const data = await response.json() as AuthResponse;
    if (!response.ok || !data.access_token || !data.refresh_token || !data.user) {
      return { ok: false, message: authError(data, '이메일 또는 비밀번호가 올바르지 않습니다.') };
    }
    const profile = await upsertOwnProfile(data.access_token, data.user, displayNameFromUser(data.user, normalizedEmail));
    return { ok: true, member: saveAuthenticatedMember(data, profile) };
  } catch {
    return { ok: false, message: 'Supabase 회원 서버에 연결하지 못했습니다.' };
  }
}

async function refreshSession(session: StoredMemberSession): Promise<StoredMemberSession | null> {
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ refresh_token: session.refreshToken }),
    });
    const data = await response.json() as AuthResponse;
    if (!response.ok || !data.access_token || !data.refresh_token || !data.user) return null;
    const profile = await upsertOwnProfile(data.access_token, data.user, session.displayName);
    const next: StoredMemberSession = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: sessionExpiry(data),
      userId: data.user.id,
      email: data.user.email ?? session.email,
      displayName: profile.display_name || session.displayName,
    };
    writeStoredSession(next);
    adoptRemoteOperator({ id: next.userId, name: next.displayName, email: next.email || undefined });
    return next;
  } catch {
    return null;
  }
}

export async function restoreMemberSession(): Promise<LocalOperator | null> {
  const session = readStoredSession();
  if (!session) return null;
  if (session.expiresAt > Date.now() + 60_000) {
    const member = { id: session.userId, name: session.displayName, email: session.email || undefined };
    adoptRemoteOperator(member);
    return member;
  }
  const refreshed = await refreshSession(session);
  if (!refreshed) {
    writeStoredSession(null);
    logoutLocalOperator();
    return null;
  }
  return { id: refreshed.userId, name: refreshed.displayName, email: refreshed.email || undefined };
}

export async function logoutMember(): Promise<void> {
  const session = readStoredSession();
  writeStoredSession(null);
  logoutLocalOperator();
  if (!session?.accessToken) return;
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: {
        ...supabasePublicHeaders(),
        Authorization: `Bearer ${session.accessToken}`,
        apikey: SUPABASE_PUBLISHABLE_KEY,
      },
    });
  } catch {
    // 로컬 세션은 이미 제거했으므로 네트워크 로그아웃 실패가 UI를 막지 않는다.
  }
}
