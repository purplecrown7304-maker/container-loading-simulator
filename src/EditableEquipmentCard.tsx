import { useEffect, useState, type ChangeEvent, type MouseEvent } from 'react';
import './equipment-image-editor.css';
import { ADMIN_ACCESS_EVENT, isAdminSession } from './adminAccess';
import {
  EQUIPMENT_IMAGE_OVERRIDES_UPDATED_EVENT,
  prepareEquipmentImage,
  refreshEquipmentImageOverrides,
  removeEquipmentImageOverride,
  setEquipmentImageOverride,
} from './equipmentImageOverrides';
import { resolveEquipmentImageUrl } from './equipmentImageUrl';
import type { TransportEquipment } from './transportEquipment';

type Props = {
  item: TransportEquipment;
  active: boolean;
  onSelect: (value: TransportEquipment) => void;
  onMessage?: (message: string) => void;
};

export default function EditableEquipmentCard({ item, active, onSelect, onMessage }: Props) {
  const [imageSrc, setImageSrc] = useState(() => resolveEquipmentImageUrl(item.id));
  const [imageFailed, setImageFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isAdmin, setIsAdmin] = useState(() => isAdminSession());

  useEffect(() => {
    let mounted = true;
    const sync = () => {
      if (!mounted) return;
      setImageFailed(false);
      setImageSrc(resolveEquipmentImageUrl(item.id, Date.now()));
    };

    void refreshEquipmentImageOverrides().then(sync);
    window.addEventListener(EQUIPMENT_IMAGE_OVERRIDES_UPDATED_EVENT, sync);
    return () => {
      mounted = false;
      window.removeEventListener(EQUIPMENT_IMAGE_OVERRIDES_UPDATED_EVENT, sync);
    };
  }, [item.id]);

  useEffect(() => {
    const sync = () => setIsAdmin(isAdminSession());
    window.addEventListener(ADMIN_ACCESS_EVENT, sync);
    return () => window.removeEventListener(ADMIN_ACCESS_EVENT, sync);
  }, []);

  const stopCardSelection = (event: MouseEvent<HTMLElement>) => event.stopPropagation();

  const changeImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !isAdminSession()) {
      if (file) onMessage?.('관리자 계정으로 로그인한 경우에만 장비 이미지를 수정할 수 있습니다.');
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await prepareEquipmentImage(file);
      const next = await setEquipmentImageOverride(item.id, dataUrl);
      setImageFailed(false);
      setImageSrc(next[item.id] ?? '');
      onMessage?.(`${item.shortName} 이미지를 Supabase 서버에 저장했습니다.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '이미지 변경에 실패했습니다.';
      onMessage?.(message);
    } finally {
      setBusy(false);
    }
  };

  const deleteImage = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!isAdminSession()) {
      onMessage?.('관리자 계정으로 로그인한 경우에만 장비 이미지를 삭제할 수 있습니다.');
      return;
    }
    setBusy(true);
    try {
      await removeEquipmentImageOverride(item.id);
      setImageSrc('');
      setImageFailed(false);
      onMessage?.(`${item.shortName} 이미지를 삭제했습니다.`);
    } catch (error) {
      onMessage?.(error instanceof Error ? error.message : '이미지 삭제에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const hasImage = Boolean(imageSrc && !imageFailed);

  return <div className="transport-equipment-card-wrap">
    <button
      type="button"
      data-category={item.category}
      data-equipment-id={item.id}
      className={`transport-equipment-card ${active ? 'active' : ''}`}
      onClick={() => onSelect(item)}
    >
      <span className="transport-equipment-card-name">{item.name}</span>
      {hasImage
        ? <span className="transport-equipment-user-image"><img src={imageSrc} alt={`${item.shortName} 적재공간`} draggable={false} onError={() => setImageFailed(true)} /></span>
        : <span className="transport-equipment-user-image" aria-hidden="true" />}
      <span className="transport-equipment-spec">{item.length.toFixed(2)} × {item.width.toFixed(2)} × {item.height.toFixed(2)} m</span>
      <span className="transport-equipment-payload">적재 {item.maxPayloadKg.toLocaleString()} kg</span>
    </button>
    {isAdmin && <div className="transport-equipment-image-actions" onClick={stopCardSelection}>
      <label className={`transport-image-edit ${busy ? 'busy' : ''}`} title={`${item.shortName} 이미지 변경`}>
        {busy ? '처리중…' : '이미지 수정'}
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={changeImage} disabled={busy} />
      </label>
      {hasImage && <button type="button" className="transport-image-reset" onClick={event => void deleteImage(event)} disabled={busy}>이미지 삭제</button>}
    </div>}
  </div>;
}
