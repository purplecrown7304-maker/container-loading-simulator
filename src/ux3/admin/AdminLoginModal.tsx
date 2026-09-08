import type { FormEvent } from 'react';
import Modal from '../shared/Modal';

type Props = {
  open: boolean;
  userId: string;
  password: string;
  busy: boolean;
  error: string;
  onUserId: (value: string) => void;
  onPassword: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
};

export default function AdminLoginModal({ open, userId, password, busy, error, onUserId, onPassword, onClose, onSubmit }: Props) {
  return <Modal open={open} title="관리자 로그인" onClose={onClose}>
    <form className="ux3-admin-form" onSubmit={onSubmit}>
      <p>관리자 모드에서는 장비 이미지 수정, 박스 마스터 신규/수정/삭제, Excel 등록 기능을 사용할 수 있습니다.</p>
      <label>관리자 ID<input autoComplete="username" value={userId} onChange={event => onUserId(event.target.value)} /></label>
      <label>비밀번호<input type="password" autoComplete="current-password" value={password} onChange={event => onPassword(event.target.value)} /></label>
      {error && <div className="ux3-form-error" role="alert">{error}</div>}
      <button type="submit" className="ux3-primary-button" disabled={busy}>{busy ? '확인 중…' : '로그인'}</button>
    </form>
  </Modal>;
}
