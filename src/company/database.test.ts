// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';

// Real PostgreSQL WASM, synthetic members only. No Supabase/network access.
const ids = Array.from({ length: 8 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
const [owner, outsider, planner, approver, viewer, admin, invitee, inactive] = ids;
const snapshot = () => ({ schemaVersion: 1, mode: 'boxes', capturedAt: '2026-10-09T00:00:00Z', container: { length: 4, width: 2, height: 2, maxPayloadKg: 1000 }, cargo: [{ id: 'SYNTHETIC', name: 'Synthetic carton', length: 1, width: 1, height: 1, weightKg: 10, quantity: 1 }], result: { placements: [{ unitId: 'SYNTHETIC-1', cargoId: 'SYNTHETIC', x: 0, y: 0, z: 0, length: 1, width: 1, height: 1, weightKg: 10 }], remaining: [], validationIssues: [], loadedWeightKg: 10, usedVolumeM3: 1 }, recordedVerification: { status: 'passed', testedAt: '2026-10-09T00:00:00Z' } });
type Json = Record<string, any>; // SQL boundary JSON, intentionally includes invalid fixtures.
let db: PGlite;
let companyId: string;
async function call(actor: string, op: string, payload: Json = {}) {
  const result = await db.query<{ result: Json }>('select public.loading_company_action($1::uuid,$2::text,$3::jsonb) as result', [actor, op, JSON.stringify(payload)]);
  return result.rows[0].result;
}
const action = (actor: string, op: string, payload: Json = {}) => call(actor, op, { companyId, ...payload });
const save = (actor = planner, extra: Json = {}) => action(actor, 'save', { title: 'Synthetic load', snapshot: snapshot(), ...extra });
async function counts() {
  return (await db.query<{ events: number; versions: number }>('select (select count(*)::int from loading_company_events) events, (select count(*)::int from loading_company_versions) versions')).rows[0];
}
async function invite(target: string, hash = 'a'.repeat(64), role = 'viewer', actor = owner) {
  await action(actor, 'invite', { email: `member${ids.indexOf(target)}@example.test`, role, inviteHash: hash });
  return hash;
}

describe('company migration on real PostgreSQL', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create table public.loading_members(id uuid primary key,email text,display_name text,status text);
      grant usage on schema public to anon,authenticated,service_role;
      grant select on public.loading_members to service_role;`);
    for (let i = 0; i < ids.length; i++) await db.query('insert into loading_members values($1,$2,$3,$4)', [ids[i], `member${i}@example.test`, `Synthetic ${i}`, i === 7 ? 'disabled' : 'active']);
    await db.exec(readFileSync(new URL('../../supabase/migrations/20261009103147_loading_company_service.sql', import.meta.url), 'utf8'));
  }, 30000);
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    await db.exec('reset role; truncate loading_company_spaces cascade; set role service_role;');
    companyId = (await call(owner, 'create', { name: 'Synthetic A' })).id;
    for (const [id, role] of [[planner, 'planner'], [approver, 'approver'], [viewer, 'viewer'], [admin, 'admin']]) {
      await db.query('insert into loading_company_members values($1,$2,$3)', [companyId, id, role]);
    }
  });

  it('creates owner and isolates companies and cross-company plan IDs', async () => {
    const other = await call(outsider, 'create', { name: 'Synthetic B' });
    expect((await call(owner, 'list')).spaces).toEqual([{ id: companyId, name: 'Synthetic A', role: 'owner' }]);
    const p = await save();
    await expect(call(outsider, 'detail', { companyId })).rejects.toThrow('company_forbidden');
    await expect(call(outsider, 'save', { companyId: other.id, planId: p.id, expectedRevision: 1, title: 'attack', snapshot: snapshot() })).rejects.toThrow('company_forbidden');
    expect((await action(owner, 'detail')).plans[0].title).toBe('Synthetic load');
  });
  it.each(['anon', 'authenticated'])('denies all browser table and RPC access for %s', async (role) => {
    await db.exec(`set role ${role}`);
    try {
      for (const table of ['spaces', 'members', 'invites', 'plans', 'versions', 'events']) {
        await expect(db.query(`select * from public.loading_company_${table}`)).rejects.toMatchObject({ code: '42501' });
        await expect(db.query(`delete from public.loading_company_${table}`)).rejects.toMatchObject({ code: '42501' });
        await expect(db.query(`insert into public.loading_company_${table} default values`)).rejects.toMatchObject({ code: '42501' });
        const column = table === 'spaces' ? 'name' : table === 'versions' ? 'revision' : 'company_id';
        await expect(db.query(`update public.loading_company_${table} set ${column}=${column}`)).rejects.toMatchObject({ code: '42501' });
      }
      await expect(call(owner, 'list')).rejects.toMatchObject({ code: '42501' });
    } finally { await db.exec('set role service_role'); }
  });
  it('enables RLS on all company tables and keeps RPC security invoker', async () => {
    const rows = (await db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where relname like 'loading_company_%' and relkind='r'" )).rows;
    expect(rows).toHaveLength(6); expect(rows.every(r => r.relrowsecurity)).toBe(true);
    expect((await db.query<{ prosecdef: boolean }>("select prosecdef from pg_proc where proname='loading_company_action'")).rows[0].prosecdef).toBe(false);
  });
  it('rejects inactive members', async () => {
    await expect(call(inactive, 'create', { name: 'No' })).rejects.toThrow('company_forbidden');
  });
  it.each([approver, viewer])('permits reads but blocks planner writes for %s', async actor => {
    expect((await action(actor, 'detail')).space.id).toBe(companyId);
    await expect(save(actor)).rejects.toThrow('company_forbidden');
    const p = await save();
    await expect(action(actor, 'submit', { planId: p.id, expectedRevision: 1 })).rejects.toThrow('company_forbidden');
    await expect(invite(invitee, 'b'.repeat(64), 'viewer', actor)).rejects.toThrow('company_forbidden');
  });
  it('binds invitations to email and single use', async () => {
    const hash = await invite(invitee);
    await expect(call(outsider, 'accept', { inviteHash: hash })).rejects.toThrow('company_invite_invalid');
    expect((await call(invitee, 'accept', { inviteHash: hash })).role).toBe('viewer');
    await expect(call(invitee, 'accept', { inviteHash: hash })).rejects.toThrow('company_invite_invalid');
  });
  it('does not elevate existing members via invitation acceptance', async () => {
    const hash = await invite(viewer, 'd'.repeat(64), 'approver');
    const before = await counts();
    await expect(call(viewer, 'accept', { inviteHash: hash })).rejects.toThrow('company_invite_invalid');
    expect((await action(viewer, 'detail')).space.role).toBe('viewer');
    expect(await counts()).toEqual(before);
  });
  it('rejects expired invitations and forbidden owner/admin invitation roles', async () => {
    const hash = await invite(invitee);
    await db.query("update loading_company_invites set expires_at=now()-interval '1 second' where token_hash=$1", [hash]);
    await expect(call(invitee, 'accept', { inviteHash: hash })).rejects.toThrow('company_invite_invalid');
    for (const role of ['owner', 'admin']) await expect(invite(invitee, 'b'.repeat(64), role)).rejects.toThrow('company_invalid');
  });
  it('protects owner and prevents admin elevation or editing other admins', async () => {
    await expect(action(owner, 'role', { memberId: owner, role: 'removed' })).rejects.toThrow('company_forbidden');
    await expect(action(admin, 'role', { memberId: viewer, role: 'admin' })).rejects.toThrow('company_forbidden');
    await expect(action(admin, 'role', { memberId: admin, role: 'planner' })).rejects.toThrow('company_forbidden');
    await action(owner, 'role', { memberId: viewer, role: 'admin' });
    expect((await action(viewer, 'detail')).space.role).toBe('admin');
  });
  it('revocation invalidates issued invites even after issuer is re-added', async () => {
    const hash = await invite(invitee, 'c'.repeat(64), 'planner', admin);
    await action(owner, 'role', { memberId: admin, role: 'removed' });
    await expect(action(admin, 'detail')).rejects.toThrow('company_forbidden');
    await db.query("insert into loading_company_members values($1,$2,'admin')", [companyId, admin]);
    await expect(call(invitee, 'accept', { inviteHash: hash })).rejects.toThrow('company_invite_invalid');
  });
  it('same-revision queued concurrent saves allow one winner and preserve history', async () => {
    // PGlite serializes a single connection: this verifies optimistic versioning,
    // not independent-session lock scheduling or a networked PostgreSQL race.
    const p = await save(); const before = await counts();
    const outcomes = await Promise.allSettled(['First', 'Second'].map(title => save(planner, { planId: p.id, expectedRevision: 1, title })));
    expect(outcomes.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const failure = outcomes.find(r => r.status === 'rejected') as PromiseRejectedResult;
    expect(String(failure.reason)).toContain('company_conflict');
    expect(await counts()).toEqual({ events: Number(before.events) + 1, versions: Number(before.versions) + 1 });
    const rows = (await db.query<{ revision: number; title: string }>('select revision,title from loading_company_versions where plan_id=$1 order by revision', [p.id])).rows;
    expect(rows.map(r => r.revision)).toEqual([1, 2]); expect(rows[0].title).toBe('Synthetic load');
  });
  it('requires another reviewer and resets approved plans to a new draft revision on save', async () => {
    const p = await save(owner);
    const submitted = await action(owner, 'submit', { planId: p.id, expectedRevision: 1 });
    const before = await counts();
    await expect(action(owner, 'review', { planId: p.id, expectedRevision: submitted.revision, decision: 'approved' })).rejects.toThrow('company_self_review');
    await expect(action(planner, 'review', { planId: p.id, expectedRevision: 2, decision: 'approved' })).rejects.toThrow('company_forbidden');
    expect(await counts()).toEqual(before);
    const approved = await action(approver, 'review', { planId: p.id, expectedRevision: 2, decision: 'approved' });
    expect(approved).toMatchObject({ status: 'approved', revision: 3 });
    expect(await save(planner, { planId: p.id, expectedRevision: 3 })).toMatchObject({ status: 'draft', revision: 4, submitted_by: null });
  });
  it('requires a rejection comment, preserves history and permits corrected resubmission', async () => {
    const p = await save();
    await action(planner, 'submit', { planId: p.id, expectedRevision: 1 });
    const before = await counts();
    await expect(action(approver, 'review', { planId: p.id, expectedRevision: 2, decision: 'changes_requested', comment: ' ' })).rejects.toThrow('company_invalid');
    expect(await counts()).toEqual(before);
    expect(await action(approver, 'review', { planId: p.id, expectedRevision: 2, decision: 'changes_requested', comment: 'Synthetic correction requested' })).toMatchObject({ status: 'changes_requested', revision: 3 });
    expect(await action(planner, 'submit', { planId: p.id, expectedRevision: 3 })).toMatchObject({ status: 'submitted', revision: 4 });
  });
  it.each(['missing', 'failed', 'whatif-container', 'whatif-result', 'missing-result', 'missing-quantity', 'remaining-missing-quantity', 'foreign-cargo', 'duplicate-unit', 'static-error', 'operational-error'])('blocks unsafe submission: %s', async kind => {
    const s: Json = snapshot();
    if (kind === 'missing') delete s.recordedVerification;
    if (kind === 'failed') s.recordedVerification.status = 'failed';
    if (kind === 'whatif-container') s.container.limitReview = { enabled: true };
    if (kind === 'whatif-result') s.result.limitReview = { enabled: true };
    if (kind === 'missing-result') delete s.result;
    if (kind === 'missing-quantity') s.result.placements = [];
    if (kind === 'remaining-missing-quantity') s.result.remaining = [{ cargoId: 'SYNTHETIC', reason: 'Synthetic malformed' }];
    if (kind === 'foreign-cargo') s.result.placements[0].cargoId = 'FOREIGN';
    if (kind === 'duplicate-unit') { s.cargo[0].quantity = 2; s.result.placements.push({ ...s.result.placements[0], x: 1 }); s.result.loadedWeightKg = 20; s.result.usedVolumeM3 = 2; }
    if (kind === 'static-error') s.result.validationIssues = [{ type: 'UNSUPPORTED', message: 'Synthetic failure', placementIndexes: [0] }];
    if (kind === 'operational-error') s.result.operationalFindings = [{ code: 'CG_LONGITUDINAL', severity: 'error', message: 'Synthetic failure', placementIndexes: [0] }];
    const p = await save(planner, { snapshot: s }); const before = await counts();
    await expect(action(planner, 'submit', { planId: p.id, expectedRevision: 1 })).rejects.toThrow('company_review_required');
    expect(await counts()).toEqual(before);
    expect((await action(owner, 'detail')).plans[0]).toMatchObject({ status: 'draft', revision: 1 });
  });
  it('rolls back plan/version/event atomically on event constraint failure', async () => {
    const p = await save(); const before = await counts();
    await expect(save(planner, { planId: p.id, expectedRevision: 1, title: 'Must roll back', comment: 'x'.repeat(1001) })).rejects.toMatchObject({ code: '23514' });
    expect(await counts()).toEqual(before);
    expect((await action(owner, 'detail')).plans[0]).toMatchObject({ title: 'Synthetic load', revision: 1 });
  });
});





