import { test, expect, type Page } from '@playwright/test';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, mkdirSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { handleCompanyAction } from '../supabase/functions/_shared/companyAction';

// Auth is a synthetic opaque-token adapter. Company authorization, validation,
// invitation hashing and persistence run through the production handler + SQL.
// This does not verify deployed Edge auth or multi-session PostgreSQL locking.
const members = ['Owner', 'Planner', 'Approver', 'Outsider'].map((name, i) => ({ id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, displayName: name, email: `${name.toLowerCase()}@example.test` }));
const snap = () => ({ schemaVersion: 1, mode: 'boxes', capturedAt: '2026-10-09T00:00:00Z', container: { length: 4, width: 2, height: 2, maxPayloadKg: 1000 }, cargo: [{ id: 'BOX', name: 'Synthetic carton', length: 1, width: 1, height: 1, weightKg: 10, quantity: 1 }], result: { placements: [{ unitId: 'BOX-1', cargoId: 'BOX', x: 0, y: 0, z: 0, length: 1, width: 1, height: 1, weightKg: 10 }], remaining: [], validationIssues: [], loadedWeightKg: 10, usedVolumeM3: 1 }, recordedVerification: { status: 'passed', testedAt: '2026-10-09T00:00:00Z' } });
let db: PGlite;
const replies: { op: string; data: any }[] = [];
async function api(actor: string, body: Record<string, unknown>) {
  return handleCompanyAction(actor, body, async (_name, args) => {
    try {
      const r = await db.query<{ data: unknown }>('select public.loading_company_action($1::uuid,$2::text,$3::jsonb) as data', [args.p_actor, args.p_op, JSON.stringify(args.p_payload)]);
      return { data: r.rows[0].data, error: null };
    } catch (e) { return { data: null, error: { message: (e as Error).message } }; }
  }, async code => createHash('sha256').update(code).digest('hex'), () => randomBytes(32).toString('hex'));
}
async function okApi(actor: string, body: Record<string, unknown>) {
  const r = await api(actor, body); expect(r.status).toBe(200); return (r.body as any).data;
}
async function install(page: Page) {
  const tokens = new Map<string, typeof members[number]>();
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (!url.pathname.endsWith('/functions/v1/container-member-api')) return route.abort();
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST,OPTIONS' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const body = req.postDataJSON();
    if (body.action === 'login') {
      const member = members.find(m => m.email === body.email);
      if (!member || body.password !== 'Synthetic-pass-123') return route.fulfill({ status: 401, headers, json: { error: 'invalid_credentials' } });
      const token = randomBytes(32).toString('hex'); tokens.set(token, member);
      return route.fulfill({ headers, json: { ok: true, token, expiresAt: new Date(Date.now() + 3600000).toISOString(), member } });
    }
    const token = req.headers().authorization?.replace(/^Bearer /, ''), member = token ? tokens.get(token) : undefined;
    if (!member) return route.fulfill({ status: 401, headers, json: { error: 'member_auth_required' } });
    if (body.action === 'logout') { tokens.delete(token!); return route.fulfill({ headers, json: { ok: true } }); }
    if (body.action === 'me') return route.fulfill({ headers, json: { ok: true, member } });
    if (body.action !== 'company') return route.fulfill({ status: 400, headers, json: { error: 'invalid_action' } });
    const result = await api(member.id, body); // Never derive actor from request JSON.
    replies.push({ op: body.op, data: (result.body as any).data });
    await route.fulfill({ status: result.status, headers, json: result.body });
  });
}
async function login(page: Page, index: number) {
  if (await page.getByRole('button', { name: '로그아웃', exact: true }).count()) await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await page.getByLabel('이메일', { exact: true }).fill(members[index].email);
  await page.getByLabel('비밀번호', { exact: true }).fill('Synthetic-pass-123');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
}
async function join(page: Page, code: string) {
  await page.getByLabel('초대코드', { exact: true }).fill(code);
  await page.getByRole('button', { name: '초대 수락', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Synthetic company', exact: true })).toBeVisible();
}

test.describe('company workspace through real SQL and handler', () => {
  test.setTimeout(60000);
  test.beforeEach(async ({ page }) => {
    replies.length = 0; db = new PGlite();
    await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create table loading_members(id uuid primary key,email text,display_name text,status text);grant usage on schema public to service_role;grant select on loading_members to service_role;');
    for (const m of members) await db.query("insert into loading_members values($1,$2,$3,'active')", [m.id,m.email,m.displayName]);
    await db.exec(readFileSync('supabase/migrations/20261009103147_loading_company_service.sql','utf8'));
    await db.exec('set role service_role'); await install(page);
  });
  test.afterEach(async () => { await db?.close(); });

  test('create, invite, accept, review, role change and revocation hide data', async ({ page, isMobile }) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('/workspace.html?view=company'); await login(page, 0);
    await page.getByLabel('기업 이름').fill('Synthetic company');
    await page.getByRole('button', { name: '기업 생성', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Synthetic company', exact: true })).toBeVisible();
    const companyId = replies.find(r => r.op === 'create')!.data.id;
    await page.getByLabel('가입된 직원 이메일').fill(members[1].email);
    await page.getByLabel('초대할 역할').selectOption('planner');
    await page.getByRole('button', { name: '초대코드 발급' }).click();
    const code = page.locator('.company-invite-result code'); await expect(code).toHaveText(/^[a-f0-9]{64}$/);
    const plannerCode = (await code.textContent())!;
    const reviewInvite = await okApi(members[0].id, { op:'invite', companyId, email:members[2].email, role:'approver' });
    await login(page, 1); await join(page, plannerCode);
    // Standalone has no capture callback; initial load is seeded only through real save API.
    const plan = await okApi(members[1].id, { op:'save', companyId, title:'Synthetic shipment', snapshot:snap() });
    await page.getByRole('button', { name:'새로고침', exact:true }).click();
    await page.getByRole('button', { name:/Synthetic shipment/ }).click();
    await expect(page.getByRole('button', { name:'현재 적재안을 새 계획으로 저장' })).toHaveCount(0);
    await page.getByRole('button', { name:'승인 검토 제출' }).click();
    await expect(page.getByRole('button', { name:/Synthetic shipment.*검토 대기/ })).toBeVisible();
    await login(page, 2); await join(page, reviewInvite.code);
    await page.getByRole('button', { name:/Synthetic shipment/ }).click();
    await page.getByLabel('검토 의견 · 수정 요청 시 필수').fill('Synthetic correction');
    await page.getByRole('button', { name:'수정 요청', exact:true }).click();
    await expect(page.getByRole('button', { name:/Synthetic shipment.*수정 요청/ })).toBeVisible();
    await login(page, 1); await page.getByRole('button', { name:/Synthetic shipment/ }).click();
    await page.getByRole('button', { name:'승인 검토 제출' }).click();
    await expect(page.getByRole('button', { name:/Synthetic shipment.*검토 대기/ })).toBeVisible();
    await login(page, 2); await page.getByRole('button', { name:/Synthetic shipment/ }).click();
    await page.getByRole('button', { name:'업무 검토 승인', exact:true }).click();
    await expect(page.getByRole('button', { name:/Synthetic shipment.*승인/ })).toBeVisible();
    const persisted = await okApi(members[0].id, { op:'plan', companyId, planId:plan.id });
    expect(persisted).toMatchObject({ status:'approved', revision:5 });
    await page.getByText('저장된 배치 순서와 미적재 사유', { exact:true }).click();
    await expect(page.getByRole('region', { name:'저장된 배치 좌표 표' }).getByText('Synthetic carton')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    mkdirSync('test-results', { recursive:true });
    await page.screenshot({ path:`test-results/company-workspace-${isMobile ? 'mobile' : 'desktop'}.png`, fullPage:true });
    await login(page, 0);
    await page.getByLabel('Planner 역할', { exact:true }).selectOption('viewer');
    await expect(page.getByLabel('Planner 역할', { exact:true })).toHaveValue('viewer');
    await login(page, 1); await page.getByRole('button', { name:/Synthetic shipment/ }).click();
    await expect(page.getByRole('button', { name:'승인 검토 제출' })).toHaveCount(0);
    await okApi(members[0].id, { op:'role', companyId, memberId:members[1].id, role:'removed' });
    await page.getByRole('button', { name:'새로고침', exact:true }).click();
    await expect(page.getByRole('alert')).toContainText('권한이 없거나 소속이 해제');
    await expect(page.getByRole('button', { name:/Synthetic shipment/ })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('20-row pages omit snapshots and outsiders cannot spoof an actor', async ({ page }) => {
    const company = await okApi(members[0].id, { op:'create', name:'Synthetic company' });
    for(let i=0;i<21;i++) await okApi(members[0].id, { op:'save', companyId:company.id, title:`Plan ${String(i).padStart(2,'0')}`, snapshot:snap() });
    await page.goto('/workspace.html?view=company'); await login(page, 0);
    await expect(page.locator('.company-plan-list > li')).toHaveCount(20);
    const first = replies.filter(r=>r.op==='detail').at(-1)!.data;
    expect(first.hasMorePlans).toBe(true); expect(first.plans.every((p:any)=>!('snapshot' in p))).toBe(true);
    await page.getByRole('button', { name:'다음 페이지' }).click();
    await expect(page.locator('.company-plan-list > li')).toHaveCount(1);
    await page.locator('.company-plan-list button').click();
    await expect(page.getByText('품목별 입력 수량', { exact:true })).toBeVisible();
    const tail = replies.filter(r=>r.op==='detail').at(-1)!.data;
    expect(tail).toMatchObject({ planOffset:20, hasMorePlans:false });
    expect(replies.filter(r=>r.op==='plan').at(-1)!.data.snapshot).toEqual(snap());
    await login(page, 3);
    const denied = await page.evaluate(async ({ companyId, actorId }) => {
      const session=JSON.parse(sessionStorage.getItem('container-loading:supabase-member-session:v2')!);
      const r=await fetch('https://oyxhaeccuuradutspcik.supabase.co/functions/v1/container-member-api',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.token}`},body:JSON.stringify({action:'company',op:'detail',companyId,actorId,p_actor:actorId})});
      return {status:r.status,body:await r.json()};
    }, {companyId:company.id,actorId:members[0].id});
    expect(denied).toEqual({status:403,body:{error:'company_forbidden'}});
  });
});
