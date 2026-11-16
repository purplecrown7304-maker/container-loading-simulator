type RpcReply = { data: unknown; error: { message: string } | null };
export type AdminMembersRpc = (name: string, args: Record<string, unknown>) => PromiseLike<RpcReply>;
type Reply = { status: number; body: { ok?: boolean; data?: unknown; error?: string } };

const uuid = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);

function validTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 40 || !/^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\.[0-9]{1,6})?(?:Z|[+-](?:0[0-9]|1[0-4]):[0-5][0-9])$/.test(value)) return false;
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(Date.parse(value)) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value.slice(0, 10);
}

/** Only a server-issued administrator token supplies authority. Browser roles,
 * member IDs and passwords never become RPC authentication arguments. */
export async function handleAdminMembersAction(token: string, body: Record<string, unknown>, rpc: AdminMembersRpc,
  hash: (value: string) => Promise<string>): Promise<Reply> {
  const fail = (error: string, status = 400): Reply => ({ status, body: { error } });
  if (!/^[a-f0-9]{64}$/.test(token)) return fail('admin_auth_required', 401);
  const op = body.op;
  const payload: Record<string, unknown> = {};
  if (op === 'list') {
    if (body.q !== undefined && (typeof body.q !== 'string' || body.q.length > 100)) return fail('invalid_request');
    if (body.status !== undefined && (typeof body.status !== 'string' || !['all', 'active', 'suspended'].includes(body.status))) return fail('invalid_member_status');
    if (body.page !== undefined && (!Number.isSafeInteger(body.page) || Number(body.page) < 1 || Number(body.page) > 100000)) return fail('invalid_request');
    if (body.pageSize !== undefined && body.pageSize !== 25) return fail('invalid_request');
    payload.q = typeof body.q === 'string' ? body.q.trim() : '';
    payload.status = body.status ?? 'all';
    payload.page = body.page ?? 1;
    payload.pageSize = 25;
  } else if (op === 'update') {
    if (!uuid(body.memberId)) return fail('invalid_member_id');
    if (typeof body.displayName !== 'string' || !body.displayName.trim() || body.displayName.trim().length > 60) return fail('invalid_display_name');
    if (body.status !== 'active' && body.status !== 'suspended') return fail('invalid_member_status');
    if (!validTimestamp(body.expectedUpdatedAt)) return fail('invalid_request');
    payload.memberId = body.memberId;
    payload.displayName = body.displayName.trim();
    payload.status = body.status;
    payload.expectedUpdatedAt = body.expectedUpdatedAt;
  } else return fail('invalid_request');

  try {
    const { data, error } = await rpc('loading_admin_member_action', {
      p_admin_token_hash: await hash(token), p_op: op, p_payload: payload,
    });
    if (error) {
      const statuses: Record<string, number> = {
        admin_auth_required: 401, admin_member_not_found: 404, admin_member_conflict: 409,
        invalid_request: 400, invalid_member_id: 400, invalid_display_name: 400, invalid_member_status: 400,
      };
      return statuses[error.message] ? fail(error.message, statuses[error.message]) : fail('admin_members_unavailable', 503);
    }
    if (data == null) return fail('admin_members_unavailable', 503);
    return { status: 200, body: { ok: true, data } };
  } catch {
    return fail('admin_members_unavailable', 503);
  }
}
