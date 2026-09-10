import { FormEvent, useEffect, useRef, useState } from 'react';
import { ADMIN_ACCESS_EVENT, isAdminSession, loginAdmin, logoutAdmin } from './adminAccess';
import { exportLoadingDiagnostics } from './diagnosticExport';
import { LOCAL_OPERATOR_EVENT, logoutLocalOperator, readLocalOperator, type LocalOperator } from './localOperator';
import {
  MEMBER_AUTH_EVENT,
  hasSupabaseMemberSession,
  loginMember,
  logoutMember,
  readSupabaseMember,
  restoreMemberSession,
  signUpMember,
} from './memberAuth';
import { OPEN_TRANSPORT_SELECTOR_EVENT, useTransportEquipment } from './transportEquipment';
import { dispatchAppAction, openWorkspace } from './uiEvents';
import './final-workflow-cleanup.css';
import './member-auth.css';

type LoginRole = 'member' | 'admin';
type MemberMode = 'login' | 'signup';

export default function ReferenceWorkspaceBar() {
  const equipment = useTransportEquipment();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginRole, setLoginRole] = useState<LoginRole>('member');
  const [memberMode, setMemberMode] = useState<MemberMode>('login');
  const [operator, setOperator] = useState<LocalOperator | null>(() => readSupabaseMember());
  const [isAdmin, setIsAdmin] = useState(() => isAdminSession());
  const [operatorName, setOperatorName] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [memberPassword, setMemberPassword] = useState('');
  const [adminId, setAdminId] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [loginMessage, setLoginMessage] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  const openEquipment = () => {
    setMenuOpen(false);
    window.dispatchEvent(new CustomEvent(OPEN_TRANSPORT_SELECTOR_EVENT, { detail: { category: equipment.category } }));
  };

  const runAndClose = (run: () => void) => {
    run();
    setMenuOpen(false);
  };

  const exportDiagnostics = async () => {
    setMenuOpen(false);
    const exported = await exportLoadingDiagnostics();
    if (!exported.ok) window.alert(exported.message);
  };

  useEffect(() => {
    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) setMenuOpen(false);
      if (accountRef.current && !accountRef.current.contains(target)) setAccountOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      setAccountOpen(false);
      setLoginOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, []);

  useEffect(() => {
    void restoreMemberSession().then(member => setOperator(member));
    const syncOperator = () => setOperator(readSupabaseMember());
    const syncAdmin = () => setIsAdmin(isAdminSession());
    window.addEventListener(LOCAL_OPERATOR_EVENT, syncOperator);
    window.addEventListener(MEMBER_AUTH_EVENT, syncOperator);
    window.addEventListener(ADMIN_ACCESS_EVENT, syncAdmin);
    return () => {
      window.removeEventListener(LOCAL_OPERATOR_EVENT, syncOperator);
      window.removeEventListener(MEMBER_AUTH_EVENT, syncOperator);
      window.removeEventListener(ADMIN_ACCESS_EVENT, syncAdmin);
    };
  }, []);

  const changeLoginRole = (role: LoginRole) => {
    setLoginRole(role);
    setLoginMessage('');
  };

  const openLogin = () => {
    const legacy = readLocalOperator();
    if (!hasSupabaseMemberSession() && legacy?.name) setOperatorName(legacy.name);
    setLoginRole('member');
    setMemberMode('login');
    setLoginMessage('');
    setMemberPassword('');
    setAdminPassword('');
    setLoginOpen(true);
    setMenuOpen(false);
  };

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault();
    if (loginBusy) return;
    setLoginBusy(true);

    try {
      if (loginRole === 'member') {
        const result = memberMode === 'signup'
          ? await signUpMember(operatorName, memberEmail, memberPassword)
          : await loginMember(memberEmail, memberPassword);
        if (!result.ok) {
          setLoginMessage(result.message || '회원 인증에 실패했습니다.');
          return;
        }
        if (!result.member) {
          setLoginMessage('회원 프로필을 불러오지 못했습니다.');
          return;
        }
        logoutAdmin();
        setIsAdmin(false);
        setOperator(result.member);
        setOperatorName('');
        setMemberPassword('');
        setLoginMessage('');
        setLoginOpen(false);
        return;
      }

      const ok = await loginAdmin(adminId, adminPassword);
      if (!ok) {
        setLoginMessage('관리자 ID 또는 비밀번호가 올바르지 않습니다.');
        return;
      }
      if (hasSupabaseMemberSession()) await logoutMember();
      else logoutLocalOperator();
      setOperator(null);
      setIsAdmin(true);
      setAdminPassword('');
      setLoginMessage('');
      setLoginOpen(false);
    } finally {
      setLoginBusy(false);
    }
  };

  const logout = () => {
    if (isAdmin) logoutAdmin();
    if (operator) void logoutMember();
    setIsAdmin(false);
    setOperator(null);
    setAccountOpen(false);
  };

  const accountName = isAdmin ? '관리자' : operator?.name ?? '';
  const accountInitial = isAdmin ? 'A' : operator?.name.slice(0, 1).toUpperCase() || 'M';
  const signedIn = isAdmin || Boolean(operator);
  const memberSubmitDisabled = memberMode === 'signup'
    ? !operatorName.trim() || !memberEmail.trim() || memberPassword.length < 8
    : !memberEmail.trim() || !memberPassword;

  return <>
    <header className="reference-utility clean-single-header">
      <button className="ref-brand ref-brand-button" type="button" onClick={() => dispatchAppAction('dashboard')} aria-label="대시보드로 이동">
        <span className="ref-logo">CL</span>
        <span className="ref-brand-text"><b>Container Loading Simulator</b><small>안전 적재 최적화</small></span>
      </button>

      <button className="header-equipment-pill" type="button" onClick={openEquipment} aria-label="현재 장비 변경">
        <span className="equipment-kicker">현재 장비</span>
        <b>{equipment.shortName}</b>
        <small>{equipment.length.toFixed(2)} × {equipment.width.toFixed(2)} × {equipment.height.toFixed(2)}m</small>
        <span aria-hidden="true">⌄</span>
      </button>

      <div className="header-right-actions">
        <div className="header-account-wrap" ref={accountRef}>
          {signedIn ? <>
            <button className="header-login-button signed-in" type="button" onClick={() => { setAccountOpen(v => !v); setMenuOpen(false); }} aria-expanded={accountOpen}>
              <span className="header-avatar">{accountInitial}</span><span className="header-user-name">{accountName}</span>
            </button>
            {accountOpen && <div className="header-account-menu" role="menu">
              <div className="account-summary"><b>{accountName}</b><small>{isAdmin ? '관리자 권한' : 'Supabase 회원'}</small></div>
              {!isAdmin && operator?.email && <div className="member-account-email">{operator.email}</div>}
              {!isAdmin && <button type="button" onClick={() => { openWorkspace('data'); setAccountOpen(false); }}>저장한 계획</button>}
              <button type="button" onClick={logout}>로그아웃</button>
            </div>}
          </> : <button className="header-login-button" type="button" onClick={openLogin}>로그인</button>}
        </div>

        <div className="header-menu-wrap" ref={menuRef}>
          <button className={`header-menu-button ${menuOpen ? 'active' : ''}`} type="button" onClick={() => { setMenuOpen(v => !v); setAccountOpen(false); }} aria-haspopup="menu" aria-expanded={menuOpen}>
            <span aria-hidden="true">☰</span> 메뉴
          </button>
          {menuOpen && <nav className="header-menu-panel final-workflow-menu" aria-label="적재 작업 전체 메뉴">
            <section>
              <strong>핵심 작업</strong>
              <button className="menu-primary" type="button" onClick={() => runAndClose(() => dispatchAppAction('run-loading'))}>
                <span>▶</span><div><b>최종 적재 진행</b><small>적재 계산 · 제약 · 물리 · 관성 검증을 순서대로 실행</small></div>
              </button>
              <button type="button" onClick={() => runAndClose(() => dispatchAppAction('show-results'))}>
                <span>◎</span><div><b>결과 확인</b><small>적재 · 미적재 · 무게분포 · 안전검사 결과 확인</small></div>
              </button>
              <button type="button" onClick={() => void exportDiagnostics()}>
                <span>⌁</span><div><b>점검 파일 내보내기</b><small>최종 배치 · 미적재 · 무게중심 · 물리/관성 결과를 ZIP으로 저장</small></div>
              </button>
              <button type="button" onClick={() => runAndClose(() => dispatchAppAction('print-report'))}>
                <span>▤</span><div><b>작업지시서 보기</b><small>최종 적재가 완료된 결과를 작업지시서로 확인</small></div>
              </button>
              <button type="button" onClick={() => runAndClose(() => dispatchAppAction('viewer'))}>
                <span>◫</span><div><b>3D 적재 보기</b><small>현재 적재 결과를 3D 시뮬레이터에서 확인</small></div>
              </button>
            </section>

            <section>
              <strong>작업 준비</strong>
              <button type="button" onClick={openEquipment}>
                <span>▥</span><div><b>컨테이너 · 차량 선택</b><small>현재 작업에 사용할 운송 장비를 직접 선택</small></div>
              </button>
              <button type="button" onClick={() => runAndClose(() => openWorkspace('boxes'))}>
                <span>□</span><div><b>박스 · 화물 선택</b><small>개인 등록 박스 선택, 수량 입력, 신규 박스 Excel 추가</small></div>
              </button>
              <button type="button" onClick={() => runAndClose(() => openWorkspace('safety'))}>
                <span>✓</span><div><b>안전 점검</b><small>규격 · 충돌 · 중량 · 미적재 상태 점검</small></div>
              </button>
            </section>

            <section>
              <strong>데이터 · 관리</strong>
              <button type="button" onClick={() => runAndClose(() => dispatchAppAction('save-local'))}>
                <span>↓</span><div><b>현재 작업 저장</b><small>현재 장비와 화물 계획을 브라우저에 저장</small></div>
              </button>
              <button type="button" onClick={() => runAndClose(() => dispatchAppAction('load-local'))}>
                <span>↑</span><div><b>저장 작업 불러오기</b><small>브라우저에 저장된 최근 작업 데이터 적용</small></div>
              </button>
              <button type="button" onClick={() => runAndClose(() => openWorkspace('data'))}>
                <span>▣</span><div><b>계획 관리</b><small>이름을 붙여 여러 작업 계획 저장 · 복원</small></div>
              </button>
              <button type="button" onClick={() => runAndClose(() => openWorkspace('vehicles'))}>
                <span>▰</span><div><b>차량 규격 관리</b><small>기본 차량과 사용자 차량 규격 관리</small></div>
              </button>
              <button className="final-menu-danger" type="button" onClick={() => runAndClose(() => dispatchAppAction('reset-all'))}>
                <span>↺</span><div><b>전체 초기화</b><small>현재 작업의 화물과 적재 결과를 초기화</small></div>
              </button>
            </section>
          </nav>}
        </div>
      </div>
    </header>

    {loginOpen && <div className="local-login-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setLoginOpen(false); }}>
      <form className="local-login-dialog unified-login-dialog" onSubmit={event => void submitLogin(event)} aria-label="로그인">
        <div className="local-login-head"><div><b>로그인</b><small>회원 또는 관리자 유형을 선택하세요.</small></div><button type="button" onClick={() => setLoginOpen(false)} aria-label="로그인 창 닫기">×</button></div>

        <div className={`login-segmented-control role-${loginRole}`} role="tablist" aria-label="로그인 유형">
          <span className="login-segment-slider" aria-hidden="true" />
          <button type="button" role="tab" aria-selected={loginRole === 'member'} className={loginRole === 'member' ? 'active' : ''} onClick={() => changeLoginRole('member')}>회원</button>
          <button type="button" role="tab" aria-selected={loginRole === 'admin'} className={loginRole === 'admin' ? 'active' : ''} onClick={() => changeLoginRole('admin')}>관리자</button>
        </div>

        {loginRole === 'member' ? <>
          <div className="member-auth-mode" role="tablist" aria-label="회원 인증 방식">
            <button type="button" className={memberMode === 'login' ? 'active' : ''} onClick={() => { setMemberMode('login'); setLoginMessage(''); }}>로그인</button>
            <button type="button" className={memberMode === 'signup' ? 'active' : ''} onClick={() => { setMemberMode('signup'); setLoginMessage(''); }}>회원가입</button>
          </div>
          {memberMode === 'signup' && <label>회원 이름<input autoFocus value={operatorName} onChange={event => setOperatorName(event.target.value)} placeholder="예: 박 작업자" maxLength={30} /></label>}
          <label>이메일<input type="email" autoFocus={memberMode === 'login'} autoComplete="email" value={memberEmail} onChange={event => setMemberEmail(event.target.value)} placeholder="name@example.com" /></label>
          <label>비밀번호<input type="password" autoComplete={memberMode === 'signup' ? 'new-password' : 'current-password'} value={memberPassword} onChange={event => setMemberPassword(event.target.value)} minLength={8} /></label>
          <p>{memberMode === 'signup' ? '회원정보는 이 적재 시스템 전용 Supabase 회원 DB에 저장됩니다. 기존 로컬 회원 데이터는 첫 로그인 때 새 계정 범위로 복사합니다.' : 'Supabase 회원 계정으로 로그인하면 같은 회원정보를 다른 기기에서도 사용할 수 있습니다.'}</p>
        </> : <>
          <label>관리자 ID<input autoComplete="username" value={adminId} onChange={event => setAdminId(event.target.value)} /></label>
          <label>비밀번호<input type="password" autoComplete="current-password" value={adminPassword} onChange={event => setAdminPassword(event.target.value)} autoFocus /></label>
          <p>관리자 로그인 시 관리자 전용 설정과 관리 기능을 사용할 수 있습니다.</p>
        </>}

        {loginMessage && <div className="unified-login-error" role="alert">{loginMessage}</div>}
        <button className="local-login-submit" type="submit" disabled={loginBusy || (loginRole === 'member' ? memberSubmitDisabled : !adminId.trim() || !adminPassword)}>
          {loginBusy ? '확인 중…' : loginRole === 'member' ? (memberMode === 'signup' ? '회원가입' : '회원 로그인') : '관리자 로그인'}
        </button>
      </form>
    </div>}
  </>;
}
