import { readAdminSessionToken } from './adminAccess';
import { CONTAINER_ADMIN_API_URL, supabasePublicHeaders } from './supabaseConfig';

export type AdminMemberStatus = 'active' | 'suspended';
export type AdminMember = {
  id: string;
  email: string;
  displayName: string;
  status: AdminMemberStatus;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
};
export type AdminMemberPage = { members: AdminMember[]; total: number; page: number; pageSize: number };
export type AdminMemberQuery = { q: string; status: 'all' | AdminMemberStatus; page: number };
export type AdminMemberUpdate = { memberId: string; displayName: string; status: AdminMemberStatus; expectedUpdatedAt: string };

export class AdminMemberApiError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'AdminMemberApiError'; }
}
const errors = new Set(['admin_auth_required', 'admin_member_conflict', 'admin_member_not_found',
  'invalid_display_name', 'invalid_member_status', 'invalid_member_id', 'invalid_request']);
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const date = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));

function member(value: unknown): AdminMember {
  if (!record(value) || typeof value.id !== 'string' || typeof value.email !== 'string' ||
      typeof value.displayName !== 'string' || !['active', 'suspended'].includes(String(value.status)) ||
      !date(value.createdAt) || !date(value.updatedAt) || (value.lastLoginAt !== null && !date(value.lastLoginAt))) {
    throw new AdminMemberApiError('admin_members_unavailable');
  }
  // Whitelist fields. Credential fields and unrelated member data never enter UI state.
  return { id: value.id, email: value.email, displayName: value.displayName,
    status: value.status as AdminMemberStatus, createdAt: value.createdAt,
    updatedAt: value.updatedAt, lastLoginAt: value.lastLoginAt as string | null };
}

async function request(payload: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const token = readAdminSessionToken();
  if (!token) throw new AdminMemberApiError('admin_auth_required');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', cancel, { once: true });
  const timeout = window.setTimeout(cancel, 15_000);
  try {
    const response = await fetch(CONTAINER_ADMIN_API_URL, {
      method: 'POST',
      headers: supabasePublicHeaders({ 'Content-Type': 'application/json', 'x-admin-session': token }),
      body: JSON.stringify({ action: 'members', ...payload }), signal: controller.signal,
    });
    const result: unknown = await response.json().catch(() => null);
    if (response.status === 401 || response.status === 403) throw new AdminMemberApiError('admin_auth_required');
    if (!response.ok || !record(result) || result.ok !== true || !record(result.data)) {
      const code = record(result) && typeof result.error === 'string' && errors.has(result.error)
        ? result.error : 'admin_members_unavailable';
      throw new AdminMemberApiError(code);
    }
    return result.data;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof AdminMemberApiError) throw error;
    throw new AdminMemberApiError('admin_members_unavailable');
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}

export async function listAdminMembers(query: AdminMemberQuery, signal?: AbortSignal): Promise<AdminMemberPage> {
  const data = await request({ op: 'list', q: query.q.trim(), status: query.status, page: query.page, pageSize: 25 }, signal);
  if (!Array.isArray(data.members) || !Number.isInteger(data.total) || Number(data.total) < 0 ||
      !Number.isInteger(data.page) || Number(data.page) < 1 || data.pageSize !== 25 || data.members.length > 25) {
    throw new AdminMemberApiError('admin_members_unavailable');
  }
  return { members: data.members.map(member), total: Number(data.total), page: Number(data.page), pageSize: 25 };
}

export async function updateAdminMember(input: AdminMemberUpdate): Promise<AdminMember> {
  const data = await request({ op: 'update', memberId: input.memberId, displayName: input.displayName.trim(),
    status: input.status, expectedUpdatedAt: input.expectedUpdatedAt });
  return member(data.member);
}
