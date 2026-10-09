import { afterEach, describe, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({ token: null as string | null }));
vi.mock('../memberAuth', () => ({ readSupabaseMemberSessionToken: () => auth.token }));
import { companyRequest } from './api';
describe('company client session and setup errors', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it('exposes session expiration as a typed denial so the UI can immediately clear cached company data', async () => {
    auth.token = null; const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(companyRequest('detail')).rejects.toMatchObject({ code: 'member_auth_required' }); expect(fetch).not.toHaveBeenCalled();
  });
  it('reports an older backend honestly and preserves the authenticated company action', async () => {
    auth.token = 'synthetic-opaque-token';
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'unknown_action' }), { status: 400 })); vi.stubGlobal('fetch', fetch);
    await expect(companyRequest('list', { action: 'signup', op: 'fake' })).rejects.toMatchObject({ code: 'company_unavailable' });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ action: 'company', op: 'list' });
  });
});
