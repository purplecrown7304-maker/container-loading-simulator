import { FormEvent, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ADMIN_ACCESS_EVENT, isAdminSession, loginAdmin, logoutAdmin } from './adminAccess';
import './admin-access.css';

export default function AdminAccessControl() {
  const [isAdmin, setIsAdmin] = useState(() => isAdminSession());
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState('admin');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sync = () => setIsAdmin(isAdminSession());
    window.addEventListener(ADMIN_ACCESS_EVENT, sync);
    return () => window.removeEventListener(ADMIN_ACCESS_EVENT, sync);
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const ok = await loginAdmin(userId, password);
      if (!ok) {
        setMessage('관리자 ID 또는 비밀번호가 올바르지 않습니다.');
        return;
      }
      setMessage('');
      setPassword('');
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const logout = () => {
    logoutAdmin();
    setOpen(false);
    setPassword('');
  };

  return <>
    <div className={`admin-access-chip ${isAdmin ? 'active' : ''}`}>
      {isAdmin ? <>
        <span>관리자 로그인</span>
        <button type="button" onClick={logout}>로그아웃</button>
      </> : <button type="button" onClick={() => { setMessage(''); setOpen(true); }}>관리자 로그인</button>}
    </div>
    {open && createPortal(
      <div className="admin-login-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
        <form className="admin-login-dialog" onSubmit={submit}>
          <header><div><span>ADMIN ACCESS</span><h2>관리자 로그인</h2></div><button type="button" onClick={() => setOpen(false)}>닫기</button></header>
          <p>장비 이미지 수정 등 관리자 전용 기능을 사용하려면 로그인하세요.</p>
          <label>관리자 ID<input autoComplete="username" value={userId} onChange={event => setUserId(event.target.value)} /></label>
          <label>비밀번호<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} autoFocus /></label>
          {message && <div className="admin-login-error" role="alert">{message}</div>}
          <button className="admin-login-submit" type="submit" disabled={busy}>{busy ? '확인 중…' : '로그인'}</button>
          <small>관리자 세션은 현재 브라우저 탭을 닫으면 자동 해제됩니다.</small>
        </form>
      </div>,
      document.body,
    )}
  </>;
}
