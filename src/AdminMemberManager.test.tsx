import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminMemberManager from './AdminMemberManager';
import { ADMIN_ACCESS_EVENT } from './adminAccess';
import { AdminMemberApiError, listAdminMembers, updateAdminMember, type AdminMember } from './adminMemberApi';
import { setUiLanguage } from './uiLanguage';

const access = vi.hoisted(() => ({ admin: true }));
vi.mock('./adminAccess', () => ({ ADMIN_ACCESS_EVENT: 'test:admin-access', isAdminSession: () => access.admin }));
vi.mock('./adminMemberApi', () => ({
  AdminMemberApiError: class AdminMemberApiError extends Error { code: string; constructor(code: string) { super(code); this.code = code; } },
  listAdminMembers: vi.fn(), updateAdminMember: vi.fn(),
}));

const member: AdminMember = {
  id: 'member-1', email: 'kim@example.com', displayName: '김민수', status: 'active',
  createdAt: '2026-11-01T01:00:00Z', updatedAt: '2026-11-01T01:00:00Z', lastLoginAt: '2026-11-15T03:00:00Z',
};
const second: AdminMember = { ...member, id: 'member-2', email: 'lee@example.com', displayName: '이서연', status: 'suspended', lastLoginAt: null };
const page = (members: AdminMember[] = [member, second], total = members.length, number = 1) => ({ members, total, page: number, pageSize: 25 });
const list = vi.mocked(listAdminMembers);
const update = vi.mocked(updateAdminMember);
let root: Root;
let host: HTMLDivElement;
let opener: HTMLButtonElement;
let close: ReturnType<typeof vi.fn<() => void>>;
let expired: ReturnType<typeof vi.fn<() => void>>;

function button(text: string, scope: ParentNode = document) {
  const found = Array.from(scope.querySelectorAll<HTMLButtonElement>('button')).find(item => item.textContent?.trim() === text);
  expect(found, `button: ${text}`).toBeDefined();
  return found!;
}
const row = (id = member.id) => document.querySelector<HTMLTableRowElement>(`[data-member-id="${id}"]`)!;
async function render(open = true) { await act(async () => root.render(<AdminMemberManager open={open} onClose={close} onAuthExpired={expired} />)); }
async function click(element: HTMLElement) { await act(async () => element.click()); }
async function input(element: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function search(value: string) {
  await input(document.querySelector<HTMLInputElement>('.admin-members-search input')!, value);
  await act(async () => document.querySelector('form.admin-members-search')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function apiError(code: string): Error {
  return Object.assign(Object.setPrototypeOf(new Error(code), AdminMemberApiError.prototype), { code });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  access.admin = true; setUiLanguage('ko');
  list.mockReset(); update.mockReset(); list.mockResolvedValue(page());
  close = vi.fn(); expired = vi.fn();
  opener = document.createElement('button'); opener.textContent = 'Open members';
  host = document.createElement('div'); document.body.append(opener, host); opener.focus(); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren(); setUiLanguage('ko'); vi.unstubAllGlobals();
});

describe('admin member manager', () => {
  it('never requests or displays member data for a non-admin or a closed manager', async () => {
    access.admin = false;
    await render();
    expect(list).not.toHaveBeenCalled(); expect(document.querySelector('[role="dialog"]')).toBeNull();
    access.admin = true;
    await render(false);
    expect(list).not.toHaveBeenCalled();
  });

  it('lists members and only submits a search on Enter or the search action, with a status filter', async () => {
    await render();
    expect(list).toHaveBeenCalledWith({ q: '', status: 'all', page: 1 }, expect.any(AbortSignal));
    expect(document.body.textContent).toContain(member.email); expect(document.body.textContent).toContain('검색 결과 2명');
    expect(document.body.textContent).toContain('기록 없음');
    await input(document.querySelector<HTMLInputElement>('.admin-members-search input')!, 'kim');
    expect(list).toHaveBeenCalledTimes(1);
    list.mockResolvedValue(page([member]));
    await click(button('검색'));
    expect(list.mock.lastCall?.[0]).toEqual({ q: 'kim', status: 'all', page: 1 });
    await act(async () => {
      const select = document.querySelector<HTMLSelectElement>('.admin-members-status-filter select')!;
      select.value = 'active'; select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(list.mock.lastCall?.[0]).toEqual({ q: 'kim', status: 'active', page: 1 });
  });

  it('uses the server total and 25-member pages for next and previous', async () => {
    list.mockResolvedValueOnce(page([member], 26));
    await render();
    expect(button('이전').disabled).toBe(true); expect(button('다음').disabled).toBe(false);
    list.mockResolvedValueOnce(page([second], 26, 2));
    await click(button('다음'));
    expect(list.mock.lastCall?.[0].page).toBe(2); expect(document.body.textContent).toContain('2 / 2 페이지');
    expect(button('다음').disabled).toBe(true);
    list.mockResolvedValueOnce(page([member], 26));
    await click(button('이전'));
    expect(list.mock.lastCall?.[0].page).toBe(1);
  });

  it('aborts the old query and ignores a late response after a quicker search', async () => {
    const first = deferred<ReturnType<typeof page>>(), next = deferred<ReturnType<typeof page>>();
    list.mockReturnValueOnce(first.promise).mockReturnValueOnce(next.promise);
    await render();
    const oldSignal = list.mock.calls[0][1]!;
    await search('lee');
    expect(oldSignal.aborted).toBe(true);
    await act(async () => next.resolve(page([second])));
    await act(async () => first.resolve(page([member])));
    expect(document.body.textContent).toContain(second.email); expect(document.body.textContent).not.toContain(member.email);
  });

  it('saves a trimmed name with its original update revision and blocks duplicate mutations', async () => {
    const pending = deferred<AdminMember>();
    update.mockReturnValueOnce(pending.promise);
    await render(); await click(button('이름 수정', row()));
    await input(row().querySelector('input')!, '  김현수  ');
    await click(button('저장', row()));
    expect(update).toHaveBeenCalledWith({ memberId: member.id, displayName: '김현수', status: 'active', expectedUpdatedAt: member.updatedAt });
    expect(row().querySelector('input')!.disabled).toBe(true);
    expect(button('중지', row()).disabled).toBe(true);
    await act(async () => row().querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(update).toHaveBeenCalledTimes(1);
    const updated = { ...member, displayName: '김현수', updatedAt: '2026-11-16T01:00:00Z' };
    list.mockResolvedValue(page([updated, second]));
    await act(async () => pending.resolve(updated));
    expect(row().textContent).toContain('김현수'); expect(document.body.textContent).toContain('회원 이름을 저장했습니다.');
  });

  it('requires an explicit suspension confirmation naming the member and the session effect', async () => {
    await render(); await click(button('중지', row()));
    const confirmation = document.querySelector('.admin-members-confirmation')!;
    expect(confirmation.textContent).toContain(member.displayName); expect(confirmation.textContent).toContain(member.email);
    expect(confirmation.textContent).toContain('기존 로그인 세션도 종료됩니다.'); expect(update).not.toHaveBeenCalled();
    await click(button('취소', confirmation)); expect(update).not.toHaveBeenCalled();
    await click(button('중지', row()));
    const suspended = { ...member, status: 'suspended' as const, updatedAt: '2026-11-16T01:00:00Z' };
    update.mockResolvedValueOnce(suspended); list.mockResolvedValue(page([suspended, second]));
    await click(button('이용 중지하기'));
    expect(update.mock.lastCall?.[0]).toMatchObject({ memberId: member.id, displayName: member.displayName, status: 'suspended', expectedUpdatedAt: member.updatedAt });
    expect(document.querySelector('.admin-members-confirmation')).toBeNull(); expect(row().textContent).toContain('이용 중지');
  });

  it('confirms reactivation separately and preserves the current member name', async () => {
    await render(); await click(button('재개', row(second.id)));
    expect(document.querySelector('.admin-members-confirmation')!.textContent).toContain('다시 로그인할 수 있습니다.');
    expect(update).not.toHaveBeenCalled();
    const active = { ...second, status: 'active' as const, updatedAt: '2026-11-16T01:00:00Z' };
    update.mockResolvedValueOnce(active); list.mockResolvedValue(page([member, active]));
    await click(button('이용 재개하기'));
    expect(update.mock.lastCall?.[0]).toMatchObject({ memberId: second.id, displayName: second.displayName, status: 'active' });
  });

  it('preserves the old list on a refresh failure and permits a retry', async () => {
    await render();
    list.mockRejectedValueOnce(new Error('network failure'));
    await click(button('새로고침'));
    expect(document.body.textContent).toContain(member.email); expect(document.querySelector('[role="alert"]')!.textContent).toContain('불러오지 못했습니다');
    list.mockResolvedValueOnce(page([second])); await click(button('다시 시도'));
    expect(document.querySelector('[role="alert"]')).toBeNull(); expect(document.body.textContent).not.toContain(member.email);
  });

  it('keeps existing data and offers refresh after an optimistic revision conflict', async () => {
    await render(); await click(button('이름 수정', row())); await input(row().querySelector('input')!, '새 이름');
    update.mockRejectedValueOnce(apiError('admin_member_conflict'));
    await click(button('저장', row()));
    expect(document.querySelector('[role="alert"]')!.textContent).toContain('다른 관리자가 회원 정보를 변경했습니다.');
    expect(row().textContent).toContain(member.email); expect(row().querySelector('input')!.value).toBe('새 이름');
    expect(document.querySelector('.admin-members-notice')).toBeNull();
    await click(button('새로고침', document.querySelector('[role="alert"]')!));
    expect(row().textContent).toContain(member.displayName); expect(row().querySelector('input')).toBeNull();
  });

  it('expires access on an unauthorized list response without showing member data', async () => {
    list.mockRejectedValueOnce(apiError('admin_auth_required'));
    await render();
    expect(expired).toHaveBeenCalledTimes(1); expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(document.body.textContent).not.toContain(member.email);
  });

  it('expires access if the session lapses before a successful response arrives', async () => {
    const pending = deferred<ReturnType<typeof page>>(); list.mockReturnValueOnce(pending.promise);
    await render();
    access.admin = false;
    await act(async () => pending.resolve(page()));
    expect(expired).toHaveBeenCalledTimes(1); expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(document.body.textContent).not.toContain(member.email);
  });

  it('expires access on an unauthorized update and clears a previously displayed list', async () => {
    await render(); await click(button('중지', row()));
    update.mockRejectedValueOnce(apiError('admin_auth_required'));
    await click(button('이용 중지하기'));
    expect(expired).toHaveBeenCalledTimes(1); expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(document.body.textContent).not.toContain(member.email);
  });

  it('removes private data immediately on an admin logout event', async () => {
    await render(); expect(document.body.textContent).toContain(member.email);
    await act(async () => { access.admin = false; window.dispatchEvent(new Event(ADMIN_ACCESS_EVENT)); });
    expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(document.body.textContent).not.toContain(member.email); expect(expired).toHaveBeenCalledTimes(1);
  });

  it('traps keyboard focus, closes with Escape and restores the opener when hidden', async () => {
    await render();
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const closeButton = document.querySelector<HTMLButtonElement>('.admin-members-close')!;
    const items = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]'));
    const first = items[0], last = items[items.length - 1];
    expect(document.activeElement).toBe(closeButton);
    last.focus();
    await act(async () => last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(first);
    await act(async () => first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(last);
    await act(async () => last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(close).toHaveBeenCalledTimes(1);
    await render(false); expect(document.activeElement).toBe(opener);
  });

  it('aborts an in-flight list request on close and ignores its eventual response', async () => {
    const pending = deferred<ReturnType<typeof page>>(); list.mockReturnValueOnce(pending.promise);
    await render(); const signal = list.mock.calls[0][1]!;
    await render(false); expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(page()));
    expect(document.body.textContent).not.toContain(member.email); expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
