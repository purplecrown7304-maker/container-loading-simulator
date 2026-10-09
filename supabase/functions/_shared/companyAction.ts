import { validCompanySnapshot, companyErrorStatus } from './companySnapshot.ts';

type RpcReply = { data: unknown; error: { message: string } | null };
export type CompanyRpc = (name: string, args: Record<string, unknown>) => PromiseLike<RpcReply>;
const uuid = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
export async function handleCompanyAction(actorId: string, body: Record<string, unknown>, rpc: CompanyRpc,
  hash: (value: string) => Promise<string>, random: () => string): Promise<{ status: number; body: { ok?: boolean; data?: unknown; error?: string } }> {
  const bad = (error = 'company_invalid') => ({ status: 400, body: { error } });
  const op = String(body.op ?? '');
  if (!['list','create','detail','plan','invite','accept','role','save','submit','review'].includes(op)) return bad();
  if (!['list','create','accept'].includes(op) && !uuid(body.companyId)) return bad();
  if (['plan','submit','review'].includes(op) && !uuid(body.planId)) return bad();
  if (body.planId !== undefined && !uuid(body.planId)) return bad();
  if ((['submit','review'].includes(op) || op === 'save' && body.planId !== undefined)
    && (!Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 1)) return bad();
  if (op === 'role' && !uuid(body.memberId)) return bad();
  if (body.planOffset !== undefined && (!Number.isSafeInteger(body.planOffset) || Number(body.planOffset) < 0 || Number(body.planOffset) > 100000)) return bad();
  if (op === 'create' && (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 80)) return bad();
  if (op === 'save' && (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 120 || !validCompanySnapshot(body.snapshot))) return bad();
  if (body.comment !== undefined && (typeof body.comment !== 'string' || body.comment.length > 1000)) return bad();
  // Allowlist prevents p_actor, inviteHash or browser-supplied certification keys
  // from becoming authentication. Only the already verified session supplies actorId.
  const payload: Record<string, unknown> = {};
  for (const key of ['companyId','name','email','role','memberId','planId','planOffset','expectedRevision','title','snapshot','decision','comment']) {
    if (body[key] !== undefined) payload[key] = body[key];
  }
  const code = op === 'invite' ? random() : '';
  if (op === 'invite') payload.inviteHash = await hash(code);
  if (op === 'accept') {
    if (typeof body.code !== 'string' || !/^[a-f0-9]{64}$/.test(body.code)) return bad('company_invite_invalid');
    payload.inviteHash = await hash(body.code);
  }
  const { data, error } = await rpc('loading_company_action', { p_actor: actorId, p_op: op, p_payload: payload });
  if (error) {
    const status = companyErrorStatus(error.message);
    return { status, body: { error: status === 503 ? 'company_unavailable' : error.message } };
  }
  return { status: 200, body: { ok: true, data: op === 'invite' ? { ...(data as object), code } : data } };
}
