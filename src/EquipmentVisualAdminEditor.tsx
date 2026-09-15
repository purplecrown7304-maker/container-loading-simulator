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
import { resolveEquipmentImageUrl } from './equipmentImageUrl';
import { TRANSPORT_EQUIPMENT_EVENT, useTransportEquipment } from './transportEquipment';

export default function EquipmentVisualAdminEditor() {
  const equipment = useTransportEquipment();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isAdmin, setIsAdmin] = useState(() => isAdminSession());
  const [visualHost, setVisualHost] = useState<HTMLButtonElement | null>(null);
  const [toolbarHost, setToolbarHost] = useState<HTMLElement | null>(null);
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void refreshEquipmentImageOverrides();
    if (isAdminSession()) {
      void migrateLegacyEquipmentImagesToServer().then(result => {
        if (result.migrated > 0) setMessage(`기존 로컬 이미지 ${result.migrated}개를 Supabase로 이전했습니다.`);
      }).catch(error => setMessage(error instanceof Error ? error.message : '기존 이미지를 서버로 이전하지 못했습니다.'));
    }
  }, []);

  useEffect(() => {
    const syncAdmin = () => {
      const active = isAdminSession();
      setIsAdmin(active);
      if (active) {
        void migrateLegacyEquipmentImagesToServer().then(result => {
          if (result.migrated > 0) setMessage(`기존 로컬 이미지 ${result.migrated}개를 Supabase로 이전했습니다.`);
        }).catch(error => setMessage(error instanceof Error ? error.message : '기존 이미지를 서버로 이전하지 못했습니다.'));
      }
    };
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener(ADMIN_ACCESS_EVENT, syncAdmin);
    window.addEventListener(TRANSPORT_EQUIPMENT_EVENT, refresh);
    window.addEventListener(EQUIPMENT_IMAGE_OVERRIDES_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener(ADMIN_ACCESS_EVENT, syncAdmin);
      window.removeEventListener(TRANSPORT_EQUIPMENT_EVENT, refresh);
      window.removeEventListener(EQUIPMENT_IMAGE_OVERRIDES_UPDATED_EVENT, refresh);
    };
  }, []);

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
          const toolbar = document.createElement('div');
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

  useEffect(() => {
    if (!visualHost) return;

    const svg = visualHost.querySelector<SVGElement>('svg');
    visualHost.querySelector<HTMLImageElement>('img.equipment-custom-visual')?.remove();

    const clearBackground = () => {
      visualHost.style.backgroundImage = '';
      visualHost.style.backgroundRepeat = '';
      visualHost.style.backgroundPosition = '';
      visualHost.style.backgroundSize = '';
      visualHost.style.backgroundColor = '';
    };

    const showBuiltInFallback = () => {
      if (equipment.category === 'container') {
        const atlas = equipmentAtlasBackgroundStyle(equipment.id);
        visualHost.style.backgroundImage = String(atlas.backgroundImage ?? '');
        visualHost.style.backgroundRepeat = String(atlas.backgroundRepeat ?? 'no-repeat');
        visualHost.style.backgroundPosition = String(atlas.backgroundPosition ?? 'center');
        visualHost.style.backgroundSize = String(atlas.backgroundSize ?? 'contain');
        visualHost.style.backgroundColor = String(atlas.backgroundColor ?? 'transparent');
        if (svg) svg.style.display = 'none';
        return;
      }
      clearBackground();
      if (svg) svg.style.display = '';
    };

    const imageUrl = resolveEquipmentImageUrl(equipment.id, revision);
    const probe = new Image();
    let disposed = false;

    probe.onload = () => {
      if (disposed) return;
      visualHost.style.backgroundImage = `url("${imageUrl.replace(/"/g, '%22')}")`;
      visualHost.style.backgroundRepeat = 'no-repeat';
      visualHost.style.backgroundPosition = 'center';
      visualHost.style.backgroundSize = 'contain';
      visualHost.style.backgroundColor = 'transparent';
      if (svg) svg.style.display = 'none';
    };
    probe.onerror = () => {
      if (disposed) return;
      showBuiltInFallback();
    };
    probe.src = imageUrl;

    return () => {
      disposed = true;
      probe.onload = null;
      probe.onerror = null;
    };
  }, [visualHost, equipment.category, equipment.id, revision]);

  const upload = async (file: File | undefined) => {
    if (!file || !isAdmin) return;
    try {
      const dataUrl = await prepareEquipmentImage(file);
      await setEquipmentImageOverride(equipment.id, dataUrl);
      setMessage(`${equipment.shortName} 이미지를 Supabase에 저장했습니다. 유형 선택창과 적재공간 화면에 함께 적용됩니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '이미지를 변경하지 못했습니다.');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const restore = async () => {
    if (!isAdmin) return;
    const current = readEquipmentImageOverrides();
    if (!current[equipment.id]) return setMessage('현재 기본 그림을 사용 중입니다.');
    try {
      await removeEquipmentImageOverride(equipment.id);
      setMessage(`${equipment.shortName} 서버 이미지를 삭제하고 기본 그림으로 복원했습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '기본 그림으로 복원하지 못했습니다.');
    }
  };

  if (!toolbarHost || !isAdmin) return null;

  const buttonStyle = {
    padding: '6px 10px',
    border: '1px solid #cfd5dc',
    borderRadius: 8,
    background: '#fff',
    color: '#313841',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
  } as const;

  return createPortal(
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', padding: '8px 10px', border: '1px dashed #c9d0d8', borderRadius: 10, background: '#fafbfc' }} aria-label="관리자 적재공간 이미지 관리">
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event => void upload(event.target.files?.[0])} />
      <span style={{ marginRight: 'auto', color: '#6f7781', fontSize: 11, fontWeight: 700 }}>관리자 이미지 관리 · Supabase 서버 저장</span>
      <button type="button" style={buttonStyle} onClick={() => inputRef.current?.click()}>이미지 변경</button>
      <button type="button" style={buttonStyle} onClick={() => void restore()}>기본 그림 복원</button>
      {message && <small style={{ flexBasis: '100%', color: '#66707a', fontSize: 10.5, textAlign: 'right' }}>{message}</small>}
    </div>,
    toolbarHost,
  );
}
