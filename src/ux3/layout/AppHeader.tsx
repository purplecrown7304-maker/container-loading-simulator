type Props = {
  adminMode: boolean;
  onLoad: () => void;
  onSave: () => void;
  onAdminLogin: () => void;
  onAdminLogout: () => void;
};

export default function AppHeader({ adminMode, onLoad, onSave, onAdminLogin, onAdminLogout }: Props) {
  return <header className="ux3-header">
    <div className="ux3-brand">
      <span className="ux3-brand-mark">CL</span>
      <div><strong>컨테이너 적재 시뮬레이터</strong><small>장비 → 화물 → 자동 적재 → 결과</small></div>
    </div>
    <div className="ux3-header-actions">
      <button type="button" className="ux3-secondary-button" onClick={onLoad}>불러오기</button>
      <button type="button" className="ux3-secondary-button" onClick={onSave}>저장</button>
      {adminMode
        ? <button type="button" className="ux3-secondary-button" onClick={onAdminLogout}>관리자 로그아웃</button>
        : <button type="button" className="ux3-secondary-button" onClick={onAdminLogin}>관리자</button>}
    </div>
  </header>;
}
