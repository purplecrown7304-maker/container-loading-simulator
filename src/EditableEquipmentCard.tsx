import { useEffect, useState, type ChangeEvent, type MouseEvent } from 'react';
import EquipmentCard3D from './EquipmentCard3D';
import './equipment-image-editor.css';
import { ADMIN_ACCESS_EVENT, isAdminSession } from './adminAccess';
import {
  EQUIPMENT_IMAGE_OVERRIDES_UPDATED_EVENT,
  prepareEquipmentImage,
  readEquipmentImageOverrides,
  removeEquipmentImageOverride,
  setEquipmentImageOverride,
} from './equipmentImageOverrides';
import type { EquipmentGeometry, TransportEquipment } from './transportEquipment';

type Props = {
  item: TransportEquipment;
  active: boolean;
  onSelect: (value: TransportEquipment) => void;
  onMessage?: (message: string) => void;
};

function EquipmentIcon({ geometry }: { geometry: EquipmentGeometry }) {
  return <svg viewBox="0 0 200 100" aria-hidden="true">
    <path d="M72 28h105v48H72z" className="eq-fill"/>
    <path d="M23 52l18-25h31v49H23z" className="eq-fill"/>
    <path d="M23 52h49V27H41L23 52zm49-24h105v48H72V28z" className="eq-line"/>
    <circle cx="52" cy="78" r="9" className="eq-wheel"/>
    <circle cx="151" cy="78" r="9" className="eq-wheel"/>
    <circle cx="52" cy="78" r="4" className="eq-fill"/>
    <circle cx="151" cy="78" r="4" className="eq-fill"/>
    {geometry === 'reefer-truck' && <text x="120" y="58" className="eq-snow">❄</text>}
    {geometry === 'jumbo-truck' && <path d="M121 28v48" className="eq-line"/>}
  </svg>;
}

function DefaultVisual({ item }: { item: TransportEquipment }) {
  if (item.category === 'container') return <EquipmentCard3D item={item} />;
  return <EquipmentIcon geometry={item.geometry} />;
}

export default function EditableEquipmentCard({ item, active, onSelect, onMessage }: Props) {
  const [imageSrc, setImageSrc] = useState(() => readEquipmentImageOverrides()[item.id] ?? '');
  const [busy, setBusy] = useState(false);
  const [isAdmin, setIsAdmin] = useState(() => isAdminSession());

  useEffect(() => {
    const sync = () => setImageSrc(readEquipmentImageOverrides()[item.id] ?? '');
    window.addEventListener(EQUIPMENT_IMAGE_OVERRIDES_UPDATED_EVENT, sync);
    return () => window.removeEventListener(EQUIPMENT_IMAGE_OVERRIDES_UPDATED_EVENT, sync);
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
      setEquipmentImageOverride(item.id, dataUrl);
      setImageSrc(dataUrl);
      onMessage?.(`${item.shortName} 이미지를 변경했습니다. 이 브라우저에 저장됩니다.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '이미지 변경에 실패했습니다.';
      onMessage?.(message);
    } finally {
      setBusy(false);
    }
  };

  const resetImage = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!isAdminSession()) {
      onMessage?.('관리자 계정으로 로그인한 경우에만 장비 이미지를 복원할 수 있습니다.');
      return;
    }
    removeEquipmentImageOverride(item.id);
    setImageSrc('');
    onMessage?.(`${item.shortName} 이미지를 기본 이미지로 복원했습니다.`);
  };

  return <div className="transport-equipment-card-wrap">
    <button
      type="button"
      data-category={item.category}
      data-equipment-id={item.id}
      className={`transport-equipment-card ${active ? 'active' : ''}`}
      onClick={() => onSelect(item)}
    >
      <span className="transport-equipment-card-name">{item.name}</span>
      {imageSrc ? <span className="transport-equipment-user-image"><img src={imageSrc} alt="" draggable={false} /></span> : <DefaultVisual item={item} />}
      <span className="transport-equipment-spec">{item.length.toFixed(2)} × {item.width.toFixed(2)} × {item.height.toFixed(2)} m</span>
      <span className="transport-equipment-payload">적재 {item.maxPayloadKg.toLocaleString()} kg</span>
    </button>
    {isAdmin && <div className="transport-equipment-image-actions" onClick={stopCardSelection}>
      <label className={`transport-image-edit ${busy ? 'busy' : ''}`} title={`${item.shortName} 이미지 변경`}>
        {busy ? '처리중…' : '이미지 수정'}
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={changeImage} disabled={busy} />
      </label>
      {imageSrc && <button type="button" className="transport-image-reset" onClick={resetImage}>원본</button>}
    </div>}
  </div>;
}
