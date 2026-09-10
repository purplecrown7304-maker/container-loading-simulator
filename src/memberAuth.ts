import { adoptRemoteOperator, logoutLocalOperator, type LocalOperator } from './localOperator';
import { CONTAINER_MEMBER_API_URL, supabasePublicHeaders } from './supabaseConfig';

const MEMBER_SESSION_KEY = 'container-loading:supabase-member-session:v2';
const LEGACY_MEMBER_SESSION_KEY = 'container-loading:supabase-member-session:v1';
export const MEMBER_AUTH_EVENT = 'container-loading:supabase-member-auth-updated';

type MemberApiProfile = {
  id: string;
  email: string;
  displayName: string;
  status?: string;
};

type MemberApiResponse = {
  ok?: boolean;
  token?: string;
  expiresAt?: string;
  member?: MemberApiProfile;
  error?: string;
};

type StoredMemberSession = {
  token: string;
  expiresAt: string;
  userId: string;
  email: string;
  displayName: string;
};

export type MemberAuthResult = {
  ok: boolean;
  member?: LocalOperator;
  message?: string;
};

function readStoredSession(): StoredMemberSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(MEMBER_SESSION_KEY) || 'null') as Partial<StoredMemberSession> | null;
    if (!parsed?.token || !parsed.expiresAt || !parsed.userId || !parsed.displayName) return null;
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
      localStorage.removeItem(MEMBER_SESSION_KEY);
      return null;
    }
    return parsed as StoredMemberSession;
  } catch {
    return null;
  }
}

function writeStoredSession(session: StoredMemberSession | null) {
  if (session) localStorage.setItem(MEMBER_SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(MEMBER_SESSION_KEY);
  localStorage.removeItem(LEGACY_MEMBER_SESSION_KEY);
  window.dispatchEvent(new CustomEvent(MEMBER_AUTH_EVENT, { detail: session }));
}

function apiMessage(error: string | undefined, fallback: string) {
  if (error === 'invalid_email') return '이메일 주소를 확인하세요.';
  if (error === 'invalid_display_name') return '회원 이름을 확인하세요.';
  if (error === 'weak_password') return '비밀번호는 8자 이상 입력하세요.';
  if (error === 'email_already_registered') return '이미 가입된 이메일입니다.';
  if (error === 'invalid_credentials') return '이메일 또는 비밀번호가 올바르지 않습니다.';
  if (error === 'member_inactive') return '사용이 중지된 회원입니다.';
  if (error === 'member_auth_required') return '회원 로그인이 만료되었습니다.';
  return fallback;
}

function saveMemberSession(data: MemberApiResponse): LocalOperator {
  if (!data.token || !data.expiresAt || !data.member?.id || !data.member.displayName) throw new Error('회원 세션 정보가 올바르지 않습니다.');
  const session: StoredMemberSession = {
    token: data.token,
    expiresAt: data.expiresAt,
    userId: data.member.id,
    email: data.member.email || '',
    displayName: data.member.displayName,
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

async function postMemberAction(payload: Record<string, unknown>, token?: string) {
  const response = await fetch(CONTAINER_MEMBER_API_URL, {
    method: 'POST',
    headers: supabasePublicHeaders({
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({})) as MemberApiResponse;
  return { response, data };
}

export async function signUpMember(displayName: string, email: string, password: string): Promise<MemberAuthResult> {
  const name = displayName.trim();
  const normalizedEmail = email.trim().toLowerCase();
  if (!name) return { ok: false, message: '회원 이름을 입력하세요.' };
  if (!normalizedEmail.includes('@')) return { ok: false, message: '이메일 주소를 확인하세요.' };
  if (password.length < 8) return { ok: false, message: '비밀번호는 8자 이상 입력하세요.' };
  try {
    const { response, data } = await postMemberAction({ action: 'signup', displayName: name, email: normalizedEmail, password });
    if (!response.ok || !data.ok) return { ok: false, message: apiMessage(data.error, '회원가입에 실패했습니다.') };
    return { ok: true, member: saveMemberSession(data) };
  } catch {
    return { ok: false, message: 'Supabase 회원 서버에 연결하지 못했습니다.' };
  }
}

export async function loginMember(email: string, password: string): Promise<MemberAuthResult> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) return { ok: false, message: '이메일과 비밀번호를 입력하세요.' };
  try {
    const { response, data } = await postMemberAction({ action: 'login', email: normalizedEmail, password });
    if (!response.ok || !data.ok) return { ok: false, message: apiMessage(data.error, '회원 로그인에 실패했습니다.') };
    return { ok: true, member: saveMemberSession(data) };
  } catch {
    return { ok: false, message: 'Supabase 회원 서버에 연결하지 못했습니다.' };
  }
}

export async function restoreMemberSession(): Promise<LocalOperator | null> {
  const session = readStoredSession();
  if (!session) return null;
  try {
    const response = await fetch(CONTAINER_MEMBER_API_URL, {
      headers: supabasePublicHeaders({ Authorization: `Bearer ${session.token}` }),
    });
    const data = await response.json().catch(() => ({})) as MemberApiResponse;
    if (!response.ok || !data.ok || !data.member) {
      writeStoredSession(null);
      logoutLocalOperator();
      return null;
    }
    const next: StoredMemberSession = {
      ...session,
      expiresAt: data.expiresAt || session.expiresAt,
      userId: data.member.id,
      email: data.member.email || '',
      displayName: data.member.displayName,
    };
    writeStoredSession(next);
    return adoptRemoteOperator({ id: next.userId, name: next.displayName, email: next.email || undefined });
  } catch {
    return { id: session.userId, name: session.displayName, email: session.email || undefined };
  }
}

export async function logoutMember(): Promise<void> {
  const session = readStoredSession();
  writeStoredSession(null);
  logoutLocalOperator();
  if (!session?.token) return;
  try {
    await postMemberAction({ action: 'logout' }, session.token);
  } catch {
    // 서버 연결이 끊겨도 브라우저의 회원 세션은 즉시 해제한다.
  }
}
