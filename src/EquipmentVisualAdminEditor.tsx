import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ADMIN_ACCESS_EVENT, isAdminSession } from './adminAccess';
import { equipmentAtlasBackgroundStyle } from './EquipmentCard3D';
import {
  EQUIPMENT_IMAGE_OVERRIDES_UPDATED_EVENT,
  migrateLegacyEquipmentImagesToServer,
  prepareEquipmentImage,
  readEquipmentImageOverrides,
  refreshEquipmentImageOverrides,
  removeEquipmentImageOverride,
  setEquipmentImageOverride,
} from './equipmentImageOverrides';
import { TRANSPORT_EQUIPMENT_EVENT, useTransportEquipment } from './transportEquipment';

export default function EquipmentVisualAdminEditor() {
  const equipment = useTransportEquipment();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isAdmin, setIsAdmin] = useState(() => isAdminSession());
  const [visualHost, setVisualHost] = useState<HTMLButtonElement | null>(null);
  const [toolbarHost, setToolbarHost] = useState<HTMLElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState(() => readEquipmentImageOverrides()[equipment.id] ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const syncPreview = () => {
    setPreviewUrl(readEquipmentImageOverrides()[equipment.id] ?? '');
  };

  useEffect(() => {
    void refreshEquipmentImageOverrides().then(syncPreview);
    if (isAdminSession()) {
      void migrateLegacyEquipmentImagesToServer().then(result => {
        if (result.migrated > 0) {
          setMessage(`기존 로컬 이미지 ${result.migrated}개를 Supabase로 이전했습니다.`);
          syncPreview();
        }
      }).catch(error => setMessage(error instanceof Error ? error.message : '기존 이미지를 서버로 이전하지 못했습니다.'));
    }
  }, []);

  useEffect(() => {
    const syncAdmin = () => {
      const active = isAdminSession();
      setIsAdmin(active);
      if (active) {
        void migrateLegacyEquipmentImagesToServer().then(() => syncPreview())
          .catch(error => setMessage(error instanceof Error ? error.message : '기존 이미지를 서버로 이전하지 못했습니다.'));
      }
    };
    const syncImages = () => syncPreview();
    window.addEventListener(ADMIN_ACCESS_EVENT, syncAdmin);
    window.addEventListener(TRANSPORT_EQUIPMENT_EVENT, syncImages);
    window.addEventListener(EQUIPMENT_IMAGE_OVERRIDES_UPDATED_EVENT, syncImages);
    return () => {
      window.removeEventListener(ADMIN_ACCESS_EVENT, syncAdmin);
      window.removeEventListener(TRANSPORT_EQUIPMENT_EVENT, syncImages);
      window.removeEventListener(EQUIPMENT_IMAGE_OVERRIDES_UPDATED_EVENT, syncImages);
    };
  }, [equipment.id]);

  useEffect(() => {
    syncPreview();
  }, [equipment.id]);

  useEffect(() => {
    let frame = 0;
    let currentVisual: HTMLButtonElement | null = null;
    let currentToolbar: HTMLElement | null = null;
    let hiddenCard: HTMLElement | null = null;

    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const card = document.querySelector<HTMLElement>('.guided-equipment-stage>.guided-equipment-card.selected');
        if (card && card !== hiddenCard) {
          if (hiddenCard) hiddenCard.style.display = '';
          hiddenCard = card;
          hiddenCard.style.display = 'none';
        }

        const next = document.querySelector<HTMLButtonElement>('.guided-equipment-stage .guided-equipment-visual');
        if (next === currentVisual) return;
        currentToolbar?.remove();
        currentVisual = next;
        currentToolbar = null;
        setVisualHost(next);
        if (next) {
          next.style.position = 'relative';
          next.style.overflow = 'hidden';
          const toolbar = document.createElement('div');
          toolbar.className = 'guided-equipment-admin-toolbar-host';
          toolbar.style.margin = '-8px 0 16px';
          next.insertAdjacentElement('afterend', toolbar);
          currentToolbar = toolbar;
          setToolbarHost(toolbar);
        } else {
          setToolbarHost(null);
        }
      });
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      currentToolbar?.remove();
      if (hiddenCard) hiddenCard.style.display = '';
    };
  }, []);

  const upload = async (file: File | undefined) => {
    if (!file || !isAdmin) return;
    setBusy(true);
    try {
      const dataUrl = await prepareEquipmentImage(file);
      const next = await setEquipmentImageOverride(equipment.id, dataUrl);
      setPreviewUrl(next[equipment.id] ?? '');
      setMessage(`${equipment.shortName} 이미지를 저장했습니다. 이 미리보기와 장비 선택창에 즉시 적용됩니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '이미지를 변경하지 못했습니다.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const restore = async () => {
    if (!isAdmin) return;
    setBusy(true);
    try {
      await removeEquipmentImageOverride(equipment.id);
      setPreviewUrl('');
      setMessage(`${equipment.shortName} 업로드 이미지를 삭제하고 기본 그림으로 복원했습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '기본 그림으로 복원하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const preview = visualHost ? createPortal(
    previewUrl ? (
      <img
        className="equipment-custom-visual"
        src={previewUrl}
        alt={`${equipment.shortName} 적재공간`}
        draggable={false}
        onError={() => setPreviewUrl('')}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 60,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          background: '#fff',
          pointerEvents: 'none',
        }}
      />
    ) : equipment.category === 'container' ? (
      <span
        className="equipment-guided-default-photo"
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 60,
          display: 'block',
          pointerEvents: 'none',
          backgroundColor: '#fff',
          ...equipmentAtlasBackgroundStyle(equipment.id),
        }}
      />
    ) : null,
    visualHost,
  ) : null;

  if (!toolbarHost || !isAdmin) return preview;

  const buttonStyle = {
    padding: '7px 11px',
    border: '1px solid #cfd5dc',
    borderRadius: 8,
    background: '#fff',
    color: '#313841',
    fontSize: 11,
    fontWeight: 700,
    cursor: busy ? 'wait' : 'pointer',
    opacity: busy ? 0.65 : 1,
  } as const;

  const toolbar = createPortal(
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', padding: '9px 10px', border: '1px dashed #9fc4ec', borderRadius: 10, background: '#f7fbff' }} aria-label="현재 선택 적재공간 관리자 이미지 관리">
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event => void upload(event.target.files?.[0])} />
      <span style={{ marginRight: 'auto', color: '#46617c', fontSize: 11, fontWeight: 800 }}>현재 선택 적재공간 이미지 · 관리자</span>
      <button type="button" style={buttonStyle} disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? '처리 중…' : '이미지 업로드'}</button>
      {previewUrl && <button type="button" style={buttonStyle} disabled={busy} onClick={() => void restore()}>기본 그림 복원</button>}
      {message && <small style={{ flexBasis: '100%', color: '#66707a', fontSize: 10.5, textAlign: 'right' }}>{message}</small>}
    </div>,
    toolbarHost,
  );

  return <>{preview}{toolbar}</>;
}
