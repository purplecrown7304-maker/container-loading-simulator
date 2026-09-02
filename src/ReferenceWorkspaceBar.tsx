import { FormEvent, useEffect, useRef, useState } from 'react';
import { OPEN_TRANSPORT_SELECTOR_EVENT, useTransportEquipment } from './transportEquipment';
import { dispatchAppAction, openWorkspace } from './uiEvents';
import './final-workflow-cleanup.css';

const LOCAL_SESSION_KEY = 'container-loading-local-operator-v1';

type LocalOperator = { name: string };

function readLocalOperator(): LocalOperator | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_SESSION_KEY) || 'null') as LocalOperator | null;
    return parsed?.name?.trim() ? { name: parsed.name.trim() } : null;
  } catch {
    return null;
  }
}

export default function ReferenceWorkspaceBar() {
  const equipment = useTransportEquipment();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [operator, setOperator] = useState<LocalOperator | null>(() => readLocalOperator());
  const [operatorName, setOperatorName] = useState('');
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

  const submitLocalLogin = (event: FormEvent) => {
    event.preventDefault();
    const name = operatorName.trim();
    if (!name) return;
    const next = { name };
    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(next));
    setOperator(next);
    setOperatorName('');
    setLoginOpen(false);
  };

  const logout = () => {
    localStorage.removeItem(LOCAL_SESSION_KEY);
    setOperator(null);
    setAccountOpen(false);
  };

  const operatorInitial = operator?.name.slice(0, 1).toUpperCase() || 'L';

  return <>
    <header className="reference-utility clean-single-header">
      <button className="ref-brand ref-brand-button" type="button" onClick={() => dispatchAppAction('dashboard')} aria-label="대시보드로 이동">
        <span className="ref-logo">CL</span>
        <span className="ref-brand-text">
          <b>Container Loading Simulator</b>
          <small>안전 적재 최적화</small>
        </span>
      </button>

      <button className="header-equipment-pill" type="button" onClick={openEquipment} aria-label="현재 장비 변경">
        <span className="equipment-kicker">현재 장비</span>
        <b>{equipment.shortName}</b>
        <small>{equipment.length.toFixed(2)} × {equipment.width.toFixed(2)} × {equipment.height.toFixed(2)}m</small>
        <span aria-hidden="true">⌄</span>
      </button>

      <div className="header-right-actions">
        <div className="header-account-wrap" ref={accountRef}>
          {operator ? <>
            <button className="header-login-button signed-in" type="button" onClick={() => { setAccountOpen(v => !v); setMenuOpen(false); }} aria-expanded={accountOpen}>
              <span className="header-avatar">{operatorInitial}</span>
              <span className="header-user-name">{operator.name}</span>
            </button>
            {accountOpen && <div className="header-account-menu" role="menu">
              <div className="account-summary"><b>{operator.name}</b><small>이 기기 작업자</small></div>
              <button type="button" onClick={() => { openWorkspace('data'); setAccountOpen(false); }}>저장한 계획</button>
              <button type="button" onClick={logout}>로그아웃</button>
            </div>}
          </> : <button className="header-login-button" type="button" onClick={() => { setLoginOpen(true); setMenuOpen(false); }}>로그인</button>}
        </div>

        <div className="header-menu-wrap" ref={menuRef}>
          <button className={`header-menu-button ${menuOpen ? 'active' : ''}`} type="button" onClick={() => { setMenuOpen(v => !v); setAccountOpen(false); }} aria-haspopup="menu" aria-expanded={menuOpen}>
            <span aria-hidden="true">☰</span> 메뉴
          </button>
          {menuOpen && <nav className="header-menu-panel final-workflow-menu" aria-label="최종 적재 작업 메뉴">
            <section>
              <strong>최종 작업</strong>
              <button className="menu-primary" type="button" onClick={() => runAndClose(() => dispatchAppAction('run-loading'))}>
                <span>▶</span>
                <div><b>최종 적재 진행</b><small>적재 계산 → 제약 조건 → 물리 검증 → 관성 3종 순서로 실행</small></div>
              </button>
              <button type="button" onClick={() => runAndClose(() => dispatchAppAction('print-report'))}>
                <span>▤</span>
                <div><b>작업지시서 발급</b><small>최종 검사 결과를 기준으로 작업지시서를 생성</small></div>
              </button>
              <button className="final-menu-danger" type="button" onClick={() => runAndClose(() => dispatchAppAction('reset-all'))}>
                <span>↺</span>
                <div><b>전체 초기화</b><small>현재 화물과 적재 결과를 모두 초기화</small></div>
              </button>
            </section>
          </nav>}
        </div>
      </div>
    </header>

    {loginOpen && <div className="local-login-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setLoginOpen(false); }}>
      <form className="local-login-dialog" onSubmit={submitLocalLogin} aria-label="작업자 로그인">
        <div className="local-login-head"><div><b>작업자 로그인</b><small>이 기기에서 사용할 작업자 이름을 표시합니다.</small></div><button type="button" onClick={() => setLoginOpen(false)} aria-label="로그인 창 닫기">×</button></div>
        <label>작업자 이름<input autoFocus value={operatorName} onChange={event => setOperatorName(event.target.value)} placeholder="예: 박 작업자" maxLength={30} /></label>
        <p>현재 로그인은 브라우저 로컬 작업자 표시용입니다. 서버 계정 인증이나 권한 관리를 대신하지 않습니다.</p>
        <button className="local-login-submit" type="submit" disabled={!operatorName.trim()}>로그인</button>
      </form>
    </div>}
  </>;
}
