import { describe, expect, it, vi } from 'vitest';
import { validCompanySnapshot } from '../../supabase/functions/_shared/companySnapshot';
import { handleCompanyAction } from '../../supabase/functions/_shared/companyAction';

export const fixture = () => ({ schemaVersion: 1, mode: 'boxes', capturedAt: '2026-10-09T00:00:00Z',
  container: { length: 6, width: 2.35, height: 2.4, maxPayloadKg: 10000 },
  cargo: [{ id: 'A', name: '합성 화물', length: 1, width: 1, height: 1, weightKg: 10, quantity: 2, maxTopLoadKg: 0 }],
  result: { placements: [{ cargoId: 'A', unitId: 'A-1', x: 0, y: 0, z: 0, length: 1, width: 1, height: 1, weightKg: 10 }],
    remaining: [{ cargoId: 'A', quantity: 1, reason: '공간 부족' }], validationIssues: [], loadedWeightKg: 10, usedVolumeM3: 1 },
  recordedVerification: { status: 'passed', testedAt: '2026-10-09T00:00:00Z' },
});
const actor = '00000000-0000-4000-8000-000000000001';
const company = '00000000-0000-4000-8000-000000000002';
describe('company API JSON and actor boundary', () => {
  it('accepts conserved counts and preserves a declared zero top-load without modifying rules', () => {
    const snapshot = fixture(); expect(validCompanySnapshot(snapshot)).toBe(true); expect(snapshot.cargo[0].maxTopLoadKg).toBe(0);
    expect(validCompanySnapshot({ ...snapshot, result: undefined, recordedVerification: undefined })).toBe(false); // undefined is not JSON
    const draft = fixture() as Record<string, unknown>; delete draft.result; delete draft.recordedVerification;
    expect(validCompanySnapshot(draft)).toBe(true);
  });
  it.each(['quantity','foreign','duplicate','credential','negative','nonfinite','oversize','version'] as const)('blocks %s', kind => {
    const s = fixture();
    if (kind === 'quantity') s.result.remaining[0].quantity = 0;
    if (kind === 'foreign') s.result.placements[0].cargoId = 'OTHER';
    if (kind === 'duplicate') { s.result.placements.push(s.result.placements[0]); s.result.remaining = []; }
    if (kind === 'credential') Object.assign(s.container, { password: 'never-share' });
    if (kind === 'negative') s.cargo[0].weightKg = -1;
    if (kind === 'nonfinite') s.container.length = Infinity;
    if (kind === 'oversize') s.cargo[0].name = 'x'.repeat(501);
    if (kind === 'version') s.schemaVersion = 2;
    expect(validCompanySnapshot(s)).toBe(false);
  });
  it('uses authenticated actor and refuses caller hashes while preserving constraints', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: 'new' }, error: null });
    const hash = vi.fn().mockResolvedValue('b'.repeat(64));
    const r = await handleCompanyAction(actor, { op: 'save', companyId: company, title: '출하', snapshot: fixture(), p_actor: 'attacker', inviteHash: 'attacker' }, rpc, hash, () => 'a'.repeat(64));
    expect(r.status).toBe(200);
    expect(rpc.mock.calls[0][1]).toEqual({ p_actor: actor, p_op: 'save', p_payload: { companyId: company, title: '출하', snapshot: fixture() } });
  });
  it('hashes codes before storage and returns plaintext only for newly issued invitation', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { expiresAt: 'soon' }, error: null });
    const hash = vi.fn().mockResolvedValue('b'.repeat(64));
    const r = await handleCompanyAction(actor, { op: 'invite', companyId: company, email: 'staff@example.test', role: 'viewer', inviteHash: 'attacker' }, rpc, hash, () => 'a'.repeat(64));
    expect(r.body.data).toEqual({ expiresAt: 'soon', code: 'a'.repeat(64) });
    expect(rpc.mock.calls[0][1].p_payload.inviteHash).toBe('b'.repeat(64));
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('a'.repeat(64));
  });
  it('rejects invalid saves and versions before RPC; sanitizes infrastructure errors', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'private database detail' } });
    const hash = vi.fn();
    expect((await handleCompanyAction(actor, { op: 'submit', companyId: company, planId: actor }, rpc, hash, () => '')).status).toBe(400);
    expect((await handleCompanyAction(actor, { op: 'save', companyId: company, title: 'bad', snapshot: {} }, rpc, hash, () => '')).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    expect((await handleCompanyAction(actor, { op: 'detail', companyId: company }, rpc, hash, () => '')).body.error).toBe('company_unavailable');
  });
});
