import type { CargoItem } from '../../engine/types';
import Modal from '../shared/Modal';

export type CargoDraft = Omit<CargoItem, 'id'> & { id: string };

type Props = {
  open: boolean;
  editingId: string | null;
  draft: CargoDraft;
  onClose: () => void;
  onDraft: (field: keyof CargoDraft, value: string | boolean) => void;
  onSave: () => void;
};

export const EMPTY_CARGO_DRAFT: CargoDraft = {
  id: '', name: '', length: 0.5, width: 0.4, height: 0.3,
  weightKg: 10, quantity: 0, maxStackLayers: 7, maxTopLoadKg: 100, allowRotation: true,
};

export default function CargoEditorModal({ open, editingId, draft, onClose, onDraft, onSave }: Props) {
  return <Modal open={open} title={editingId ? '박스 마스터 수정' : '박스 마스터 신규 등록'} size="md" onClose={onClose}>
    <div className="ux3-cargo-editor">
      <label>코드<input value={draft.id} disabled={Boolean(editingId)} onChange={event => onDraft('id', event.target.value)} /></label>
      <label>이름<input value={draft.name} onChange={event => onDraft('name', event.target.value)} /></label>
      <div className="ux3-form-grid">
        <label>길이(m)<input type="number" min="0.01" step="0.01" value={draft.length} onChange={event => onDraft('length', event.target.value)} /></label>
        <label>폭(m)<input type="number" min="0.01" step="0.01" value={draft.width} onChange={event => onDraft('width', event.target.value)} /></label>
        <label>높이(m)<input type="number" min="0.01" step="0.01" value={draft.height} onChange={event => onDraft('height', event.target.value)} /></label>
        <label>중량(kg)<input type="number" min="0.01" step="0.01" value={draft.weightKg} onChange={event => onDraft('weightKg', event.target.value)} /></label>
        <label>기본 수량<input type="number" min="0" step="1" value={draft.quantity} onChange={event => onDraft('quantity', event.target.value)} /></label>
        <label>최대 적층단<input type="number" min="1" step="1" value={draft.maxStackLayers ?? 1} onChange={event => onDraft('maxStackLayers', event.target.value)} /></label>
        <label>상부 허용중량(kg)<input type="number" min="0" step="0.1" value={draft.maxTopLoadKg ?? ''} placeholder="제한 없음" onChange={event => onDraft('maxTopLoadKg', event.target.value)} /></label>
        <label className="ux3-checkbox"><input type="checkbox" checked={draft.allowRotation !== false} onChange={event => onDraft('allowRotation', event.target.checked)} /> 회전 허용</label>
      </div>
      <div className="ux3-modal-actions"><button type="button" className="ux3-secondary-button" onClick={onClose}>취소</button><button type="button" className="ux3-primary-button" onClick={onSave}>{editingId ? '수정 저장' : '등록'}</button></div>
    </div>
  </Modal>;
}
