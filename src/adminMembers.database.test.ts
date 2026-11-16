// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Real PostgreSQL WASM and synthetic records only; no network or hosted database.
type Json = Record<string, any>; // Deliberately malformed API/SQL fixtures included.
const ids = Array.from({ length: 30 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
const validHash = 'a'.repeat(64);
const expiredHash = 'b'.repeat(64);
let db: PGlite;
async function action(op: string, payload: unknown = {}, hash: string | null = validHash): Promise<Json> {
  return (await db.query<{ result: Json }>('select public.loading_admin_member_action($1::text,$2::text,$3::jsonb) as result', [hash, op, JSON.stringify(payload)])).rows[0].result;
}
async function profile(id = ids[0]) {
  return (await action('list', { q: `member${String(ids.indexOf(id)).padStart(2, '0')}@synthetic.test` })).members[0] as Json;
}
async function update(id: string, extra: Json = {}) {
  const current = await profile(id);
  return action('update', { memberId: id, displayName: current.displayName, status: current.status, expectedUpdatedAt: current.updatedAt, ...extra });
}
async function snapshot() {
  return (await db.query<{ state: Json }>(`select jsonb_build_object(
    'members',(select jsonb_agg(to_jsonb(m) order by id) from public.loading_members m),
    'sessions',(select coalesce(jsonb_agg(to_jsonb(s) order by token_hash),'[]') from public.loading_member_sessions s),
    'data',(select jsonb_agg(to_jsonb(d) order by member_id) from public.loading_member_data d)) state`)).rows[0].state;
}
async function memberSessionCount(id = ids[0]) {
  return (await db.query<{ n: number }>('select count(*)::int n from loading_member_sessions where member_id=$1', [id])).rows[0].n;
}

describe('admin member migration on real PostgreSQL', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      grant usage on schema public to anon,authenticated,service_role;
      create table public.app_admin_upload_sessions(id uuid primary key default gen_random_uuid(),token_sha256 text unique not null,expires_at timestamptz not null,created_at timestamptz not null default now());
      create table public.loading_members(id uuid primary key,email text not null unique,display_name text not null,status text not null check(status in ('active','suspended')),
        created_at timestamptz not null,updated_at timestamptz not null,last_login_at timestamptz,password_salt text,password_hash text,password_iterations integer);
      create table public.loading_member_sessions(token_hash text primary key,member_id uuid not null references public.loading_members,expires_at timestamptz not null,created_at timestamptz not null default now(),last_seen_at timestamptz);
      create table public.loading_member_data(member_id uuid primary key references public.loading_members,app_state jsonb not null);
      alter table public.app_admin_upload_sessions enable row level security;
      alter table public.loading_members enable row level security;
      alter table public.loading_member_sessions enable row level security;
      alter table public.loading_member_data enable row level security;
      revoke all on public.app_admin_upload_sessions,public.loading_members,public.loading_member_sessions,public.loading_member_data from public,anon,authenticated;
      grant select,insert,update,delete on public.app_admin_upload_sessions,public.loading_members,public.loading_member_sessions,public.loading_member_data to service_role;`);
    await db.exec(readFileSync(new URL('../supabase/migrations/20261116052106_loading_admin_member_management.sql', import.meta.url), 'utf8'));
  }, 30000);
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    await db.exec('reset role; truncate loading_members,loading_member_sessions,loading_member_data,app_admin_upload_sessions cascade;');
    for (let i = 0; i < ids.length; i++) {
      const name = i === 0 ? 'Synthetic 100%_literal' : i === 1 ? 'Synthetic 100ABliteral' : i === 2 ? 'Synthetic back\\slash' : `Synthetic ${i}`;
      await db.query(`insert into loading_members values($1,$2,$3,$4,'2026-11-01T00:00:00Z','2026-11-02T00:00:00Z',null,'private-salt','private-password-hash',180000)`, [ids[i], `member${String(i).padStart(2, '0')}@synthetic.test`, name, i === 29 ? 'suspended' : 'active']);
    }
    await db.query("insert into loading_member_data values($1,'{\"private\":\"Synthetic cargo state\"}')", [ids[0]]);
    await db.query("insert into loading_member_sessions(token_hash,member_id,expires_at) values('member-token-1',$1,now()+interval '1 day'),('member-token-2',$1,now()+interval '1 day'),('other-member-token',$2,now()+interval '1 day')", [ids[0], ids[1]]);
    await db.query("insert into app_admin_upload_sessions(token_sha256,expires_at) values($1,now()+interval '1 hour'),($2,now()-interval '1 second')", [validHash, expiredHash]);
    await db.exec('set role service_role');
  });

  it.each(['anon', 'authenticated'])('denies browser RPC and member table access for %s', async role => {
    await db.exec(`set role ${role}`);
    await expect(action('list')).rejects.toMatchObject({ code: '42501' });
    await expect(db.query('select * from loading_members')).rejects.toMatchObject({ code: '42501' });
    await expect(db.query("update loading_members set status='active'")).rejects.toMatchObject({ code: '42501' });
  });

  it('uses security invoker and keeps RLS enabled', async () => {
    expect((await db.query<{ prosecdef: boolean }>("select prosecdef from pg_proc where proname='loading_admin_member_action'")).rows[0].prosecdef).toBe(false);
    const rows = (await db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where relname in ('loading_members','loading_member_sessions','app_admin_upload_sessions')")).rows;
    expect(rows).toHaveLength(3); expect(rows.every(row => row.relrowsecurity)).toBe(true);
  });

  it.each([null, '', 'forged', 'c'.repeat(64), expiredHash])('rejects missing, forged, or expired sessions: %s', async hash => {
    const before = await snapshot();
    await expect(action('list', {}, hash)).rejects.toThrow('admin_auth_required');
    await expect(action('update', { memberId: ids[0], displayName: 'Attack', status: 'suspended', expectedUpdatedAt: '2026-11-02T00:00:00Z' }, hash)).rejects.toThrow('admin_auth_required');
    expect(await snapshot()).toEqual(before);
  });

  it('rechecks admin sessions after logout rather than trusting a previously valid token', async () => {
    expect((await action('list')).total).toBe(30);
    await db.query('delete from app_admin_upload_sessions where token_sha256=$1', [validHash]);
    await expect(action('list')).rejects.toThrow('admin_auth_required');
  });

  it('returns stable pages and only public profile fields', async () => {
    const first = await action('list'); const second = await action('list', { page: 2 });
    expect(first).toMatchObject({ total: 30, page: 1, pageSize: 25 });
    expect(first.members).toHaveLength(25); expect(second.members).toHaveLength(5);
    expect([...first.members, ...second.members].map(member => member.id)).toEqual([...ids].reverse());
    expect(Object.keys(first.members[0]).sort()).toEqual(['createdAt', 'displayName', 'email', 'id', 'lastLoginAt', 'status', 'updatedAt'].sort());
    const encoded = JSON.stringify(first);
    expect(encoded).not.toContain('private-password-hash'); expect(encoded).not.toContain('private-salt'); expect(encoded).not.toContain('app_state'); expect(encoded).not.toContain(validHash);
  });

  it('filters status and treats search wildcard characters literally', async () => {
    expect((await action('list', { status: 'active' })).total).toBe(29);
    expect((await action('list', { status: 'suspended' })).members.map((m: Json) => m.id)).toEqual([ids[29]]);
    expect((await action('list', { q: '%_' })).members.map((m: Json) => m.id)).toEqual([ids[0]]);
    expect((await action('list', { q: 'back\\slash' })).members.map((m: Json) => m.id)).toEqual([ids[2]]);
    expect((await action('list', { q: 'MEMBER00@SYNTHETIC.TEST' })).members.map((m: Json) => m.id)).toEqual([ids[0]]);
    expect(await action('list', { q: 'No such synthetic member' })).toMatchObject({ members: [], total: 0, page: 1, pageSize: 25 });
  });

  it.each([
    ['delete', {}], ['list', []], ['list', { q: 5 }], ['list', { q: 'x'.repeat(101) }], ['list', { status: 'deleted' }],
    ['list', { page: 0 }], ['list', { page: 100001 }], ['list', { page: 1.5 }], ['list', { page: '1' }], ['list', { pageSize: 100 }],
    ['update', {}], ['update', { memberId: 'invalid', displayName: 'Valid', status: 'active', expectedUpdatedAt: '2026-11-02T00:00:00Z' }],
    ['update', { memberId: ids[0], displayName: ' ', status: 'active', expectedUpdatedAt: '2026-11-02T00:00:00Z' }],
    ['update', { memberId: ids[0], displayName: 'x'.repeat(61), status: 'active', expectedUpdatedAt: '2026-11-02T00:00:00Z' }],
    ['update', { memberId: ids[0], displayName: 'Valid', status: 'admin', expectedUpdatedAt: '2026-11-02T00:00:00Z' }],
    ['update', { memberId: ids[0], displayName: 'Valid', status: 'active', expectedUpdatedAt: 'not-a-date' }],
  ] as [string, unknown][])('validates SQL input independently: %s %j', async (op, payload) => {
    const before = await snapshot();
    const p = payload as Json;
    const error = op === 'update' && (!('memberId' in p) || p.memberId === 'invalid') ? 'invalid_member_id'
      : op === 'update' && typeof p.displayName === 'string' && (!p.displayName.trim() || p.displayName.trim().length > 60) ? 'invalid_display_name'
        : p.status === 'admin' || p.status === 'deleted' ? 'invalid_member_status' : 'invalid_request';
    await expect(action(op, payload)).rejects.toThrow(error);
    expect(await snapshot()).toEqual(before);
  });

  it('changes a name while preserving credentials, email, saved data, and sessions', async () => {
    const before = await snapshot();
    const result = await update(ids[0], { displayName: '  Synthetic renamed  ', email: 'attack@example.test', password_hash: 'attack', role: 'admin', app_state: {} });
    expect(result.member).toMatchObject({ id: ids[0], displayName: 'Synthetic renamed', email: 'member00@synthetic.test', status: 'active' });
    const after = await snapshot(); const member = after.members.find((m: Json) => m.id === ids[0]);
    expect(member).toEqual({ ...before.members.find((m: Json) => m.id === ids[0]), display_name: 'Synthetic renamed', updated_at: member.updated_at });
    expect(Date.parse(member.updated_at)).toBeGreaterThan(Date.parse('2026-11-02T00:00:00Z'));
    expect(after.sessions).toEqual(before.sessions); expect(after.data).toEqual(before.data);
  });

  it('revokes every target session on suspension and on resumption, preserving other members', async () => {
    const dataBefore = (await snapshot()).data;
    expect((await update(ids[0], { status: 'suspended' })).member.status).toBe('suspended');
    expect(await memberSessionCount()).toBe(0); expect(await memberSessionCount(ids[1])).toBe(1);
    // A token issued before resumption must never become valid after reactivation.
    await db.query("insert into loading_member_sessions(token_hash,member_id,expires_at) values('old-suspended-session',$1,now()+interval '1 day')", [ids[0]]);
    expect((await update(ids[0], { status: 'active' })).member.status).toBe('active');
    expect(await memberSessionCount()).toBe(0); expect(await memberSessionCount(ids[1])).toBe(1);
    expect((await snapshot()).data).toEqual(dataBefore);
  });

  it('leaves everything unchanged for a stale concurrency version or missing member', async () => {
    const before = await snapshot();
    await expect(update(ids[0], { displayName: 'Must not persist', status: 'suspended', expectedUpdatedAt: '2026-11-01T00:00:00Z' })).rejects.toThrow('admin_member_conflict');
    await expect(action('update', { memberId: '00000000-0000-4000-8000-999999999999', displayName: 'Missing', status: 'active', expectedUpdatedAt: '2026-11-02T00:00:00Z' })).rejects.toThrow('admin_member_not_found');
    expect(await snapshot()).toEqual(before);
  });

  it('rolls back the profile update if session revocation fails', async () => {
    const before = await snapshot();
    await db.exec(`reset role;
      create function public.synthetic_block_session_delete() returns trigger language plpgsql as $$ begin raise exception 'synthetic_revocation_failure'; end $$;
      create trigger synthetic_block_session_delete before delete on public.loading_member_sessions for each row execute function public.synthetic_block_session_delete();
      set role service_role;`);
    try {
      await expect(update(ids[0], { displayName: 'Must roll back', status: 'suspended' })).rejects.toThrow('synthetic_revocation_failure');
      expect(await snapshot()).toEqual(before);
    } finally {
      await db.exec('reset role; drop trigger synthetic_block_session_delete on public.loading_member_sessions; drop function public.synthetic_block_session_delete(); set role service_role;');
    }
  });

  it('allows one winner for two edits based on the same version', async () => {
    // PGlite serializes one connection: checks optimistic versioning, not network lock scheduling.
    const current = await profile();
    const outcomes = await Promise.allSettled(['First edit', 'Second edit'].map(displayName => action('update', { memberId: ids[0], displayName, status: 'active', expectedUpdatedAt: current.updatedAt })));
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find(outcome => outcome.status === 'rejected') as PromiseRejectedResult;
    expect(String(rejected.reason)).toContain('admin_member_conflict');
    expect((await profile()).displayName).toBe('First edit');
  });
});
