export const ADMIN_ACCESS_EVENT = 'container-loading:admin-access-updated';

const SESSION_KEY = 'container-loading-admin-session-v1';
const ADMIN_ID = 'admin';
const ADMIN_PASSWORD_SHA256 = '9163d1f08f14a0bbf5b526b09219f44ee69c2f914a8d0a9128ece8c78c01c37c';

type AdminSession = {
  role: 'admin';
  userId: string;
  loggedInAt: string;
};

function dispatchAccessChanged() {
  window.dispatchEvent(new CustomEvent(ADMIN_ACCESS_EVENT, { detail: { isAdmin: isAdminSession() } }));
}

export function isAdminSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<AdminSession>;
    return parsed.role === 'admin' && parsed.userId === ADMIN_ID;
  } catch {
    return false;
  }
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function loginAdmin(userId: string, password: string): Promise<boolean> {
  const normalizedId = userId.trim().toLowerCase();
  if (normalizedId !== ADMIN_ID) return false;
  const passwordHash = await sha256(password);
  if (passwordHash !== ADMIN_PASSWORD_SHA256) return false;
  const session: AdminSession = {
    role: 'admin',
    userId: ADMIN_ID,
    loggedInAt: new Date().toISOString(),
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  dispatchAccessChanged();
  return true;
}

export function logoutAdmin() {
  sessionStorage.removeItem(SESSION_KEY);
  dispatchAccessChanged();
}
