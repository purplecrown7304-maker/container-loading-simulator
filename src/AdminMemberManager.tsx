import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { ADMIN_ACCESS_EVENT, isAdminSession } from './adminAccess';
import { AdminMemberApiError, listAdminMembers, updateAdminMember, type AdminMember } from './adminMemberApi';
import { uiText, uiMessage, uiLocale, useUiLanguage } from './uiLanguage';
import './admin-member-manager.css';

type Props = { open: boolean; onClose: () => void; onAuthExpired: () => void };
type MemberStatus = 'active' | 'suspended';
type Query = { q: string; status: 'all' | MemberStatus; page: number };
type MemberPage = { members: AdminMember[]; total: number; page: number; pageSize: number };
type Confirmation = { member: AdminMember; status: MemberStatus };

function errorText(error: unknown, loading: boolean): string {
  if (error instanceof AdminMemberApiError) {
    if (error.code === 'admin_member_conflict') return '다른 관리자가 회원 정보를 변경했습니다. 새로고침 후 다시 시도하세요.';
    if (error.code === 'admin_member_not_found') return '회원 정보를 찾을 수 없습니다. 새로고침 후 다시 확인하세요.';
    if (error.code === 'invalid_display_name') return '이름을 1~60자로 입력하세요.';
    if (error.code === 'invalid_member_status') return '회원 상태가 올바르지 않습니다.';
    if (error.code === 'invalid_member_id' || error.code === 'invalid_request') return '관리자 요청을 확인할 수 없습니다. 새로고침 후 다시 시도하세요.';
  }
  return loading ? '회원 목록을 불러오지 못했습니다. 다시 시도하세요.' : '회원 정보를 저장하지 못했습니다. 다시 시도하세요.';
}

function memberDate(value: string | null, locale: string): string {
  if (!value) return uiText('기록 없음');
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return uiText('기록 없음');
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
}

export default function AdminMemberManager({ open, onClose, onAuthExpired }: Props) {
  const language = useUiLanguage();
  const id = useId();
  const [allowed, setAllowed] = useState(() => isAdminSession());
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState<Query>({ q: '', status: 'all', page: 1 });
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<MemberPage | null>(null);
  const [loading, setLoading] = useState(() => open && isAdminSession());
  const [listError, setListError] = useState('');
  const [mutationError, setMutationError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<{ member: AdminMember; name: string } | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [saving, setSaving] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const cancelConfirmation = useRef<HTMLButtonElement>(null);
  const callbacks = useRef({ onClose, onAuthExpired, open });
  callbacks.current = { onClose, onAuthExpired, open };
  const saveInFlight = useRef(false);
  const mounted = useRef(false);
  const lifecycle = useRef(0);
  const expiredReported = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const expireAccess = useCallback(() => {
    setAllowed(false);
    setData(null);
    setEditing(null);
    setConfirmation(null);
    setListError('');
    setMutationError('');
    lifecycle.current++;
    if (!expiredReported.current && callbacks.current.open) {
      expiredReported.current = true;
      callbacks.current.onAuthExpired();
    }
  }, []);

  useEffect(() => {
    const sync = () => {
      if (!isAdminSession()) { expireAccess(); return; }
      expiredReported.current = false;
      setAllowed(true);
    };
    window.addEventListener(ADMIN_ACCESS_EVENT, sync);
    return () => window.removeEventListener(ADMIN_ACCESS_EVENT, sync);
  }, [expireAccess]);

  useEffect(() => {
    lifecycle.current++;
    setSaving(saveInFlight.current);
    if (open) expiredReported.current = false;
    else {
      setData(null);
      setEditing(null);
      setConfirmation(null);
      setListError('');
      setMutationError('');
      setNotice('');
    }
    return () => { lifecycle.current++; };
  }, [open, allowed]);

  useEffect(() => {
    if (!open || !allowed || !isAdminSession()) return;
    const controller = new AbortController();
    let current = true;
    setLoading(true);
    setListError('');
    void listAdminMembers(query, controller.signal).then(result => {
      if (!current || controller.signal.aborted) return;
      if (!isAdminSession()) { expireAccess(); return; }
      setData(result);
    }).catch((error: unknown) => {
      if (!current || controller.signal.aborted) return;
      if (error instanceof AdminMemberApiError && error.code === 'admin_auth_required') { expireAccess(); return; }
      setListError(errorText(error, true));
    }).finally(() => {
      if (current && !controller.signal.aborted) setLoading(false);
    });
    return () => { current = false; controller.abort(); };
  }, [open, allowed, query, reload, expireAccess]);

  useEffect(() => {
    if (!open || !allowed || !isAdminSession()) return;
    const element = dialog.current;
    if (!element) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element.querySelector<HTMLButtonElement>('.admin-members-close')?.focus();
    const focusable = () => Array.from(element.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]'))
      .filter(item => !item.closest('[hidden]') && item.getAttribute('aria-hidden') !== 'true');
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); callbacks.current.onClose(); return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable(), first = items[0], last = items[items.length - 1];
      if (!first) { event.preventDefault(); element.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !element.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !element.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (opener?.isConnected && !opener.matches(':disabled') && !opener.closest('[hidden]')) opener.focus();
    };
  }, [open, allowed]);

  useEffect(() => {
    if (!confirmation) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelConfirmation.current?.focus();
    return () => { if (opener?.isConnected && !opener.matches(':disabled')) opener.focus(); };
  }, [confirmation]);

  const refresh = () => {
    if (saveInFlight.current) return;
    setEditing(null); setConfirmation(null); setMutationError(''); setNotice(''); setReload(value => value + 1);
  };
  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    if (saveInFlight.current || confirmation) return;
    setEditing(null); setMutationError(''); setNotice('');
    setQuery(current => ({ ...current, q: search.trim(), page: 1 }));
  };
  const saveMember = async (member: AdminMember, displayName: string, status: MemberStatus, nameOnly: boolean) => {
    if (saveInFlight.current || !open || !allowed) return;
    if (!isAdminSession()) { expireAccess(); return; }
    const name = displayName.trim();
    if (!name || name.length > 60) { setMutationError('이름을 1~60자로 입력하세요.'); return; }
    saveInFlight.current = true;
    const version = lifecycle.current;
    setSaving(true); setMutationError(''); setNotice('');
    try {
      const updated = await updateAdminMember({ memberId: member.id, displayName: name, status, expectedUpdatedAt: member.updatedAt });
      if (version !== lifecycle.current || !callbacks.current.open) return;
      if (!isAdminSession()) { expireAccess(); return; }
      const removed = query.status !== 'all' && query.status !== updated.status;
      setData(current => current ? {
        ...current,
        members: current.members.flatMap(item => item.id !== updated.id ? [item] : removed ? [] : [updated]),
        total: current.total - (removed && current.members.some(item => item.id === updated.id) ? 1 : 0),
      } : current);
      setEditing(null); setConfirmation(null);
      setNotice(nameOnly ? '회원 이름을 저장했습니다.' : status === 'suspended' ? '회원 이용을 중지했습니다. 기존 로그인 세션이 종료됩니다.' : '회원 이용을 재개했습니다.');
      if (removed && data?.members.length === 1 && query.page > 1) setQuery(current => ({ ...current, page: current.page - 1 }));
      else setReload(value => value + 1);
    } catch (error) {
      if (version !== lifecycle.current || !callbacks.current.open) return;
      if (error instanceof AdminMemberApiError && error.code === 'admin_auth_required') { expireAccess(); return; }
      setMutationError(errorText(error, false));
    } finally {
      saveInFlight.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  if (!open || !allowed || !isAdminSession()) return null;
  const locked = saving || Boolean(confirmation);
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 25)));
  const shownPage = data?.page ?? query.page;
  const locale = uiLocale(language);

  return createPortal(<div className="admin-members-backdrop" onPointerDown={event => {
    if (event.target === event.currentTarget) callbacks.current.onClose();
  }}>
    <div ref={dialog} className="admin-members-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} tabIndex={-1}>
      <header className="admin-members-header">
        <div><h2 id={`${id}-title`}>{uiText('회원 관리')}</h2><p id={`${id}-description`}>{uiText('가입 회원의 이름과 이용 상태를 관리합니다.')}</p></div>
        <div className="admin-members-header-actions"><button type="button" onClick={refresh} disabled={loading || saving}>{uiText('새로고침')}</button><button type="button" className="admin-members-close" aria-label={uiText('회원 관리 닫기')} onClick={onClose}>{uiText('닫기')}</button></div>
      </header>
      <div className="admin-members-body">
        <form className="admin-members-search" onSubmit={submitSearch}>
          <label className="admin-members-search-field">{uiText('회원 검색')}<input type="search" value={search} maxLength={100} placeholder={uiText('이름 또는 이메일')} onChange={event => setSearch(event.target.value)} disabled={locked} /></label>
          <button type="submit" className="admin-members-primary" disabled={locked}>{uiText('검색')}</button>
          <label className="admin-members-status-filter">{uiText('회원 상태')}<select value={query.status} disabled={locked} onChange={event => {
            setEditing(null); setMutationError(''); setNotice('');
            setQuery(current => ({ ...current, status: event.target.value as Query['status'], page: 1 }));
          }}><option value="all">{uiText('전체')}</option><option value="active">{uiText('이용 가능')}</option><option value="suspended">{uiText('이용 중지')}</option></select></label>
        </form>
        <div className="admin-members-count"><span>{uiText('검색 결과 {0}명', [data?.total ?? 0])}</span><small>{uiText('페이지당 {0}명', [data?.pageSize ?? 25])}</small></div>
        {listError && <div className="admin-members-error" role="alert"><span>{uiMessage(listError)}</span><button type="button" onClick={refresh} disabled={saving}>{uiText('다시 시도')}</button></div>}
        {mutationError && <div className="admin-members-error" role="alert"><span>{uiMessage(mutationError)}</span><button type="button" onClick={refresh} disabled={saving}>{uiText('새로고침')}</button></div>}
        {notice && <p className="admin-members-notice" role="status">{uiMessage(notice)}</p>}
        {loading && <p className="admin-members-loading" role="status">{uiText('회원 목록을 불러오는 중…')}</p>}
        <div className="admin-members-table-wrap" role="region" aria-label={uiText('회원 목록')} tabIndex={0} aria-busy={loading}>
          <table className="admin-members-table"><thead><tr>{['이름', '이메일', '상태', '가입일', '최근 로그인', '작업'].map(label => <th scope="col" key={label}>{uiText(label)}</th>)}</tr></thead>
            <tbody>{data?.members.map(member => <tr key={member.id} data-member-id={member.id}>
              <td>{editing?.member.id === member.id ? <form className="admin-members-name-form" aria-label={uiText('회원 이름 수정')} onSubmit={event => { event.preventDefault(); void saveMember(editing.member, editing.name, editing.member.status, true); }}>
                <input aria-label={uiText('{0} 회원 이름', [member.displayName])} value={editing.name} maxLength={60} autoComplete="off" disabled={saving} onChange={event => setEditing(current => current ? { ...current, name: event.target.value } : null)} autoFocus />
                <div><button className="admin-members-primary" type="submit" disabled={saving || !editing.name.trim()}>{uiText(saving ? '저장 중…' : '저장')}</button><button type="button" onClick={() => { setEditing(null); setMutationError(''); }} disabled={saving}>{uiText('취소')}</button></div>
              </form> : <strong>{member.displayName}</strong>}</td>
              <td className="admin-members-email">{member.email}</td><td><span className={`admin-members-status ${member.status}`}>{uiText(member.status === 'active' ? '이용 가능' : '이용 중지')}</span></td>
              <td><time dateTime={member.createdAt}>{memberDate(member.createdAt, locale)}</time></td><td>{member.lastLoginAt ? <time dateTime={member.lastLoginAt}>{memberDate(member.lastLoginAt, locale)}</time> : uiText('기록 없음')}</td>
              <td><div className="admin-members-row-actions" role="group" aria-label={uiText('{0} 회원 작업', [member.displayName])}><button type="button" disabled={loading || locked || Boolean(editing)} onClick={() => { setMutationError(''); setNotice(''); setEditing({ member, name: member.displayName }); }}>{uiText('이름 수정')}</button><button type="button" className={member.status === 'active' ? 'admin-members-suspend' : ''} disabled={loading || locked || Boolean(editing)} onClick={() => { setMutationError(''); setNotice(''); setConfirmation({ member, status: member.status === 'active' ? 'suspended' : 'active' }); }}>{uiText(member.status === 'active' ? '중지' : '재개')}</button></div></td>
            </tr>)}</tbody>
          </table>
          {!loading && !listError && !data?.members.length && <div className="admin-members-empty">{uiText(query.q || query.status !== 'all' ? '검색 조건에 맞는 회원이 없습니다.' : '등록된 회원이 없습니다.')}</div>}
        </div>
        {confirmation && <section className="admin-members-confirmation" aria-labelledby={`${id}-confirm-title`} aria-describedby={`${id}-confirm-description`}>
          <h3 id={`${id}-confirm-title`}>{uiText(confirmation.status === 'suspended' ? '이용 중지 확인' : '이용 재개 확인')}</h3>
          <p id={`${id}-confirm-question`}>{uiText(confirmation.status === 'suspended' ? '{0} 회원의 이용을 중지할까요?' : '{0} 회원의 이용을 재개할까요?', [confirmation.member.displayName])}</p><p id={`${id}-confirm-email`} className="admin-members-confirm-email">{confirmation.member.email}</p>
          <p id={`${id}-confirm-description`}>{uiText(confirmation.status === 'suspended' ? '이용을 중지하면 로그인할 수 없고 기존 로그인 세션도 종료됩니다.' : '이용을 재개하면 회원이 다시 로그인할 수 있습니다.')}</p>
          <div><button ref={cancelConfirmation} type="button" aria-describedby={`${id}-confirm-question ${id}-confirm-email ${id}-confirm-description`} onClick={() => { setConfirmation(null); setMutationError(''); }} disabled={saving}>{uiText('취소')}</button><button type="button" className={confirmation.status === 'suspended' ? 'admin-members-danger' : 'admin-members-primary'} disabled={saving} onClick={() => void saveMember(confirmation.member, confirmation.member.displayName, confirmation.status, false)}>{uiText(saving ? '저장 중…' : confirmation.status === 'suspended' ? '이용 중지하기' : '이용 재개하기')}</button></div>
        </section>}
      </div>
      <footer className="admin-members-footer"><span>{uiText('{0} / {1} 페이지', [shownPage, pages])}</span><div><button type="button" disabled={loading || locked || shownPage <= 1} onClick={() => { setEditing(null); setQuery(current => ({ ...current, page: Math.max(1, shownPage - 1) })); }}>{uiText('이전')}</button><button type="button" disabled={loading || locked || shownPage >= pages} onClick={() => { setEditing(null); setQuery(current => ({ ...current, page: shownPage + 1 })); }}>{uiText('다음')}</button></div></footer>
    </div>
  </div>, document.body);
}
