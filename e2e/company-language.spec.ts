import { test, expect, type Page } from '@playwright/test';
import type { CompanyDetail, Plan } from '../src/company/types';

// All authentication/company responses are synthetic. Never write to a live API.
const member = { id: 'synthetic-owner', displayName: '내 한국어 이름', email: 'owner@example.test' };
const date = '2026-10-09T10:23:00Z';
const plan: Plan = {
  id: 'synthetic-plan', title: '공유 계획 한국어', status: 'submitted', revision: 2,
  created_by: 'synthetic-planner', submitted_by: 'synthetic-planner', updated_at: date,
  snapshot: { schemaVersion: 1, mode: 'boxes', capturedAt: date,
    container: { length: 6, width: 2, height: 2, maxPayloadKg: 5000 },
    cargo: [{ id: 'A', name: '중량 제한', length: 1, width: 1, height: 1, weightKg: 10, quantity: 3 }],
    result: { placements: [{ cargoId: 'A', unitId: 'A-1', x: 0, y: 0, z: 0, length: 1, width: 1, height: 1, weightKg: 10 }],
      remaining: [{ cargoId: 'A', quantity: 1, reason: '컨테이너 최대 적재중량에 도달했습니다.' }, { cargoId: 'A', quantity: 1, reason: 'CUSTOM 진단 원문' }],
      validationIssues: [], loadedWeightKg: 10, usedVolumeM3: 1 },
    recordedVerification: { status: 'passed', testedAt: date } },
};
const detail: CompanyDetail = {
  space: { id: 'synthetic-company', name: '기업 이름 한국어', role: 'owner' },
  members: [{ member_id: member.id, display_name: member.displayName, role: 'owner' }, { member_id: 'synthetic-planner', display_name: '직원 한국어', role: 'planner' }],
  plans: [plan], events: [{ id: 'synthetic-event', plan_id: plan.id, action: 'plan_saved', actor_name: '직원 한국어', created_at: date, comment: '계획 저장' }],
  planOffset: 0, hasMorePlans: false,
};
async function install(page: Page) {
  const requests: Record<string, unknown>[] = [];
  await page.route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (!url.pathname.endsWith('/functions/v1/container-member-api')) return route.abort();
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST,OPTIONS' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const body = request.postDataJSON(); requests.push(body);
    if (body.action === 'login') return route.fulfill({ headers, json: { ok: true, token: 'synthetic-opaque-token', expiresAt: new Date(Date.now() + 3600000).toISOString(), member } });
    if (body.action === 'me') return route.fulfill({ headers, json: { ok: true, member } });
    if (body.action === 'company' && ['list', 'detail', 'plan'].includes(body.op)) {
      const data = body.op === 'list' ? { spaces: [detail.space] } : body.op === 'detail' ? detail : plan;
      return route.fulfill({ headers, json: { ok: true, data } });
    }
    return route.fulfill({ status: 400, headers, json: { error: 'unexpected_test_action' } });
  });
  return requests;
}
const languages = [
  { id: 'ko', title: 'Load Studio · 기업 작업 공간', heading: '함께 준비하는 출하 계획', reason: '컨테이너 최대 적재중량에 도달했습니다.', approve: '업무 검토 승인', saved: '계획 저장' },
  { id: 'en', title: 'Load Studio · Company workspace', heading: 'Plan shipments together', reason: 'Container payload limit reached.', approve: 'Approve business review', saved: 'Plan saved' },
  { id: 'vi', title: 'Load Studio · Không gian doanh nghiệp', heading: 'Cùng lập kế hoạch xuất hàng', reason: 'Đã đạt giới hạn tải trọng container.', approve: 'Phê duyệt công việc', saved: 'Đã lưu kế hoạch' },
];

test('standalone KO → EN → VI preserves typed member fields and restores the saved display language', async ({ page }) => {
  const requests = await install(page);
  await page.goto('/workspace.html?view=company');
  await expect(page.getByRole('heading', { name: '회원 로그인', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '새 회원 계정 만들기', exact: true }).click();
  await page.getByLabel('이름', { exact: true }).fill('한국어 입력 이름');
  await page.getByLabel('이메일', { exact: true }).fill('typed@example.test');
  await page.getByLabel('비밀번호', { exact: true }).fill('Synthetic-password-123');
  for (const language of languages) {
    await page.locator(`button[lang="${language.id}"]`).click();
    await expect(page.locator('html')).toHaveAttribute('lang', language.id);
    await expect(page).toHaveTitle(language.title);
    await expect(page.getByRole('heading', { name: language.heading, exact: true })).toBeVisible();
    await expect(page.locator('input[autocomplete="name"]')).toHaveValue('한국어 입력 이름');
    await expect(page.locator('input[type="email"]')).toHaveValue('typed@example.test');
    await expect(page.locator('input[type="password"]')).toHaveValue('Synthetic-password-123');
    if (language.id !== 'ko') expect(await page.locator('.company-auth').textContent()).not.toMatch(/[가-힣]/);
  }
  expect(requests).toEqual([]);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await expect(page).toHaveTitle(languages[2].title);
  await expect(page.getByRole('heading', { name: languages[2].heading, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('shared plan diagnostics translate live while company, cargo, comments and approval eligibility remain unchanged', async ({ page }) => {
  const requests = await install(page); const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/workspace.html?view=company');
  await page.getByLabel('이메일', { exact: true }).fill(member.email);
  await page.getByLabel('비밀번호', { exact: true }).fill('Synthetic-password-123');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await page.locator('.company-plan-list button').click();
  await page.locator('.company-work-order summary').click();
  await page.locator('.company-review textarea').fill('검토 의견 한국어');
  await page.locator('.company-invite input[type="email"]').fill('invited@example.test');
  const initialRequests = requests.length;
  for (const language of languages) {
    await page.locator(`button[lang="${language.id}"]`).click();
    await expect(page).toHaveTitle(language.title);
    await expect(page.locator('.company-work-order')).toContainText(language.reason);
    await expect(page.locator('.company-work-order')).toContainText('CUSTOM 진단 원문');
    await expect(page.locator('.company-work-order tbody')).toContainText('중량 제한');
    await expect(page.locator('.company-overview h2')).toHaveText('기업 이름 한국어');
    await expect(page.locator('.company-title-row h3')).toHaveText('공유 계획 한국어');
    await expect(page.locator('.company-status')).toHaveClass(/submitted/);
    await expect(page.locator('.company-event-list > li > div > b')).toHaveText(language.saved);
    await expect(page.locator('.company-event-list p')).toHaveText('계획 저장');
    await expect(page.locator('.company-review textarea')).toHaveValue('검토 의견 한국어');
    await expect(page.locator('.company-invite input[type="email"]')).toHaveValue('invited@example.test');
    await expect(page.locator('.company-member-list select')).toHaveValue('planner');
    await expect(page.getByRole('button', { name: language.approve, exact: true })).toBeEnabled();
    await expect(page.locator('.company-save')).toHaveCount(0); // Standalone cannot capture simulator inputs.
  }
  expect(requests.length).toBe(initialRequests);
  expect(requests.filter(body => body.action === 'company').every(body => ['list', 'detail', 'plan'].includes(String(body.op)))).toBe(true);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
