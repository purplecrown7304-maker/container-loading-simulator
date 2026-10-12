// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CompanyDetail, CompanyRole, Plan, Snapshot } from './types';
const mocks = vi.hoisted(() => ({ member: { id: 'me', name: '내 한국어 이름' } as { id: string; name: string } | null, request: vi.fn(), login: vi.fn(), signup: vi.fn() }));
vi.mock('../memberAuth', () => ({ readSupabaseMember: () => mocks.member, MEMBER_AUTH_EVENT: 'test-member-auth', loginMember: mocks.login, signUpMember: mocks.signup, logoutMember: vi.fn() }));
vi.mock('./api', () => ({ companyRequest: mocks.request }));
import CompanyWorkspace from './CompanyWorkspace';
import { uiMessagesCompany } from '../uiMessagesCompany';
import { uiMessages } from '../uiMessages';
import { setUiLanguage, uiText, uiLocale, type UiLanguage } from '../uiLanguage';

let root: Root; let host: HTMLDivElement; let plan: Plan; let detail: CompanyDetail;
const date = '2026-10-09T10:23:00Z';
const custom = { company: '기업 이름 한국어', plan: '계획 제목 한국어', product: '중량 제한', staff: '직원 한국어', comment: '계획 저장' };
function snapshot(): Snapshot {
  return { schemaVersion: 1, mode: 'boxes', capturedAt: date,
    container: { length: 6, width: 2, height: 2, maxPayloadKg: 5000 },
    cargo: [{ id: 'A', name: custom.product, length: 1, width: 1, height: 1, weightKg: 10, quantity: 3 }],
    result: { placements: [{ cargoId: 'A', unitId: 'A-1', x: 0, y: 0, z: 0, length: 1, width: 1, height: 1, weightKg: 10 }],
      remaining: [{ cargoId: 'A', quantity: 1, reason: '컨테이너 최대 적재중량에 도달했습니다.' }, { cargoId: 'A', quantity: 1, reason: 'CUSTOM 진단 원문' }],
      validationIssues: [], loadedWeightKg: 10, usedVolumeM3: 1 },
    recordedVerification: { status: 'passed', testedAt: date } };
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  setUiLanguage('ko'); vi.clearAllMocks();
  mocks.member = { id: 'me', name: '내 한국어 이름' };
  plan = { id: 'plan', title: custom.plan, status: 'draft', revision: 2, snapshot: snapshot(), created_by: 'other', submitted_by: 'other', updated_at: date };
  detail = { space: { id: 'company', name: custom.company, role: 'owner' },
    members: [{ member_id: 'me', display_name: '내 한국어 이름', role: 'owner' }, { member_id: 'other', display_name: custom.staff, role: 'planner' }],
    plans: [plan], events: [{ id: 'event', plan_id: plan.id, action: 'plan_saved', actor_name: custom.staff, created_at: date, comment: custom.comment }], planOffset: 0, hasMorePlans: false };
  mocks.request.mockImplementation(async (op: string) => op === 'list' ? { spaces: [detail.space] } : op === 'detail' ? detail : op === 'save' ? { ...plan, revision: 3 } : plan);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); setUiLanguage('ko'); vi.restoreAllMocks(); });
function button(source: string) { return [...host.querySelectorAll('button')].find(item => item.textContent === uiText(source)); }
async function renderPlan(props: Parameters<typeof CompanyWorkspace>[0] = {}) {
  await act(async () => root.render(<CompanyWorkspace {...props} />));
  await act(async () => host.querySelector<HTMLButtonElement>('.company-plan-list button')!.click());
}

it.each(['ko', 'en', 'vi'] as UiLanguage[])('translates shared plans, diagnostics and dates without modifying user content in %s', async language => {
  setUiLanguage(language); const original = JSON.stringify({ plan, detail });
  await renderPlan({ onCapture: snapshot, onLoad: vi.fn() });
  for (const value of Object.values(custom)) expect(host.textContent).toContain(value);
  for (const key of ['함께 준비하는 출하 계획', '소유자', '작성 중', '직원과 권한', '감사 이력', '계획 저장', '저장 시 검사 기록', '컨테이너 최대 적재중량에 도달했습니다.']) expect(host.textContent).toContain(uiText(key));
  expect(host.textContent).toContain('CUSTOM 진단 원문');
  expect(host.textContent).toContain(new Date(date).toLocaleString(uiLocale(), { dateStyle: 'short', timeStyle: 'short' }));
  expect(host.querySelector<HTMLInputElement>('.company-save input')!.value).toBe(custom.plan);
  expect(host.querySelector('select[aria-label]')!.getAttribute('aria-label')).toBe(uiText('{0} 역할', [custom.staff]));
  expect(JSON.stringify({ plan, detail })).toBe(original);
  let presentation = host.textContent!;
  for (const value of [...Object.values(custom), '내 한국어 이름', 'CUSTOM 진단 원문']) presentation = presentation.replaceAll(value, '');
  if (language !== 'ko') expect(presentation).not.toMatch(/[가-힣]/);
});

it('updates already visible errors, notices, title and controls during live switches without resetting fields', async () => {
  mocks.member = null;
  await act(async () => root.render(<CompanyWorkspace standalone />));
  expect(document.title).toBe('Load Studio · 기업 작업 공간');
  await act(async () => button('새 회원 계정 만들기')!.click());
  const input = host.querySelector<HTMLInputElement>('input[autocomplete="name"]')!;
  // Native setter bypasses React's value tracker so the synthetic input represents real typing.
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, custom.staff); input.dispatchEvent(new Event('input', { bubbles: true })); });
  mocks.signup.mockResolvedValue({ ok: false, message: '회원 이름을 확인하세요.' });
  await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(host.querySelector('[role="alert"]')!.textContent).toBe('회원 이름을 확인하세요.');
  for (const language of ['en', 'vi', 'ko'] as UiLanguage[]) {
    await act(async () => host.querySelector<HTMLButtonElement>(`button[lang="${language}"]`)!.click());
    expect(input.value).toBe(custom.staff);
    expect(host.querySelector('[role="alert"]')!.textContent).toBe(uiText('회원 이름을 확인하세요.'));
    expect(document.documentElement.lang).toBe(language); expect(document.title).toBe(uiText('Load Studio · 기업 작업 공간'));
  }
});

it('saves canonical snapshots and localizes success notices after later language switches', async () => {
  const captured = snapshot(); const capture = vi.fn(() => captured);
  await renderPlan({ onCapture: capture });
  await act(async () => button('현재 적재안을 새 계획으로 저장')!.click());
  expect(mocks.request).toHaveBeenCalledWith('save', { companyId: 'company', title: custom.plan, snapshot: captured });
  expect(host.querySelector('[role="status"]')?.textContent).toBe('계획을 저장했습니다. 버전 3');
  const callCount = mocks.request.mock.calls.length;
  for (const language of ['en', 'vi'] as UiLanguage[]) {
    await act(async () => setUiLanguage(language));
    expect(host.querySelector('[role="status"]')?.textContent).toBe(uiText('계획을 저장했습니다. 버전 {0}', [3]));
    expect(mocks.request.mock.calls.length).toBe(callCount);
  }
  expect(capture).toHaveBeenCalledOnce(); expect(captured).toEqual(snapshot());
});

it.each(['owner', 'admin', 'planner', 'approver', 'viewer'] as CompanyRole[])('preserves %s permissions through every display language', async role => {
  detail.space.role = role;
  await renderPlan({ onCapture: snapshot });
  for (const language of ['ko', 'en', 'vi'] as UiLanguage[]) {
    await act(async () => setUiLanguage(language));
    expect(Boolean(button('현재 적재안을 새 계획으로 저장'))).toBe(['owner', 'admin', 'planner'].includes(role));
    expect(Boolean(button('초대코드 발급'))).toBe(['owner', 'admin'].includes(role));
    expect(Boolean(button('승인 검토 제출'))).toBe(['owner', 'admin', 'planner'].includes(role));
    expect(host.querySelectorAll('select[aria-label]').length).toBe(['owner', 'admin'].includes(role) ? 1 : 0);
  }
  expect(mocks.request.mock.calls.every(([op]) => ['list', 'detail', 'plan'].includes(op))).toBe(true);
});

it.each(['ready', 'what-if', 'mismatch', 'empty', 'constraint', 'no-record', 'failed', 'self-review'] as const)('preserves approval safety gates for %s through live language switches', async scenario => {
  plan.status = 'submitted';
  if (scenario === 'what-if') plan.snapshot.container.limitReview = { mode: 'what-if', maxPayloadKg: 9999 };
  if (scenario === 'mismatch') plan.snapshot.cargo[0].quantity++;
  if (scenario === 'empty') plan.snapshot.result!.placements = [];
  if (scenario === 'constraint') plan.snapshot.result!.validationIssues.push({ type: 'PAYLOAD', placementIndexes: [], message: '컨테이너 최대 적재중량에 도달했습니다.' });
  if (scenario === 'no-record') delete plan.snapshot.recordedVerification;
  if (scenario === 'failed') plan.snapshot.recordedVerification!.status = 'failed';
  if (scenario === 'self-review') plan.submitted_by = 'me';
  const original = JSON.stringify(plan);
  await renderPlan();
  for (const language of ['ko', 'en', 'vi'] as UiLanguage[]) {
    await act(async () => setUiLanguage(language));
    expect(button('업무 검토 승인')!.disabled).toBe(scenario !== 'ready');
    expect(host.querySelector<HTMLTextAreaElement>('textarea')!.disabled).toBe(scenario === 'self-review');
    expect(JSON.stringify(plan)).toBe(original);
  }
  expect(mocks.request.mock.calls.some(([op]) => ['save', 'submit', 'review'].includes(op))).toBe(false);
});

it('clears protected company data on denial and keeps its displayed error reactive', async () => {
  await renderPlan();
  mocks.request.mockRejectedValueOnce(Object.assign(new Error('이 회사에 대한 권한이 없거나 소속이 해제되었습니다.'), { code: 'company_forbidden' }));
  await act(async () => button('새로고침')!.click());
  expect(host.textContent).not.toContain(custom.company); expect(host.textContent).not.toContain(custom.plan);
  for (const language of ['en', 'vi'] as UiLanguage[]) {
    await act(async () => setUiLanguage(language));
    expect(host.querySelector('[role="alert"]')!.textContent).toContain(uiText('이 회사에 대한 권한이 없거나 소속이 해제되었습니다.'));
    expect(host.querySelector('.company-plan-list')).toBeNull();
  }
});

it('covers all built-in company and authentication error messages with EN/VI translations', () => {
  for (const file of ['CompanyWorkspace.tsx', 'CompanyServiceHost.tsx', 'api.ts', 'simulationSnapshot.ts', '../memberAuth.ts']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    for (const match of source.matchAll(/(['"])([^'"\n]*[가-힣][^'"\n]*)\1/g)) {
      const key = match[2];
      for (const language of ['en', 'vi'] as UiLanguage[]) expect(uiText(key, [], language), key).not.toMatch(/[가-힣]/);
    }
  }
});


it('registers explicit company UI templates and preserves every translated placeholder', () => {
  for (const file of ['CompanyWorkspace.tsx', 'CompanyServiceHost.tsx', 'entry.tsx']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    for (const match of source.matchAll(/\b(?:uiText|uiT)\(\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g)) {
      const key = Function(`"use strict"; return (${match[1]});`)() as string;
      expect(uiMessages[key] ?? uiMessages[key.trim()], `${file}: ${key}`).toBeDefined();
    }
  }
  const placeholders = (value: string) => [...value.matchAll(/\{\d+\}/g)].map(match => match[0]).sort();
  for (const [key, values] of Object.entries(uiMessagesCompany)) for (const value of values) {
    expect(value, key).not.toMatch(/[가-힣]/); expect(value.trim(), key).not.toBe('');
    expect(placeholders(value), key).toEqual(placeholders(key));
  }
});
