import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ReferenceWorkspaceBar from './ReferenceWorkspaceBar';
import { setUiLanguage } from './uiLanguage';

vi.mock('./AdminMemberManager', () => ({ default: ({ onClose }: { onClose: () => void }) =>
  <div role="dialog" aria-label="member manager test"><button onClick={onClose}>close manager test</button></div> }));
vi.mock('./memberAuth', () => ({ MEMBER_AUTH_EVENT: 'test-member-auth', restoreMemberSession: () => Promise.resolve(null),
  hasSupabaseMemberSession: () => false, readSupabaseMember: () => null, loginMember: vi.fn(), signUpMember: vi.fn(), logoutMember: vi.fn() }));
let root: Root; let host: HTMLDivElement;
const key = 'container-loading-admin-session-v1';
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  setUiLanguage('ko'); sessionStorage.clear(); localStorage.clear();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); sessionStorage.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function admin(ttl = 60_000) {
  sessionStorage.setItem(key, JSON.stringify({ role: 'admin', userId: 'admin', sessionToken: 'a'.repeat(64), expiresAt: new Date(Date.now()+ttl).toISOString() }));
}
const click = async (element: HTMLElement) => { await act(async () => element.click()); };
const button = (text: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find(e => e.textContent?.trim() === text)!;
async function render() { await act(async () => root.render(<ReferenceWorkspaceBar />)); }

it('keeps both account and main menu member-management entries hidden from ordinary users', async () => {
  await render(); await click(host.querySelector('.header-menu-button')!);
  expect(button('회원 관리')).toBeUndefined(); expect(host.querySelector('.header-login-button')?.textContent).toBe('로그인');
});
it('opens member management from the administrator account menu', async () => {
  admin(); await render(); await click(host.querySelector('.header-login-button')!);
  await click(button('회원 관리'));
  expect(host.querySelector('[aria-label="member manager test"]')).not.toBeNull();
  expect(host.querySelector('.header-account-menu')).toBeNull();
});
it('opens member management from the administrator main menu', async () => {
  admin(); await render(); await click(host.querySelector('.header-menu-button')!);
  await click([...host.querySelectorAll<HTMLButtonElement>('button')].find(e => e.querySelector('b')?.textContent === '회원 관리')!);
  expect(host.querySelector('[aria-label="member manager test"]')).not.toBeNull();
  expect(host.querySelector('.header-menu-panel')).toBeNull();
});
it('clears an open management screen on expiry and offers administrator reauthentication', async () => {
  vi.useFakeTimers(); admin(1000); await render(); await click(host.querySelector('.header-login-button')!); await click(button('회원 관리'));
  await act(async () => { await vi.advanceTimersByTimeAsync(1051); });
  expect(host.querySelector('[aria-label="member manager test"]')).toBeNull();
  expect(host.textContent).toContain('관리자 로그인이 만료되었습니다. 다시 로그인하세요.');
  expect(host.querySelector('.login-segmented-control.role-admin')).not.toBeNull();
  expect(sessionStorage.getItem(key)).toBeNull();
});
it('handles a stale administrator menu click even while the browser expiry timer is throttled', async () => {
  vi.useFakeTimers(); admin(1000); await render(); await click(host.querySelector('.header-login-button')!);
  vi.setSystemTime(Date.now()+2000);
  await click(button('회원 관리'));
  expect(host.querySelector('[aria-label="member manager test"]')).toBeNull();
  expect(host.textContent).toContain('관리자 로그인이 만료되었습니다. 다시 로그인하세요.');
});
